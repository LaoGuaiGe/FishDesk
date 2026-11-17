'use strict';

let projectView = 'active';
let projectTab = 'timeline';
let activityYear = 0;
let activitySelectedDate = '';

function renderActivityCalendar() {
  const today = dateStamp();
  const currentYear = Number(today.slice(0, 4));
  if (!activityYear) activityYear = currentYear;
  const data = FishDeskModel.contributionYear(tasks, activityYear, today);
  const grid = document.querySelector('#activity-grid');
  grid.style.setProperty('--activity-columns', String(data.weeks));
  document.querySelector('#activity-months').style.setProperty('--activity-columns', String(data.weeks));
  document.querySelector('#activity-months').innerHTML = data.months.map(month => `<span style="grid-column:${month.column}">${month.label}</span>`).join('');
  grid.innerHTML = data.cells.map(value => {
    if (value.outside) return '<span class="activity-outside" aria-hidden="true"></span>';
    const label = `${value.date}：${value.records} 条工作记录，${value.completed} 次任务完成`;
    return `<button class="activity-day${value.date === today ? ' is-today' : ''}" type="button" data-activity-date="${value.date}" data-level="${value.level}" title="${label}" aria-label="${label}" aria-pressed="${value.date === activitySelectedDate}"></button>`;
  }).join('');
  const years = new Set([currentYear, currentYear - 1, currentYear - 2]);
  tasks.forEach(task => {
    (task.workLogs || []).forEach(log => { const year = Number(log.date.slice(0, 4)); if (year >= 1900 && year <= currentYear) years.add(year); });
    const year = Number(FishDeskModel.completionInfo(task).date.slice(0, 4)); if (year >= 1900 && year <= currentYear) years.add(year);
  });
  document.querySelector('#activity-years').innerHTML = [...years].sort((a, b) => b - a).map(year => `<button type="button" data-activity-year="${year}" aria-pressed="${year === activityYear}">${year}</button>`).join('');
  document.querySelector('#activity-summary').textContent = `${activityYear} 年共 ${data.total} 次工作活动`;
  const chosen = data.days.find(value => value.date === activitySelectedDate);
  document.querySelector('#activity-detail').textContent = chosen
    ? `${chosen.date} · ${chosen.records} 条工作记录 · ${chosen.completed} 次任务完成`
    : `${data.start} — ${data.end} · ${data.records} 条工作记录 · ${data.completed} 次任务完成`;
}

