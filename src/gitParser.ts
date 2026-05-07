import { spawnSync } from 'child_process';
import { TaskRecord, MergeStyle } from './types';

// ── git helpers ──────────────────────────────────────────────────────────────

function git(args: string[], cwd: string): string {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 15_000 });
  if (r.error || r.status !== 0 || r.signal) return '';
  return String(r.stdout || '').trim();
}

// ── Working-days duration (Mon–Fri, local timezone) ──────────────────────────

export function workingDaysBetween(start: Date, end: Date): number {
  let days = 0;
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const endMark = new Date(end);
  endMark.setHours(23, 59, 59, 999);
  while (cur <= endMark) {
    const dow = cur.getDay();
    if (dow >= 1 && dow <= 5) days++;
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

// ── Extract branch name from a merge-commit subject line ─────────────────────
// Returns { name, matched } — matched=false means we fell back to a hash.

function extractBranchName(subject: string, fallbackHash: string): { name: string; matched: boolean } {
  // GitHub: "Merge pull request #N from org/branch-name"
  const gh = subject.match(/Merge pull request #\d+ from [^/]+\/(.+)/);
  if (gh) return { name: gh[1].trim(), matched: true };

  // Bitbucket: "Merged in branch-name (pull request #N)"
  const bb = subject.match(/^Merged in ([^\s(]+)/);
  if (bb) return { name: bb[1].trim(), matched: true };

  // Azure DevOps: "Merged PR 123: branch-name" or "Merged PR 123: title"
  const ado = subject.match(/^Merged PR \d+: (.+)/);
  if (ado) return { name: ado[1].trim(), matched: true };

  // Remote-tracking: "Merge remote-tracking branch 'origin/feature/x' [into ...]"
  // This is what git produces for `git merge origin/feature-x`
  const rt = subject.match(/Merge remote-tracking branch ['"](?:[^/'"]+\/)?([^'"]+)['"]/);
  if (rt) return { name: rt[1].trim(), matched: true };

  // Standard git: "Merge branch 'feature/x' [into develop]"
  const std = subject.match(/Merge branch ['"]([^'"]+)['"]/);
  if (std) return { name: std[1].trim(), matched: true };

  return { name: fallbackHash.slice(0, 12), matched: false };
}

// ── Diff stats helper ────────────────────────────────────────────────────────

function diffStats(base: string, tip: string, cwd: string): { files: number; added: number; removed: number } {
  const raw = git(['diff', base, tip, '--numstat'], cwd);
  let files = 0, added = 0, removed = 0;
  for (const line of raw.split('\n').filter(Boolean)) {
    const parts = line.split('\t');
    if (parts.length >= 3) {
      files++;
      const a = parseInt(parts[0], 10), r = parseInt(parts[1], 10);
      if (!isNaN(a)) added   += a;
      if (!isNaN(r)) removed += r;
    }
  }
  return { files, added, removed };
}

// ── Resolve the actual main/trunk branch name ────────────────────────────────

export function resolveMainBranch(cwd: string, configured: string): string {
  const exists = (name: string) => !!git(['rev-parse', '--verify', name], cwd);
  if (exists(configured)) return configured;

  // Ask the remote which branch it treats as default
  const remoteHead = git(['symbolic-ref', 'refs/remotes/origin/HEAD'], cwd);
  if (remoteHead) {
    const remote = remoteHead.replace('refs/remotes/origin/', '');
    if (remote && exists(remote)) return remote;
  }

  // Common fallbacks — develop first for gitflow shops
  for (const c of ['develop', 'master', 'main', 'trunk']) {
    if (c !== configured && exists(c)) return c;
  }
  return configured;
}

// ── Author identity ──────────────────────────────────────────────────────────

export function getGitUserEmail(cwd: string): string {
  return git(['config', 'user.email'], cwd).toLowerCase();
}

// ── Public helpers ───────────────────────────────────────────────────────────

export function getCurrentBranch(cwd: string): string {
  return git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
}

// ── Main scanner ─────────────────────────────────────────────────────────────
//
// Two-pass strategy:
//   Pass 1 – walk merge commits on mainBranch and reconstruct each feature
//            branch from its second parent. Captures branches that were merged
//            then auto-deleted (the common case).
//   Pass 2 – walk current local branches for anything not yet merged (active
//            work-in-progress branches).

export function scanBranches(
  cwd: string,
  mainBranch: string,
  ignorePrefixes: string[],
  hoursPerDay: number,
  authorEmail: string,
  existingTasks: Map<string, Pick<TaskRecord, 'label' | 'tags' | 'activeMinutes'>>
): TaskRecord[] {
  const MAX_DAYS = 30;
  const taskMap = new Map<string, TaskRecord>();

  // ── Pass 1: reconstruct from merge history ──────────────────────────────
  // Format: hash NUL date NUL parents NUL subject
  const mergeLog = git(['log', mainBranch, '--merges', '--format=%H%x00%aI%x00%P%x00%s'], cwd);

  for (const line of mergeLog.split('\n').filter(Boolean)) {
    const parts = line.split('\x00');
    const mergeHash  = parts[0]?.trim() ?? '';
    const mergeDate  = parts[1]?.trim() ?? '';
    const parentsStr = parts[2]?.trim() ?? '';
    const subject    = parts[3]?.trim() ?? '';

    if (!mergeHash || !mergeDate || !parentsStr) continue;

    const parents = parentsStr.split(' ').filter(Boolean);
    if (parents.length < 2) continue;          // not a real merge commit

    const mainParent = parents[0];
    const branchTip  = parents[1];
    const { name: branchName, matched } = extractBranchName(subject, branchTip);

    if (ignorePrefixes.some(p => branchName.startsWith(p))) continue;
    if (taskMap.has(branchName)) continue;     // already captured

    // Skip branches not started by this user (first commit author check)
    if (authorEmail) {
      const firstAuthor = git(['log', '--reverse', branchTip, `^${mainParent}`, '--format=%ae', '--max-count=1'], cwd);
      if (firstAuthor.toLowerCase() !== authorEmail) continue;
    }

    // Commits that belong exclusively to this branch
    const timesRaw = git(['log', '--reverse', branchTip, `^${mainParent}`, '--format=%aI'], cwd);
    const times = timesRaw.split('\n').filter(Boolean);
    if (times.length === 0) continue;

    const startDate = new Date(times[0]);
    const endDate   = new Date(mergeDate);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) continue;

    const workingDays    = Math.min(workingDaysBetween(startDate, endDate), MAX_DAYS);
    const estimatedHours = Math.round(workingDays * hoursPerDay * 10) / 10;
    const stats          = diffStats(mainParent, branchTip, cwd);
    const existing       = existingTasks.get(branchName);

    taskMap.set(branchName, {
      branchName,
      label:         existing?.label,
      tags:          existing?.tags,
      activeMinutes: existing?.activeMinutes,
      startDate:     startDate.toISOString(),
      endDate:       endDate.toISOString(),
      workingDays,
      estimatedHours,
      merged:        true,
      mergeStyle:    'merge-commit',
      mergeSubject:  matched ? undefined : subject,
      commitCount:   times.length,
      filesChanged:  stats.files,
      linesAdded:    stats.added,
      linesRemoved:  stats.removed,
    });
  }

  // ── Pass 2: active local branches not yet in the merge history ───────────
  const localOut  = git(['branch', '--format=%(refname:short)'], cwd);
  const mergedOut = git(['branch', '--merged', mainBranch, '--format=%(refname:short)'], cwd);
  const mergedSet = new Set(mergedOut.split('\n').map(b => b.trim()).filter(Boolean));

  for (const branch of localOut.split('\n').map(b => b.trim()).filter(Boolean)) {
    if (branch === mainBranch) continue;
    if (ignorePrefixes.some(p => branch.startsWith(p))) continue;
    if (taskMap.has(branch)) continue;         // merge history already got it

    const mergeBase = git(['merge-base', mainBranch, branch], cwd);
    if (!mergeBase) continue;

    if (authorEmail) {
      const firstAuthor = git(['log', '--reverse', branch, `^${mergeBase}`, '--format=%ae', '--max-count=1'], cwd);
      if (firstAuthor.toLowerCase() !== authorEmail) continue;
    }

    const hashesRaw = git(['log', '--reverse', branch, `^${mergeBase}`, '--format=%H'], cwd);
    const timesRaw  = git(['log', '--reverse', branch, `^${mergeBase}`, '--format=%aI'], cwd);
    const hashes = hashesRaw.split('\n').filter(Boolean);
    const times  = timesRaw.split('\n').filter(Boolean);
    if (hashes.length === 0 || times.length === 0) continue;

    const startDate = new Date(times[0]);
    const endDate   = new Date(times[times.length - 1]);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) continue;

    const isMerged: boolean   = mergedSet.has(branch);
    const mergeStyle: MergeStyle = isMerged ? 'squash' : 'unknown';
    const workingDays    = Math.min(workingDaysBetween(startDate, endDate), MAX_DAYS);
    const estimatedHours = Math.round(workingDays * hoursPerDay * 10) / 10;
    const stats          = diffStats(mergeBase, branch, cwd);
    const existing       = existingTasks.get(branch);

    taskMap.set(branch, {
      branchName:    branch,
      label:         existing?.label,
      tags:          existing?.tags,
      activeMinutes: existing?.activeMinutes,
      startDate:     startDate.toISOString(),
      endDate:       endDate.toISOString(),
      workingDays,
      estimatedHours,
      merged:        isMerged,
      mergeStyle,
      commitCount:   hashes.length,
      filesChanged:  stats.files,
      linesAdded:    stats.added,
      linesRemoved:  stats.removed,
    });
  }

  return Array.from(taskMap.values());
}
