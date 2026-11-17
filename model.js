(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FishDeskModel = factory();
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const LOG_KINDS = ['progress', 'completed', 'unknown'];
  const kindNames = { progress: '推进记录', completed: '完成成果', unknown: '未分类历史记录' };
  function day(value) {
    if (!value) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function kind(log) { return LOG_KINDS.includes(log.kind) ? log.kind : 'unknown'; }
  function projectId(name) { return `project-${encodeURIComponent(name)}`; }
  function projectsFor(tasks, saved = []) {
    const projects = saved.map(p => ({ ...p }));
    const names = new Set(projects.map(p => p.name));
    tasks.forEach(task => {
      const name = typeof task.project === 'string' && task.project.trim() ? task.project.trim() : '未分类项目';
      if (names.has(name)) return;
      names.add(name);
      projects.push({ id: projectId(name), name, goal: '', phase: '', status: 'active', completedAt: null,
        createdAt: task.createdAt || '', updatedAt: task.updatedAt || '' });
    });
    return projects;
  }
  function entriesFor(tasks, start, end) {
    return tasks.flatMap(task => (task.workLogs || []).filter(log => log.date >= start && log.date <= end)
      .map(log => ({ task, log, kind: kind(log) })))
      .sort((a, b) => b.log.date.localeCompare(a.log.date) || a.task.title.localeCompare(b.task.title, 'zh-CN'));
  }
  function snapshotAt(task, end, today) {
    const snapshots = [...(task.statusHistory || []), ...(task.workLogs || []).filter(log => log.snapshot).map(log => ({ ...log.snapshot, date: log.date }))]
      .filter(s => s.date <= end && s.date <= today)
      .sort((a, b) => a.date.localeCompare(b.date) || String(a.recordedAt || '').localeCompare(String(b.recordedAt || '')));
    if (snapshots.length) return snapshots[snapshots.length - 1];
    // Current values are valid for today, never for an earlier report period.
    if (end >= today && (!task.createdAt || day(task.createdAt) <= today)) {
      return { date: today, status: task.status, nextStep: task.nextStep || '', issue: task.issue || '' };
    }
    return null;
  }
  function report(tasks, start, end, today, projects = []) {
    const entries = entriesFor(tasks, start, end);
    const projectCompletions = projects.flatMap(project => {
      const events = Array.isArray(project.statusHistory) ? project.statusHistory.filter(event => event.status === 'completed') : [];
      const dates = events.length ? events.map(event => day(event.date)) : project.status === 'completed' ? [day(project.completedAt)] : [];
      return [...new Set(dates)].filter(date => date && date >= start && date <= end).map(date => ({ ...project, eventDate: date }));
    });
    const projectNames = [...new Set([...entries.map(e => e.task.project), ...projectCompletions.map(project => project.name)])];
    const followUps = [], risks = [];
    tasks.filter(task => projectNames.includes(task.project)).forEach(task => {
      const snapshot = snapshotAt(task, end, today);
      if (!snapshot || snapshot.status === 'done') return;
      if (snapshot.nextStep) followUps.push({ ...task, nextStep: snapshot.nextStep });
      if (snapshot.issue) risks.push({ ...task, issue: snapshot.issue });
    });
    return { entries, completed: entries.filter(e => e.kind === 'completed'), progress: entries.filter(e => e.kind === 'progress'),
      unknown: entries.filter(e => e.kind === 'unknown'), followUps, risks, projectNames,
      historical: end < today, projectCompletions };
  }
  function completedGroups(tasks, today, start = '', end = '') {
    const groups = new Map();
    tasks.filter(t => t.status === 'done').forEach(task => {
      const date = task.completedOn || day(task.completedAt);
      if (!date || (start && date < start) || (end && date > end)) return;
      if (!groups.has(date)) groups.set(date, []);
      groups.get(date).push(task);
    });
    return [...groups].sort(([a], [b]) => b.localeCompare(a)).map(([date, items]) => ({ date, tasks: items, today: date === today }));
  }
  return { day, kind, kindNames, projectId, projectsFor, entriesFor, snapshotAt, report, completedGroups };
});
