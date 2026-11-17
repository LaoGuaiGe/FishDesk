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
  function validDay(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T12:00:00`);
    return !Number.isNaN(date.getTime()) && day(date.toISOString()) === value;
  }
  function completionInfo(task) {
    if (validDay(task.completedOn)) return { date: task.completedOn, source: 'specified' };
    return { date: day(task.completedAt), source: 'marked' };
  }
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
    if (end >= today && (!task.createdAt || day(task.createdAt) <= today)) {
      return { date: today, status: task.status, nextStep: task.nextStep || '', issue: task.issue || '' };
    }
    const snapshots = [...(task.statusHistory || []), ...(task.workLogs || []).filter(log => log.snapshot).map(log => ({ ...log.snapshot,
      date: log.snapshot.status === 'done' && validDay(log.snapshot.completedOn || log.completedOn) ? log.snapshot.completedOn || log.completedOn : log.date }))]
      .filter(s => s.date <= end && s.date <= today)
      .sort((a, b) => a.date.localeCompare(b.date) || String(a.recordedAt || '').localeCompare(String(b.recordedAt || '')));
    if (snapshots.length) return snapshots[snapshots.length - 1];
    return null;
  }
  function report(tasks, start, end, today, projects = []) {
    const entries = tasks.flatMap(task => (task.workLogs || []).map(log => {
      const recordKind = kind(log);
      const reportDate = recordKind === 'completed' && validDay(log.completedOn) ? log.completedOn : log.date;
      return { task, kind: recordKind, log: { ...log, date: reportDate, workDate: log.date } };
    }).filter(entry => entry.log.date >= start && entry.log.date <= end))
      .sort((a, b) => b.log.date.localeCompare(a.log.date) || a.task.title.localeCompare(b.task.title, 'zh-CN'));
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
      const date = completionInfo(task).date;
      if (!date || (start && date < start) || (end && date > end)) return;
      if (!groups.has(date)) groups.set(date, []);
      groups.get(date).push(task);
    });
    return [...groups].sort(([a], [b]) => b.localeCompare(a)).map(([date, items]) => ({ date, tasks: items, today: date === today }));
  }
  function monthActivity(tasks, month, today) {
    if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return [];
    const [year, number] = month.split('-').map(Number);
    const length = new Date(year, number, 0).getDate();
    return activityValues(tasks, Array.from({ length }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`), today);
  }
  function activityValues(tasks, dates, today) {
    const values = dates.map(date => ({ date, records: 0, ended: new Set(), recordedTasks: new Set() }));
    const byDate = new Map(values.map(value => [value.date, value]));
    const finish = (id, date) => { const value = byDate.get(date); if (value && date <= today) value.ended.add(id); };
    tasks.forEach(task => {
      (task.workLogs || []).forEach(log => {
        const value = byDate.get(log.date);
        if (value && log.date <= today && typeof log.content === 'string' && log.content.trim()) {
          value.records++; value.recordedTasks.add(task.id);
        }
        if (kind(log) === 'completed') finish(task.id, validDay(log.completedOn) ? log.completedOn : log.date);
      });
      if (task.status === 'done') finish(task.id, completionInfo(task).date);
    });
    return values.map(value => {
      const score = value.records + [...value.ended].filter(id => !value.recordedTasks.has(id)).length;
      return { date: value.date, records: value.records, completed: value.ended.size, score,
        level: score === 0 ? 0 : score === 1 ? 1 : score <= 3 ? 2 : score <= 6 ? 3 : 4, future: value.date > today };
    });
  }
  function contributionYear(tasks, year, today) {
    const current = Number(today.slice(0, 4));
    if (!Number.isInteger(year) || year < 1900 || year > current) return null;
    const start = new Date(`${year}-01-01T12:00:00`);
    const end = new Date(`${year}-12-31T12:00:00`);
    const dates = [];
    for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) dates.push(day(date.toISOString()));
    const values = activityValues(tasks, dates, today);
    const byDate = new Map(values.map(value => [value.date, value]));
    const gridStart = new Date(start); gridStart.setDate(gridStart.getDate() - gridStart.getDay());
    const gridEnd = new Date(end); gridEnd.setDate(gridEnd.getDate() + 6 - gridEnd.getDay());
    const cells = [];
    for (let date = new Date(gridStart); date <= gridEnd; date.setDate(date.getDate() + 1)) {
      const key = day(date.toISOString());
      cells.push(byDate.get(key) || { date: key, outside: true });
    }
    const months = [];
    values.forEach((value, index) => {
      if (index === 0 || value.date.endsWith('-01')) {
        const position = cells.findIndex(cell => cell.date === value.date);
        months.push({ label: `${Number(value.date.slice(5, 7))}月`, column: Math.floor(position / 7) + 1 });
      }
    });
    return { start: dates[0], end: dates.at(-1), days: values, cells, months, weeks: cells.length / 7,
      total: values.reduce((sum, value) => sum + value.score, 0), records: values.reduce((sum, value) => sum + value.records, 0),
      completed: values.reduce((sum, value) => sum + value.completed, 0) };
  }
  return { day, kind, validDay, completionInfo, kindNames, projectId, projectsFor, entriesFor, snapshotAt, report, completedGroups, monthActivity, contributionYear };
});
