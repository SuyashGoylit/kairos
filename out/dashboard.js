"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDashboardHtml = buildDashboardHtml;
function fmtH(h) {
    if (h === 0)
        return '0h';
    if (h < 1)
        return `${Math.round(h * 60)}m`;
    return `${h % 1 === 0 ? h : h.toFixed(1)}h`;
}
function fmtDate(iso) {
    try {
        return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    }
    catch {
        return '';
    }
}
function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function statsGrid(s) {
    const cells = [
        ['Tasks scanned', String(s.count)],
        ['Avg effort', fmtH(s.avgHours)],
        ['Median', fmtH(s.medianHours)],
        ['P25 – P75', `${fmtH(s.p25Hours)} – ${fmtH(s.p75Hours)}`],
        ['Avg days', `${s.avgWorkingDays}d`],
        ['Median days', `${s.medianWorkingDays}d`],
        ['Avg commits', String(s.avgCommits)],
        ['Avg files Δ', String(s.avgFiles)],
    ];
    return `<div class="grid">${cells.map(([label, val]) => `<div class="card"><div class="card-label">${label}</div><div class="card-value">${val}</div></div>`).join('')}</div>`;
}
function estimateBox(e) {
    return `
  <div class="estimate">
    <div class="estimate-label">Estimate for your task</div>
    <div class="estimate-range">${fmtH(e.p25Hours)} – ${fmtH(e.p75Hours)}
      <span class="estimate-median">median ${fmtH(e.medianHours)}</span>
    </div>
    <div class="estimate-note">Based on ${e.matches.length} similar past task${e.matches.length !== 1 ? 's' : ''} (highlighted below)</div>
  </div>`;
}
const HASH_RE = /^[0-9a-f]{12}$/;
function tableRows(tasks, matchSet) {
    if (tasks.length === 0) {
        return `<tr><td colspan="10" class="empty">No tasks yet — run <strong>Kairos: Scan Git History</strong> to populate.</td></tr>`;
    }
    return tasks.map(t => {
        const mergeLabel = t.merged
            ? (t.mergeStyle === 'merge-commit' ? '✓ merge' : '✓ squash')
            : '—';
        const isUnknown = HASH_RE.test(t.branchName);
        const branchCell = isUnknown
            ? `<td class="mono unknown" title="${esc(t.mergeSubject ?? 'merge commit subject unavailable')}">? ${esc(t.branchName)}</td>`
            : `<td class="mono">${esc(t.branchName)}</td>`;
        return `
    <tr class="${matchSet.has(t.branchName) ? 'match' : ''}">
      ${branchCell}
      <td>${esc(t.label ?? '')}</td>
      <td class="tags">${esc((t.tags ?? []).join(', '))}</td>
      <td class="num">${t.workingDays}d</td>
      <td class="num bold">${fmtH(t.estimatedHours)}</td>
      <td class="num">${t.commitCount}</td>
      <td class="num">${t.filesChanged}</td>
      <td class="num">+${t.linesAdded} / −${t.linesRemoved}</td>
      <td>${mergeLabel}</td>
      <td>${fmtDate(t.startDate)}</td>
    </tr>`;
    }).join('');
}
function buildDashboardHtml(stats, tasks, nonce, estimate) {
    const matchSet = new Set(estimate?.matches.map(m => m.branchName) ?? []);
    const sorted = [...tasks].sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}';">
  <title>Kairos</title>
  <style nonce="${nonce}">
    *, *::before, *::after { box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 20px 24px 40px;
      margin: 0;
    }
    h1 { font-size: 1.25em; margin: 0 0 6px; letter-spacing: -0.01em; }
    .subtitle { color: var(--vscode-descriptionForeground); font-size: 0.85em; margin-bottom: 20px; }

    /* stats */
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
      gap: 10px;
      margin-bottom: 22px;
    }
    .card {
      background: var(--vscode-editorWidget-background, var(--vscode-sideBar-background));
      border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
      border-radius: 6px;
      padding: 10px 13px;
    }
    .card-label { font-size: 0.7em; text-transform: uppercase; letter-spacing: 0.07em; color: var(--vscode-descriptionForeground); margin-bottom: 5px; }
    .card-value { font-size: 1.25em; font-weight: 700; }

    /* estimate */
    .estimate {
      background: var(--vscode-inputValidation-infoBackground, rgba(0,120,215,0.12));
      border: 1px solid var(--vscode-inputValidation-infoBorder, rgba(0,120,215,0.5));
      border-radius: 6px;
      padding: 14px 18px;
      margin-bottom: 22px;
    }
    .estimate-label { font-size: 0.72em; text-transform: uppercase; letter-spacing: 0.07em; color: var(--vscode-descriptionForeground); margin-bottom: 4px; }
    .estimate-range { font-size: 1.55em; font-weight: 700; }
    .estimate-median { font-size: 0.6em; font-weight: 400; color: var(--vscode-descriptionForeground); margin-left: 8px; }
    .estimate-note { font-size: 0.82em; color: var(--vscode-descriptionForeground); margin-top: 5px; }

    /* table */
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 0.87em; min-width: 780px; }
    th {
      text-align: left; padding: 7px 10px;
      border-bottom: 2px solid var(--vscode-panel-border);
      color: var(--vscode-descriptionForeground); font-weight: 600;
      white-space: nowrap;
    }
    td { padding: 6px 10px; border-bottom: 1px solid var(--vscode-panel-border); max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    tr:hover td { background: var(--vscode-list-hoverBackground); }
    tr.match td { background: var(--vscode-editor-findMatchHighlightBackground, rgba(255,200,0,0.12)); }
    tr.match:hover td { background: var(--vscode-list-hoverBackground); }
    .mono { font-family: var(--vscode-editor-font-family, monospace); font-size: 0.88em; }
    .unknown { color: var(--vscode-descriptionForeground); cursor: help; }
    .tags { color: var(--vscode-descriptionForeground); font-size: 0.88em; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .bold { font-weight: 600; }
    .empty { text-align: center; padding: 32px; color: var(--vscode-descriptionForeground); }

    .note { font-size: 0.78em; color: var(--vscode-descriptionForeground); margin-top: 18px; }
  </style>
</head>
<body>
  <h1>⏱ Kairos</h1>
  <div class="subtitle">Effort history — durations are working days (Mon–Fri) × 8 h/day</div>
  ${estimate ? estimateBox(estimate) : ''}
  ${statsGrid(stats)}
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Branch</th>
          <th>Label</th>
          <th>Tags</th>
          <th style="text-align:right">Days</th>
          <th style="text-align:right">Est. Hours</th>
          <th style="text-align:right">Commits</th>
          <th style="text-align:right">Files</th>
          <th style="text-align:right">Lines +/−</th>
          <th>Merged</th>
          <th>Started</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows(sorted, matchSet)}
      </tbody>
    </table>
  </div>
  <div class="note">⚠ Historical hours are estimated from calendar dates, not tracked time. Active tracking coming in a future release.</div>
</body>
</html>`;
}
//# sourceMappingURL=dashboard.js.map