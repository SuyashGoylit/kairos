import * as fs from 'fs';
import * as path from 'path';
import { EffortHistory } from './types';

export function readHistory(workspaceRoot: string, historyFile: string): EffortHistory {
  const filePath = path.join(workspaceRoot, historyFile);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as EffortHistory;
  } catch {
    return { version: '1', lastScanned: '', tasks: [] };
  }
}

export function writeHistory(workspaceRoot: string, historyFile: string, history: EffortHistory): void {
  const filePath = path.join(workspaceRoot, historyFile);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(history, null, 2), 'utf8');
}
