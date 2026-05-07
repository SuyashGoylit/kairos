# Changelog

## [0.0.1] – 2026-05-07

### Added
- **Scan Git History** — walks all merged branches on your main/develop branch, reconstructs per-branch metrics (working days, estimated hours, commits, files, lines changed) and saves to `.vscode/kairos-history.json`
- **Show Dashboard** — webview panel showing a stats grid and full task table; highlights matched tasks when an estimate is active
- **Estimate Task Effort** — describe a new task in plain text; finds the 5 most similar past tasks using Jaccard similarity and shows a P25–P75 hour range
- **Tag Current Branch** — add a human-friendly label and tags to any branch record to improve future estimates
- Status bar item `⏱ Kairos` that opens the dashboard
- Auto-detection of main branch (`develop`, `master`, `main`, `trunk`) and author email from `git config`
- Supports GitHub PR, Bitbucket, Azure DevOps, remote-tracking, and standard git merge commit formats
