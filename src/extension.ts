import * as vscode from 'vscode';
import { scanBranches, getCurrentBranch, resolveMainBranch, getGitUserEmail } from './gitParser';
import { readHistory, writeHistory } from './storage';
import { computeStats } from './stats';
import { estimateEffort, EstimateResult } from './estimator';
import { buildDashboardHtml } from './dashboard';
import { TaskRecord } from './types';

let statusBarItem: vscode.StatusBarItem;
let currentPanel: vscode.WebviewPanel | undefined;
let currentEstimate: EstimateResult | undefined;

// ── Config ───────────────────────────────────────────────────────────────────

function cfg() {
  const c = vscode.workspace.getConfiguration('kairos');
  return {
    mainBranch:      c.get<string>('mainBranch', 'main'),
    historyFile:     c.get<string>('historyFile', '.vscode/kairos-history.json'),
    hoursPerDay:     c.get<number>('hoursPerDay', 8),
    ignorePrefixes:  c.get<string[]>('ignoreBranchPrefixes', ['dependabot/', 'release/', 'hotfix/']),
    authorEmail:     c.get<string>('authorEmail', ''),
  };
}

function root(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function nonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// ── Panel helpers ─────────────────────────────────────────────────────────────

function renderPanel(tasks: TaskRecord[], estimate?: EstimateResult): void {
  if (!currentPanel) return;
  currentPanel.webview.html = buildDashboardHtml(computeStats(tasks), tasks, nonce(), estimate);
}

function openOrFocus(workspaceRoot: string): void {
  const { historyFile } = cfg();
  const history = readHistory(workspaceRoot, historyFile);

  if (currentPanel) {
    currentPanel.reveal(vscode.ViewColumn.One);
    renderPanel(history.tasks, currentEstimate);
    return;
  }

  currentPanel = vscode.window.createWebviewPanel(
    'kairos', 'Kairos', vscode.ViewColumn.One,
    { enableScripts: false, retainContextWhenHidden: false }
  );
  renderPanel(history.tasks, currentEstimate);
  currentPanel.onDidDispose(() => { currentPanel = undefined; });
}

// ── Activate ──────────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
  // Status bar button
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.text = '⏱ Kairos';
  statusBarItem.tooltip = 'Open Kairos effort dashboard';
  statusBarItem.command = 'kairos.showDashboard';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // ── Scan Git History ────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('kairos.scanHistory', async () => {
      const wsRoot = root();
      if (!wsRoot) { vscode.window.showErrorMessage('No workspace folder open.'); return; }

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Kairos: scanning git history…', cancellable: false },
        async () => {
          const { mainBranch: configuredBranch, historyFile, hoursPerDay, ignorePrefixes, authorEmail: configuredEmail } = cfg();

          // Auto-detect main branch (handles master vs main vs trunk)
          const mainBranch = resolveMainBranch(wsRoot, configuredBranch);
          const branchNote = mainBranch !== configuredBranch ? ` (detected "${mainBranch}")` : '';

          // Auto-detect author email from git config if not overridden in settings
          const authorEmail = (configuredEmail.trim() || getGitUserEmail(wsRoot)).toLowerCase();

          // Preserve labels/tags/activeMinutes the user has already set
          const existing = readHistory(wsRoot, historyFile);
          const existingMap = new Map<string, Pick<TaskRecord, 'label' | 'tags' | 'activeMinutes'>>(
            existing.tasks.map(t => [t.branchName, { label: t.label, tags: t.tags, activeMinutes: t.activeMinutes }])
          );

          const tasks = scanBranches(wsRoot, mainBranch, ignorePrefixes, hoursPerDay, authorEmail, existingMap);
          writeHistory(wsRoot, historyFile, { version: '1', lastScanned: new Date().toISOString(), tasks });
          renderPanel(tasks, currentEstimate);

          if (tasks.length === 0) {
            vscode.window.showWarningMessage(
              `Kairos: no branches found${branchNote}. Make sure you're in a git repo with feature branches off "${mainBranch}".`
            );
          } else {
            vscode.window.showInformationMessage(
              `Kairos: found ${tasks.length} branch${tasks.length !== 1 ? 'es' : ''}${branchNote}. Saved to ${historyFile}.`
            );
          }
        }
      );
    })
  );

  // ── Show Dashboard ──────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('kairos.showDashboard', () => {
      const wsRoot = root();
      if (!wsRoot) { vscode.window.showErrorMessage('No workspace folder open.'); return; }
      openOrFocus(wsRoot);
    })
  );

  // ── Estimate Task Effort ────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('kairos.estimateTask', async () => {
      const wsRoot = root();
      if (!wsRoot) { vscode.window.showErrorMessage('No workspace folder open.'); return; }

      const description = await vscode.window.showInputBox({
        prompt: 'Describe the task you want to estimate',
        placeHolder: 'e.g. Add OAuth2 login with Google',
      });
      if (!description) return;

      const { historyFile } = cfg();
      const history = readHistory(wsRoot, historyFile);
      if (history.tasks.length === 0) {
        vscode.window.showWarningMessage('No history yet. Run "Kairos: Scan Git History" first.');
        return;
      }

      currentEstimate = estimateEffort(description, history.tasks) ?? undefined;
      if (!currentEstimate) { vscode.window.showWarningMessage('Could not compute estimate.'); return; }

      const e = currentEstimate;
      const msg = `Estimate: ${fmtH(e.p25Hours)} – ${fmtH(e.p75Hours)}  (median ${fmtH(e.medianHours)}) — ${e.matches.length} similar task${e.matches.length !== 1 ? 's' : ''}`;
      vscode.window.showInformationMessage(msg, 'Show Dashboard').then(action => {
        if (action === 'Show Dashboard') openOrFocus(wsRoot);
      });
      openOrFocus(wsRoot);
    })
  );

  // ── Tag Current Branch ──────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('kairos.tagBranch', async () => {
      const wsRoot = root();
      if (!wsRoot) { vscode.window.showErrorMessage('No workspace folder open.'); return; }

      const branch = getCurrentBranch(wsRoot);
      if (!branch || branch === 'HEAD') {
        vscode.window.showErrorMessage('Could not determine current branch.');
        return;
      }

      const { historyFile } = cfg();
      const history = readHistory(wsRoot, historyFile);
      const task = history.tasks.find(t => t.branchName === branch);
      if (!task) {
        vscode.window.showWarningMessage(`"${branch}" not found in history. Run scan first.`);
        return;
      }

      const label = await vscode.window.showInputBox({
        prompt: 'Human-friendly label',
        value: task.label ?? '',
        placeHolder: 'e.g. OAuth2 login',
      });
      if (label === undefined) return;

      const tagsRaw = await vscode.window.showInputBox({
        prompt: 'Comma-separated tags',
        value: (task.tags ?? []).join(', '),
        placeHolder: 'e.g. auth, backend',
      });
      if (tagsRaw === undefined) return;

      task.label = label.trim() || undefined;
      task.tags  = tagsRaw ? tagsRaw.split(',').map(s => s.trim()).filter(Boolean) : undefined;

      writeHistory(wsRoot, historyFile, history);
      renderPanel(history.tasks, currentEstimate);
      vscode.window.showInformationMessage(`Kairos: tagged "${branch}".`);
    })
  );
}

function fmtH(h: number): string {
  if (h === 0) return '0h';
  if (h < 1)   return `${Math.round(h * 60)}m`;
  return `${h % 1 === 0 ? h : h.toFixed(1)}h`;
}

export function deactivate(): void {
  statusBarItem?.dispose();
}