function returnToProjectHome(event) {
  if (event.button > 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  selectedProject = 'all';
  projectView = 'active';
  projectTab = 'timeline';
  document.querySelector('#project-search').value = '';
  render();
  window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
}

function selectedProjectData() { return projects.find(project => project.name === selectedProject); }
function projectTasks(name) { return tasks.filter(task => task.project === name); }

function renderProjects() {
  projects = FishDeskModel.projectsFor(tasks, projects);
  const selected = selectedProjectData();
  document.querySelector('#project-home').hidden = Boolean(selected);
  document.querySelector('#project-detail').hidden = !selected;
  document.querySelector('.board-tools').hidden = !selected;
  document.querySelector('#board').hidden = !selected || projectTab !== 'tasks';
  document.querySelector('#project-timeline-panel').hidden = projectTab !== 'timeline';
  document.querySelector('#workspace-title').textContent = selected ? '项目工作区' : '项目总览';
  if (selected) {
    document.querySelector('#project-detail-title').textContent = selected.name;
    document.querySelector('#project-detail-goal').textContent = selected.goal || '还没有填写项目目标，可在「项目资料」中补充。';
    document.querySelector('#project-detail-phase').textContent = `${selected.status === 'completed' ? '项目已结束' : '项目推进中'} · ${selected.phase || '阶段待填写'}`;
    document.querySelector('#project-complete-button').textContent = selected.status === 'completed' ? '重新推进项目' : '结束项目';
    const selector = document.querySelector('#project-log-task');
    const current = selector.value;
    selector.innerHTML = '<option value="">选择工作项记录进展</option>' + projectTasks(selected.name).map(task => `<option value="${escapeHTML(task.id)}">${escapeHTML(task.title)} · ${STATUS_NAMES[task.status]}</option>`).join('');
    if (projectTasks(selected.name).some(task => task.id === current)) selector.value = current;
    renderProjectTimeline();
  }
  const query = document.querySelector('#project-search').value.trim().toLowerCase();
  const visible = projects.filter(project => projectView === 'all' || (projectView === 'completed' ? project.status === 'completed' : project.status !== 'completed'))
    .filter(project => !query || [project.name, project.goal, project.phase].join(' ').toLowerCase().includes(query))
    .sort((a, b) => projectActivity(b).localeCompare(projectActivity(a)));
  const grid = document.querySelector('#project-grid');
  if (!visible.length) {
    grid.innerHTML = `<div class="project-empty"><h3>${query ? '没有匹配的项目' : projectView === 'completed' ? '还没有结束的项目' : '从一个项目开始，连续记录每一天的推进'}</h3><p>${projectView === 'completed' ? '任务做完不会自动结束项目，需要在项目内明确标记结束。' : '先写下项目目标，再把工作项和每天的进展放进来。'}</p>${!query && projectView !== 'completed' ? '<button class="button button--primary" type="button" data-project-new>新建项目</button>' : ''}</div>`;
  } else if (projectView === 'completed') {
    const groups = new Map();
    visible.forEach(project => {
      const date = FishDeskModel.day(project.completedAt);
      const label = date === dateStamp() ? '今天结束' : date ? `${date.slice(0, 7)} · 往期结束` : '往期结束';
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(project);
    });
    grid.innerHTML = [...groups].map(([label, list], i) => `<details class="project-finished-group"${i === 0 ? ' open' : ''}><summary>${escapeHTML(label)} <span>${list.length} 个项目</span></summary><div class="project-grid">${list.map(projectCard).join('')}</div></details>`).join('');
  } else grid.innerHTML = visible.map(projectCard).join('');
  document.querySelectorAll('[data-project-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.projectView === projectView)));
  document.querySelectorAll('[data-project-tab]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.projectTab === projectTab)));
}

function projectActivity(project) {
  return [project.updatedAt || '', ...projectTasks(project.name).map(task => task.updatedAt || '')].sort().at(-1) || '';
}

function projectCard(project) {
  const list = projectTasks(project.name);
  const done = list.filter(task => task.status === 'done').length;
  const logs = FishDeskModel.entriesFor(list, '0000-01-01', '9999-12-31');
  const latest = logs[0];
  const next = list.find(task => task.status !== 'done' && task.nextStep);
  const risks = list.filter(task => task.status !== 'done' && task.issue).length;
  return `<article class="project-card"><div class="project-card__eyebrow"><span>${escapeHTML(project.phase || '持续推进')}</span><span class="project-state${project.status === 'completed' ? ' is-completed' : ''}">${project.status === 'completed' ? '项目已结束' : '推进中'}</span></div><h3><button type="button" class="project-card__open" data-project-open="${escapeHTML(project.id)}">${escapeHTML(project.name)}</button></h3><p class="project-card__goal">${escapeHTML(project.goal || '补充项目目标，让每次推进都有方向。')}</p><div class="project-card__latest"><span>${latest ? `${escapeHTML(latest.log.date)} · 最近进展` : '等待第一条进展'}</span><p>${latest ? escapeHTML(latest.log.content) : '进入项目，添加工作项并记录真实进展。'}</p></div><p class="project-card__next">下一步：${escapeHTML(next?.nextStep || '待安排')}</p><div class="project-card__footer"><span>${done}/${list.length} 项已完成 · ${logs.length} 条记录${risks ? ` · ${risks} 项风险` : ''}</span><button class="project-card__enter" type="button" data-project-open="${escapeHTML(project.id)}">进入项目 →</button></div></article>`;
}

function openProject(id) {
  const project = projects.find(item => item.id === id);
  if (!project) return;
  selectedProject = project.name;
  projectTab = 'timeline';
  render();
  document.querySelector('#workspace-title').scrollIntoView({ block: 'start', behavior: 'smooth' });
}

function openProjectDialog(project = null) {
  document.querySelector('#project-id').value = project?.id || '';
  document.querySelector('#project-name').value = project?.name || '';
  document.querySelector('#project-name').readOnly = Boolean(project);
  document.querySelector('#project-goal').value = project?.goal || '';
  document.querySelector('#project-phase').value = project?.phase || '';
  document.querySelector('#project-dialog-title').textContent = project ? '项目资料' : '新建项目';
  document.querySelector('#project-dialog').showModal();
  document.body.classList.add('modal-open');
}

function renderProjectTimeline() {
  const project = selectedProjectData();
  if (!project) return;
  const period = document.querySelector('#timeline-period').value;
  let start = document.querySelector('#timeline-start').value, end = document.querySelector('#timeline-end').value;
  if (['today', 'week', 'month'].includes(period)) {
    const range = getReportPeriod(period === 'today' ? 'day' : period, dateStamp());
    start = range.startStamp; end = range.endStamp;
  } else if (period === 'all') { start = ''; end = ''; }
  document.querySelector('#timeline-start').disabled = period !== 'custom';
  document.querySelector('#timeline-end').disabled = period !== 'custom';
  document.querySelector('#timeline-start').parentElement.hidden = period !== 'custom';
  document.querySelector('#timeline-end').parentElement.hidden = period !== 'custom';
  const entries = FishDeskModel.entriesFor(projectTasks(project.name), start || '0000-01-01', end || '9999-12-31');
  const days = new Map();
  entries.forEach(entry => { if (!days.has(entry.log.date)) days.set(entry.log.date, []); days.get(entry.log.date).push(entry); });
  document.querySelector('#project-timeline').innerHTML = entries.length ? [...days].map(([date, items]) => `<section class="project-day"><h4>${date === dateStamp() ? '今天' : escapeHTML(date)} <span>${items.length} 条记录</span></h4>${items.map(({ task, log, kind }) => `<article class="project-timeline-item"><div><span class="record-kind record-kind--${kind}">${FishDeskModel.kindNames[kind]}</span><button type="button" data-timeline-task="${escapeHTML(task.id)}" data-timeline-date="${escapeHTML(date)}">${escapeHTML(taskLabel(task, true))}</button></div><p>${escapeHTML(log.content)}</p></article>`).join('')}</section>`).join('') : '<div class="project-empty"><h3>这段时间还没有进展记录</h3><p>添加工作项后，用上方「登记进展」记录每天做了什么。</p></div>';
}

function renderCompletedTasks(list, completed) {
  const period = document.querySelector('#completed-period').value;
  const search = document.querySelector('#completed-search').value.trim().toLowerCase();
  const range = period === 'all' ? null : getReportPeriod(period === 'today' ? 'day' : period, dateStamp());
  const filtered = completed.filter(task => !search || [task.title, ...task.workLogs.map(log => log.content)].join(' ').toLowerCase().includes(search));
  const groups = FishDeskModel.completedGroups(filtered, dateStamp(), range?.startStamp, range?.endStamp);
  list.innerHTML = groups.length ? groups.map(group => `<details class="completed-day"${group.today ? ' open' : ''}><summary>${group.today ? '今天完成' : escapeHTML(group.date)} <span>${group.tasks.length} 项</span></summary>${group.tasks.map(taskCardTemplate).join('')}</details>`).join('') : '<p class="records-empty">该范围没有已完成的任务。</p>';
  return groups.reduce((count, group) => count + group.tasks.length, 0);
}

document.querySelector('.brand').addEventListener('click', returnToProjectHome);
document.querySelector('#activity-years').addEventListener('click', event => {
  const button = event.target.closest('[data-activity-year]');
  if (!button) return;
  activityYear = Number(button.dataset.activityYear); activitySelectedDate = ''; renderActivityCalendar();
});
document.querySelector('#activity-grid').addEventListener('click', event => {
  const button = event.target.closest('[data-activity-date]');
  if (!button) return;
  activitySelectedDate = button.dataset.activityDate;
  renderActivityCalendar();
  document.querySelector(`[data-activity-date="${activitySelectedDate}"]`).focus({ preventScroll: true });
});
document.querySelector('#new-project-button').addEventListener('click', () => openProjectDialog());
document.querySelector('#project-grid').addEventListener('click', event => {
  const button = event.target.closest('[data-project-open]');
  if (button) openProject(button.dataset.projectOpen);
  if (event.target.closest('[data-project-new]')) openProjectDialog();
});
document.querySelectorAll('[data-project-view]').forEach(button => button.addEventListener('click', () => { projectView = button.dataset.projectView; renderProjects(); }));
document.querySelector('#project-search').addEventListener('input', renderProjects);
document.querySelector('#project-back-button').addEventListener('click', () => { selectedProject = 'all'; render(); });
document.querySelector('#project-edit-button').addEventListener('click', () => openProjectDialog(selectedProjectData()));
document.querySelector('#project-complete-button').addEventListener('click', () => {
  const project = selectedProjectData();
  if (!project) return;
  if (project.status !== 'completed') {
    const unfinished = projectTasks(project.name).filter(task => task.status !== 'done').length;
    if (!window.confirm(`结束项目「${project.name}」？${unfinished ? `\n仍有 ${unfinished} 个未完成工作项，它们不会被自动标记完成。` : ''}\n全部工作记录仍会保留，可以重新开启项目。`)) return;
  }
  if (project.status === 'completed' && project.completedAt && !(project.statusHistory || []).some(event => event.status === 'completed')) {
    project.statusHistory = [{ date: FishDeskModel.day(project.completedAt), status: 'completed', recordedAt: project.completedAt }, ...(project.statusHistory || [])];
  }
  project.status = project.status === 'completed' ? 'active' : 'completed';
  project.completedAt = project.status === 'completed' ? new Date().toISOString() : null;
  project.updatedAt = new Date().toISOString();
  project.statusHistory = [...(project.statusHistory || []), { date: dateStamp(), status: project.status, recordedAt: project.updatedAt }];
  saveTasks(); render(); showToast(project.status === 'completed' ? '项目已结束，工作记录全部保留' : '项目已重新开启');
});
document.querySelector('#project-form').addEventListener('submit', event => {
  event.preventDefault();
  const id = document.querySelector('#project-id').value;
  const name = document.querySelector('#project-name').value.trim();
  if (!name) return;
  if (!id && projects.some(project => project.name === name)) { showToast('已有同名项目，请从项目总览进入'); return; }
  const now = new Date().toISOString();
  let project = projects.find(item => item.id === id);
  if (!project) { project = { id: FishDeskModel.projectId(name), name, status: 'active', completedAt: null, createdAt: now }; projects.push(project); }
  project.goal = document.querySelector('#project-goal').value.trim();
  project.phase = document.querySelector('#project-phase').value.trim();
  project.updatedAt = now;
  document.querySelector('#project-dialog').close();
  saveTasks(); openProject(project.id); showToast('项目已保存');
});
['#project-dialog-close', '#project-dialog-cancel'].forEach(selector => document.querySelector(selector).addEventListener('click', () => document.querySelector('#project-dialog').close()));
document.querySelector('#project-dialog').addEventListener('close', () => syncModalClass());
document.querySelectorAll('[data-project-tab]').forEach(button => button.addEventListener('click', () => { projectTab = button.dataset.projectTab; render(); }));
document.querySelector('#project-log-button').addEventListener('click', () => {
  const id = document.querySelector('#project-log-task').value;
  const task = tasks.find(item => item.id === id);
  if (!task) { showToast('请先选择要记录进展的工作项'); document.querySelector('#project-log-task').focus(); return; }
  openTaskDialog(task.status, task, true);
});
document.querySelector('#project-add-task-button').addEventListener('click', () => openTaskDialog('todo'));
['#timeline-period', '#timeline-start', '#timeline-end'].forEach(selector => document.querySelector(selector).addEventListener('change', renderProjectTimeline));
document.querySelector('#project-timeline').addEventListener('click', event => {
  const button = event.target.closest('[data-timeline-task]');
  if (!button) return;
  const task = tasks.find(item => item.id === button.dataset.timelineTask);
  if (task) { openTaskDialog(task.status, task); loadWorkLog(button.dataset.timelineDate); }
});
document.querySelector('#completed-period').addEventListener('change', () => render());
document.querySelector('#completed-search').addEventListener('input', () => render());
