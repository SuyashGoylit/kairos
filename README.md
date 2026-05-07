# Kairos – Effort Tracker

> Tell your PM how long the next task will take — and actually mean it.

Kairos learns from your real coding history. It scans your git branches, measures how long each one took in **working days**, and uses that to estimate how long a new task will take when you describe it in plain text.

---

## How it works

- **One branch = one task.** Kairos scans every feature branch you've ever merged.
- **Duration = working days × 8 h/day.** From the first commit on a branch to the merge commit (or last commit if unmerged). Weekends don't count.
- **Your branches only.** Filtered to commits where the author email matches your `git config user.email`.
- **Works even after branches are deleted.** Reconstructs history from merge commits on your main/develop branch.
- **History is local.** Saved to `.vscode/kairos-history.json` in your workspace — never sent anywhere.

---

## Commands

Open the command palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and type **Kairos**:

| Command | What it does |
|---------|-------------|
| `Kairos: Scan Git History` | Walks all merge commits, extracts per-branch metrics, saves to history file |
| `Kairos: Show Dashboard` | Opens a webview with a stats grid and full task table |
| `Kairos: Estimate Task Effort` | Describe a task → get a P25–P75 hour range based on similar past tasks |
| `Kairos: Tag Current Branch` | Add a human-friendly label and tags to the current branch |

The **⏱ Kairos** item in the status bar opens the dashboard directly.

---

## Getting started

1. Open any project that has a git history with feature branches
2. Run **Kairos: Scan Git History** — takes a few seconds depending on repo size
3. Run **Kairos: Show Dashboard** to see your history
4. Next time a PM asks for an estimate: run **Kairos: Estimate Task Effort**, describe the work, done

---

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `kairos.mainBranch` | `"main"` | Main/trunk branch name. Auto-detected if not found (tries `develop`, `master`, `main`, `trunk`) |
| `kairos.historyFile` | `".vscode/kairos-history.json"` | Where to store the history file |
| `kairos.hoursPerDay` | `8` | Working hours per day for hour conversion |
| `kairos.ignoreBranchPrefixes` | `["dependabot/", "release/", "hotfix/"]` | Branch prefixes to skip |
| `kairos.authorEmail` | `""` | Your git author email. Auto-detected from `git config user.email` if blank |

---

## How estimation works

When you describe a task, Kairos tokenises your description and computes [Jaccard similarity](https://en.wikipedia.org/wiki/Jaccard_index) against the branch name, label, and tags of every past task. The top 5 matches are used to produce a **P25–P75 hour range** and a median.

To get better estimates over time: use **Tag Current Branch** to add descriptive labels and tags to your branches after you finish them.

---

## Known limitations

- **Squash merges** with non-standard commit messages may appear with a hash as the branch name instead of the real name. Hover over them in the dashboard to see the raw merge commit subject, then use **Tag Current Branch** to give them a proper label.
- **Active time tracking** (tracking actual VS Code focus time per branch) is not yet implemented — durations are calendar-based estimates only.
- The estimator uses simple token overlap. The more branches you have labelled and tagged, the better it gets.

---

## Before publishing

Replace `your-publisher-id` in `package.json` with your Marketplace publisher ID, add a 128×128 `icon.png`, then run:

```bash
npm run package   # creates kairos-x.x.x.vsix
npm run publish   # publishes to Marketplace
```
