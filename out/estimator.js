"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.estimateEffort = estimateEffort;
const stats_1 = require("./stats");
function tokenize(text) {
    return new Set(text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter(t => t.length > 1));
}
function jaccard(a, b) {
    let inter = 0;
    for (const t of a)
        if (b.has(t))
            inter++;
    const union = a.size + b.size - inter;
    return union === 0 ? 0 : inter / union;
}
function taskTokens(task) {
    return tokenize([task.branchName, task.label ?? '', ...(task.tags ?? [])].join(' '));
}
function estimateEffort(description, tasks) {
    if (tasks.length === 0)
        return null;
    const query = tokenize(description);
    const top5 = tasks
        .map(t => ({ task: t, score: jaccard(query, taskTokens(t)) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map(s => s.task);
    const stats = (0, stats_1.computeStats)(top5);
    return { p25Hours: stats.p25Hours, medianHours: stats.medianHours, p75Hours: stats.p75Hours, matches: top5 };
}
//# sourceMappingURL=estimator.js.map