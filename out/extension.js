"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const gitParser_1 = require("./gitParser");
const storage_1 = require("./storage");
const stats_1 = require("./stats");
const estimator_1 = require("./estimator");
const dashboard_1 = require("./dashboard");
let statusBarItem;
let currentPanel;
let currentEstimate;
// ── Config ───────────────────────────────────────────────────────────────────
function cfg() {
    const c = vscode.workspace.getConfiguration('kairos');
    return {
        mainBranch: c.get('mainBranch', 'main'),
        historyFile: c.get('historyFile', '.vscode/kairos-history.json'),
        hoursPerDay: c.get('hoursPerDay', 8),
        ignorePrefixes: c.get('ignoreBranchPrefixes', ['dependabot/', 'release/', 'hotfix/']),
        authorEmail: c.get('authorEmail', ''),
    };
}
function root() {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}
function nonce() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
// ── Panel helpers ─────────────────────────────────────────────────────────────
function renderPanel(tasks, estimate) {
    if (!currentPanel)
        return;
    currentPanel.webview.html = (0, dashboard_1.buildDashboardHtml)((0, stats_1.computeStats)(tasks), tasks, nonce(), estimate);
}
function openOrFocus(workspaceRoot) {
    const { historyFile } = cfg();
    const history = (0, storage_1.readHistory)(workspaceRoot, historyFile);
    if (currentPanel) {
        currentPanel.reveal(vscode.ViewColumn.One);
        renderPanel(history.tasks, currentEstimate);
        return;
    }
    currentPanel = vscode.window.createWebviewPanel('kairos', 'Kairos', vscode.ViewColumn.One, { enableScripts: false, retainContextWhenHidden: false });
    renderPanel(history.tasks, currentEstimate);
    currentPanel.onDidDispose(() => { currentPanel = undefined; });
}
// ── Activate ──────────────────────────────────────────────────────────────────
function activate(context) {
    // Status bar button
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.text = '⏱ Kairos';
    statusBarItem.tooltip = 'Open Kairos effort dashboard';
    statusBarItem.command = 'kairos.showDashboard';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);
    // ── Scan Git History ────────────────────────────────────────────────────
    context.subscriptions.push(vscode.commands.registerCommand('kairos.scanHistory', async () => {
        const wsRoot = root();
        if (!wsRoot) {
            vscode.window.showErrorMessage('No workspace folder open.');
            return;
        }
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Kairos: scanning git history…', cancellable: false }, async () => {
            const { mainBranch: configuredBranch, historyFile, hoursPerDay, ignorePrefixes, authorEmail: configuredEmail } = cfg();
            // Auto-detect main branch (handles master vs main vs trunk)
            const mainBranch = (0, gitParser_1.resolveMainBranch)(wsRoot, configuredBranch);
            const branchNote = mainBranch !== configuredBranch ? ` (detected "${mainBranch}")` : '';
            // Auto-detect author email from git config if not overridden in settings
            const authorEmail = (configuredEmail.trim() || (0, gitParser_1.getGitUserEmail)(wsRoot)).toLowerCase();
            // Preserve labels/tags/activeMinutes the user has already set
            const existing = (0, storage_1.readHistory)(wsRoot, historyFile);
            const existingMap = new Map(existing.tasks.map(t => [t.branchName, { label: t.label, tags: t.tags, activeMinutes: t.activeMinutes }]));
            const tasks = (0, gitParser_1.scanBranches)(wsRoot, mainBranch, ignorePrefixes, hoursPerDay, authorEmail, existingMap);
            (0, storage_1.writeHistory)(wsRoot, historyFile, { version: '1', lastScanned: new Date().toISOString(), tasks });
            renderPanel(tasks, currentEstimate);
            if (tasks.length === 0) {
                vscode.window.showWarningMessage(`Kairos: no branches found${branchNote}. Make sure you're in a git repo with feature branches off "${mainBranch}".`);
            }
            else {
                vscode.window.showInformationMessage(`Kairos: found ${tasks.length} branch${tasks.length !== 1 ? 'es' : ''}${branchNote}. Saved to ${historyFile}.`);
            }
        });
    }));
    // ── Show Dashboard ──────────────────────────────────────────────────────
    context.subscriptions.push(vscode.commands.registerCommand('kairos.showDashboard', () => {
        const wsRoot = root();
        if (!wsRoot) {
            vscode.window.showErrorMessage('No workspace folder open.');
            return;
        }
        openOrFocus(wsRoot);
    }));
    // ── Estimate Task Effort ────────────────────────────────────────────────
    context.subscriptions.push(vscode.commands.registerCommand('kairos.estimateTask', async () => {
        const wsRoot = root();
        if (!wsRoot) {
            vscode.window.showErrorMessage('No workspace folder open.');
            return;
        }
        const description = await vscode.window.showInputBox({
            prompt: 'Describe the task you want to estimate',
            placeHolder: 'e.g. Add OAuth2 login with Google',
        });
        if (!description)
            return;
        const { historyFile } = cfg();
        const history = (0, storage_1.readHistory)(wsRoot, historyFile);
        if (history.tasks.length === 0) {
            vscode.window.showWarningMessage('No history yet. Run "Kairos: Scan Git History" first.');
            return;
        }
        currentEstimate = (0, estimator_1.estimateEffort)(description, history.tasks) ?? undefined;
        if (!currentEstimate) {
            vscode.window.showWarningMessage('Could not compute estimate.');
            return;
        }
        const e = currentEstimate;
        const msg = `Estimate: ${fmtH(e.p25Hours)} – ${fmtH(e.p75Hours)}  (median ${fmtH(e.medianHours)}) — ${e.matches.length} similar task${e.matches.length !== 1 ? 's' : ''}`;
        vscode.window.showInformationMessage(msg, 'Show Dashboard').then(action => {
            if (action === 'Show Dashboard')
                openOrFocus(wsRoot);
        });
        openOrFocus(wsRoot);
    }));
    // ── Tag Current Branch ──────────────────────────────────────────────────
    context.subscriptions.push(vscode.commands.registerCommand('kairos.tagBranch', async () => {
        const wsRoot = root();
        if (!wsRoot) {
            vscode.window.showErrorMessage('No workspace folder open.');
            return;
        }
        const branch = (0, gitParser_1.getCurrentBranch)(wsRoot);
        if (!branch || branch === 'HEAD') {
            vscode.window.showErrorMessage('Could not determine current branch.');
            return;
        }
        const { historyFile } = cfg();
        const history = (0, storage_1.readHistory)(wsRoot, historyFile);
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
        if (label === undefined)
            return;
        const tagsRaw = await vscode.window.showInputBox({
            prompt: 'Comma-separated tags',
            value: (task.tags ?? []).join(', '),
            placeHolder: 'e.g. auth, backend',
        });
        if (tagsRaw === undefined)
            return;
        task.label = label.trim() || undefined;
        task.tags = tagsRaw ? tagsRaw.split(',').map(s => s.trim()).filter(Boolean) : undefined;
        (0, storage_1.writeHistory)(wsRoot, historyFile, history);
        renderPanel(history.tasks, currentEstimate);
        vscode.window.showInformationMessage(`Kairos: tagged "${branch}".`);
    }));
}
function fmtH(h) {
    if (h === 0)
        return '0h';
    if (h < 1)
        return `${Math.round(h * 60)}m`;
    return `${h % 1 === 0 ? h : h.toFixed(1)}h`;
}
function deactivate() {
    statusBarItem?.dispose();
}
//# sourceMappingURL=extension.js.map