import { TaskRecord } from './types';
import { computeStats } from './stats';

export interface EstimateResult {
  p25Hours: number;
  medianHours: number;
  p75Hours: number;
  matches: TaskRecord[];
}

function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter(t => t.length > 1)
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function taskTokens(task: TaskRecord): Set<string> {
  return tokenize([task.branchName, task.label ?? '', ...(task.tags ?? [])].join(' '));
}

export function estimateEffort(description: string, tasks: TaskRecord[]): EstimateResult | null {
  if (tasks.length === 0) return null;
  const query = tokenize(description);
  const top5 = tasks
    .map(t => ({ task: t, score: jaccard(query, taskTokens(t)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(s => s.task);

  const stats = computeStats(top5);
  return { p25Hours: stats.p25Hours, medianHours: stats.medianHours, p75Hours: stats.p75Hours, matches: top5 };
}
