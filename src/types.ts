export type MergeStyle = 'merge-commit' | 'squash' | 'unknown';

export interface TaskRecord {
  branchName: string;
  label?: string;
  tags?: string[];

  // ── Historical data (git-derived) ──────────────────────────────────────
  // First commit on the branch that diverges from main
  startDate: string;           // ISO 8601
  // Merge commit date if merged, otherwise last commit date
  endDate: string;             // ISO 8601
  // Mon–Fri days between startDate and endDate (inclusive)
  workingDays: number;
  // workingDays × hoursPerDay (from settings)
  estimatedHours: number;

  merged: boolean;
  mergeStyle: MergeStyle;
  // Raw merge commit subject — populated when branch name had to be inferred
  mergeSubject?: string;

  commitCount: number;
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;

  // ── Active-time tracking (Phase 2 – not yet populated) ─────────────────
  // Total minutes VS Code was active on this branch
  activeMinutes?: number;
}

export interface EffortHistory {
  version: string;
  lastScanned: string;         // ISO 8601
  tasks: TaskRecord[];
}
