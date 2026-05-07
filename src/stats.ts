import { TaskRecord } from './types';

export interface Stats {
  count: number;
  // hours-based
  avgHours: number;
  medianHours: number;
  p25Hours: number;
  p75Hours: number;
  // day-based
  avgWorkingDays: number;
  medianWorkingDays: number;
  // activity
  avgCommits: number;
  avgFiles: number;
  avgLinesAdded: number;
  avgLinesRemoved: number;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const idx = (p / 100) * (s.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function computeStats(tasks: TaskRecord[]): Stats {
  if (tasks.length === 0) {
    return { count: 0, avgHours: 0, medianHours: 0, p25Hours: 0, p75Hours: 0, avgWorkingDays: 0, medianWorkingDays: 0, avgCommits: 0, avgFiles: 0, avgLinesAdded: 0, avgLinesRemoved: 0 };
  }
  const hours = tasks.map(t => t.estimatedHours);
  const days  = tasks.map(t => t.workingDays);
  return {
    count:            tasks.length,
    avgHours:         r1(mean(hours)),
    medianHours:      r1(percentile(hours, 50)),
    p25Hours:         r1(percentile(hours, 25)),
    p75Hours:         r1(percentile(hours, 75)),
    avgWorkingDays:   r1(mean(days)),
    medianWorkingDays: r1(percentile(days, 50)),
    avgCommits:       r1(mean(tasks.map(t => t.commitCount))),
    avgFiles:         r1(mean(tasks.map(t => t.filesChanged))),
    avgLinesAdded:    Math.round(mean(tasks.map(t => t.linesAdded))),
    avgLinesRemoved:  Math.round(mean(tasks.map(t => t.linesRemoved))),
  };
}
