'use strict';

const STORAGE_KEY = 'daylight.engineering.v2';
const LEGACY_STORAGE_KEY = 'daylight.tasks.v1';
const MIGRATION_KEY = 'daylight.server-migrated.v1';
const STATUSES = ['todo', 'doing', 'done'];
const DONE_PREVIEW = 4;
const ARCHIVE_AFTER_DAYS = 7;
const STATUS_NAMES = { todo: '待办', doing: '进行中', done: '已完成' };
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const icons = {
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12 4 4 8-9"/></svg>',
  more: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h.01M12 12h.01M19 12h.01"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4m8-4v4M3 10h18"/></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5 5 5M4 20l3.5-.7L19 7.8a1.8 1.8 0 0 0 0-2.6l-.2-.2a1.8 1.8 0 0 0-2.6 0L4.7 16.5 4 20Z"/></svg>',
  log: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8v5l3 2M4 12a8 8 0 1 0 2-5.3M4 4v5h5"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"/></svg>',
  inbox: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14l2 11h-5l-2 3h-4l-2-3H3L5 5Z"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>'
};

function dateStamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateStamp(stamp) {
  const [year, month, day] = stamp.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function offsetDateStamp(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return dateStamp(date);
}

function isDateStamp(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parseDateStamp(value).getTime());
}

function isValidDate(value) {
  return typeof value === 'string' && !Number.isNaN(new Date(value).getTime());
}

function createId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createSampleTasks() {
  const entries = [
    {
      id: 'eng-1', project: '机器鸭', module: '扩展板 V3', title: '扩展板 V3 打样优化', status: 'done', offset: 0,
      content: '优化器件布局，不再挡住结构安装；新增 USB 支持 USB 摄像头；增加电源保护，避免电池线序买错后一插就烧。',
      next: '打样回来后复装，并验证 USB 摄像头与电源保护。'
    },
    {
      id: 'eng-2', project: 'D126 模组', module: '硬件设计', title: '模组删减引脚并重新 Layout', status: 'doing', offset: 0,
      content: '每边删除 2 个引脚，需要重新布线；已重新下单 Layout。',
      next: '复核新 Layout 的封装、引脚定义和可制造性。'
    },
    {
      id: 'eng-3', project: 'Debian SDK', module: '用户编译问题', title: '排查 Debian 10 无法编译问题', status: 'doing', offset: 0,
      content: '重新部署 Linux Kernel 4.9 SDK，目前仍在编译，问题继续跟进。',
      next: '完成全量编译，定位并记录剩余依赖或补丁问题。',
      issue: 'Debian 10 编译问题尚未闭环，需要继续保留复现环境和编译日志。'
    },
    {
      id: 'eng-4', project: '泰山派', module: '系统镜像与网页测试', title: '制作 Kernel 6.1 Debian 自定义镜像', status: 'done', offset: 0,
      content: '使用之前机器鸭的网页代码，自制 Kernel 6.1 Debian 自定义镜像；Type-C 连接泰山派后，可通过网页控制屏幕切换，并进行 Wi-Fi、EC20、网口、音频和内存测试。',
      next: '整理镜像版本、烧录方法和网页测试项说明。'
    },
    {
      id: 'eng-5', project: '机器鸭', module: '硬件修正', title: '第 3 版硬件修正与扩展板标定', status: 'done', offset: -1,
      content: '用户反馈问题完成第 3 版硬件修正，布局布线完成；涂鸦回来的鸭子更换新扩展板后，重新标定测试 OK。',
      next: ''
    },
    {
      id: 'eng-6', project: '机器鸭', module: '海外开源', title: '海外平台开源与资料补全', status: 'done', offset: -1,
      content: '机器鸭开源到海外平台，教程、软件、硬件开源全部完成；软件开源中补充教程和硬件地址说明。',
      next: ''
    },
    {
      id: 'eng-7', project: '机器鸭', module: 'WIKI', title: '修正组装文档与规格说明', status: 'done', offset: -1,
      content: '修复左右腿 ID 图文不一致，补充风扇和铜柱规格；组装页增加先分配电机 ID 的提醒，避免返工。',
      next: ''
    },
    {
      id: 'eng-8', project: '机器鸭', module: '网页标定与控制', title: '网页标定与控制增加中英切换', status: 'done', offset: -1,
      content: '网页标定与控制支持中英切换，镜像重新输出。',
      next: '补充镜像下载与使用说明。'
    }
  ];

  return entries.map(entry => {
    const workDate = offsetDateStamp(entry.offset);
    const timestamp = new Date(`${workDate}T12:00:00`).toISOString();
    return {
      id: entry.id,
      project: entry.project,
      module: entry.module,
      title: entry.title,
      status: entry.status,
      nextStep: entry.next,
      issue: entry.issue || '',
      createdAt: timestamp,
      updatedAt: timestamp,
      completedAt: entry.status === 'done' ? timestamp : null,
      workLogs: [{ id: `log-${entry.id}`, date: workDate, content: entry.content }]
    };
  });
}

const elements = {
  board: document.querySelector('#board'),
  dialog: document.querySelector('#task-dialog'),
  form: document.querySelector('#task-form'),
  id: document.querySelector('#task-id'),
  originalLogDate: document.querySelector('#task-original-log-date'),
  project: document.querySelector('#task-project'),
  module: document.querySelector('#task-module'),
  title: document.querySelector('#task-title'),
  note: document.querySelector('#task-note'),
  workDate: document.querySelector('#task-work-date'),
  nextStep: document.querySelector('#task-next'),
  issue: document.querySelector('#task-issue'),
  projectFilter: document.querySelector('#project-filter'),
  logHistory: document.querySelector('#log-history'),
  logHistoryList: document.querySelector('#log-history-list'),
  logHistoryCount: document.querySelector('#log-history-count'),
  logEditHint: document.querySelector('#log-edit-hint'),
  logEditHintText: document.querySelector('#log-edit-hint-text'),
  logEditReset: document.querySelector('#log-edit-reset'),
  logUndo: document.querySelector('#log-undo'),
  logUndoText: document.querySelector('#log-undo-text'),
  logUndoButton: document.querySelector('#log-undo-button'),
  reportDialog: document.querySelector('#report-dialog'),
  reportTabs: document.querySelector('.report-tabs'),
  reportDate: document.querySelector('#report-date'),
  reportPrev: document.querySelector('#report-prev'),
  reportNext: document.querySelector('#report-next'),
  recordsDialog: document.querySelector('#records-dialog'),
  recordsTabs: document.querySelector('.records-tabs'),
  recordsSearch: document.querySelector('#records-search'),
  recordsProject: document.querySelector('#records-project'),
  recordsFilters: document.querySelector('#records-filters'),
  archiveList: document.querySelector('#archive-list'),
  archiveCountLabel: document.querySelector('#archive-count-label'),
  archiveStart: document.querySelector('#archive-start'),
  archiveEnd: document.querySelector('#archive-end'),
  reportAINote: document.querySelector('#report-ai-note'),
  reportAISetup: document.querySelector('#report-ai-setup'),
  reportAISetupButton: document.querySelector('#report-ai-setup-button'),
  polishReportButton: document.querySelector('#polish-report-button'),
  polishPanel: document.querySelector('#polish-panel'),
  polishStatus: document.querySelector('#polish-status'),
  polishResult: document.querySelector('#polish-result'),
  polishActions: document.querySelector('#polish-actions'),
  polishApply: document.querySelector('#polish-apply'),
  polishDiscard: document.querySelector('#polish-discard'),
  polishClose: document.querySelector('#polish-close'),
  reportPolishBanner: document.querySelector('#report-polish-banner'),
  restoreReportButton: document.querySelector('#restore-report-button'),
  logPolishRow: document.querySelector('#log-polish-row'),
  logPolishButton: document.querySelector('#log-polish-button'),
  logPolishPanel: document.querySelector('#log-polish-panel'),
  logPolishStatus: document.querySelector('#log-polish-status'),
  logPolishResult: document.querySelector('#log-polish-result'),
  logPolishActions: document.querySelector('#log-polish-actions'),
  logPolishApply: document.querySelector('#log-polish-apply'),
  logPolishCancel: document.querySelector('#log-polish-cancel'),
  logPolishClose: document.querySelector('#log-polish-close'),
  logPolishUndo: document.querySelector('#log-polish-undo'),
  logPolishUndoButton: document.querySelector('#log-polish-undo-button'),
  logsList: document.querySelector('#logs-list'),
  logsCountLabel: document.querySelector('#logs-count-label'),
  logsStart: document.querySelector('#logs-start'),
  logsEnd: document.querySelector('#logs-end'),
  backupStat: document.querySelector('#backup-stat'),
  importFileInput: document.querySelector('#import-file-input'),
  currentPassword: document.querySelector('#current-password'),
  newPassword: document.querySelector('#new-password'),
  confirmPassword: document.querySelector('#confirm-password'),
  passwordError: document.querySelector('#password-error'),
  passwordSubmit: document.querySelector('#password-submit'),
  settingsDialog: document.querySelector('#settings-dialog'),
  settingsForm: document.querySelector('#settings-form'),
  settingsAiKey: document.querySelector('#settings-ai-key'),
  settingsAiBaseUrl: document.querySelector('#settings-ai-base-url'),
  settingsAiModel: document.querySelector('#settings-ai-model'),
  settingsSessionDays: document.querySelector('#settings-session-days'),
  settingsSaveButton: document.querySelector('#settings-save-button'),
  aiConfigBadge: document.querySelector('#ai-config-badge'),
  aiKeyMasked: document.querySelector('#ai-key-masked'),
  aiTestButton: document.querySelector('#ai-test-button'),
  aiTestResult: document.querySelector('#ai-test-result'),
  aiClearKeyButton: document.querySelector('#ai-clear-key-button'),
  themeCurrentBadge: document.querySelector('#theme-current-badge'),
  updateBadge: document.querySelector('#update-badge'),
  updateCurrentVersion: document.querySelector('#update-current-version'),
  updateLatestVersion: document.querySelector('#update-latest-version'),
  updateProgress: document.querySelector('#update-progress'),
  updateProgressBar: document.querySelector('#update-progress-bar'),
  updateStatus: document.querySelector('#update-status'),
  updateCheckButton: document.querySelector('#update-check-button'),
  updateRunButton: document.querySelector('#update-run-button'),
  syncStatus: document.querySelector('#sync-status'),
  toast: document.querySelector('#toast'),
  toastMessage: document.querySelector('#toast-message'),
  undoButton: document.querySelector('#undo-button')
};

let tasks = [];
let booted = false;
let serverRev = 0;
let lastSyncedTasks = null;
let saveTimer = null;
let saving = false;
let draggedId = null;
let toastTimer = null;
let undoHandler = null;
let pendingLogUndo = null;
let selectedProject = 'all';
let doneExpanded = false;
let activeReportType = 'day';
let activeReportDate = dateStamp();
let aiEnabled = false;
let aiModelName = '';
let polishedReport = null;
let pendingReportPolish = null;
let pendingLogPolish = null;
let logPolishOriginal = null;
let reportPolishing = false;
let logPolishing = false;

function normalizeTask(task) {
  const createdAt = isValidDate(task.createdAt) ? task.createdAt : new Date().toISOString();
  const updatedAt = isValidDate(task.updatedAt) ? task.updatedAt : createdAt;
  let workLogs = Array.isArray(task.workLogs)
    ? task.workLogs.filter(log => log && isDateStamp(log.date) && typeof log.content === 'string' && log.content.trim()).map(log => ({
      id: typeof log.id === 'string' ? log.id : createId(),
      date: log.date,
      content: log.content.trim().slice(0, 600)
    }))
    : [];

  if (!workLogs.length && typeof task.note === 'string' && task.note.trim()) {
    workLogs = [{
      id: createId(),
      date: dateStamp(new Date(updatedAt)),
      content: task.note.trim().slice(0, 600)
    }];
  }

  return {
    id: task.id,
    project: typeof task.project === 'string' && task.project.trim() ? task.project.trim().slice(0, 40) : '未分类项目',
    module: typeof task.module === 'string' && task.module.trim()
      ? task.module.trim().slice(0, 40)
      : (typeof task.tag === 'string' ? task.tag.slice(0, 40) : '通用'),
    title: task.title.trim().slice(0, 100),
    status: task.status,
    nextStep: typeof task.nextStep === 'string' ? task.nextStep.slice(0, 240) : '',
    issue: typeof task.issue === 'string' ? task.issue.slice(0, 360) : '',
    createdAt,
    updatedAt,
    completedAt: task.status === 'done'
      ? (isValidDate(task.completedAt) ? task.completedAt : updatedAt)
      : null,
    workLogs
  };
}

class ApiError extends Error {
  constructor(status, data) {
    super(`API 请求失败：${status}`);
    this.status = status;
    this.data = data;
  }
}

async function apiRequest(pathname, { method = 'GET', body } = {}) {
  const response = await fetch(pathname, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let data = null;
  try {
    data = await response.json();
  } catch (error) {
    data = null;
  }
  if (!response.ok) throw new ApiError(response.status, data);
  return data;
}

function redirectToLogin() {
  const next = `${location.pathname}${location.search}`;
  location.replace(`/login?next=${encodeURIComponent(next)}`);
}

function normalizeTaskList(list) {
  return list
    .filter(task => task && typeof task.id === 'string' && typeof task.title === 'string' && STATUSES.includes(task.status))
    .map(normalizeTask);
}

function readCachedTasks() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? normalizeTaskList(parsed) : [];
    }

    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy !== null) {
      const parsed = JSON.parse(legacy);
      const customTasks = Array.isArray(parsed)
        ? normalizeTaskList(parsed.filter(task => task && typeof task.id === 'string' && !task.id.startsWith('sample-')))
        : [];
      return [...createSampleTasks(), ...customTasks];
    }
    return null;
  } catch (error) {
    console.warn('无法读取本机缓存。', error);
    return null;
  }
}

function cacheTasks() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch (error) {
    console.warn('本机缓存写入失败。', error);
  }
}

function hasMigratedToServer() {
  try {
    return localStorage.getItem(MIGRATION_KEY) === '1';
  } catch (error) {
    return true;
  }
}

function markMigratedToServer() {
  try {
    localStorage.setItem(MIGRATION_KEY, '1');
  } catch (error) {
    console.warn('迁移标记写入失败。', error);
  }
}

function mergeLocalCache(serverTasks, cachedTasks) {
  const map = new Map(serverTasks.map(task => [task.id, task]));
  cachedTasks.forEach(task => {
    const existing = map.get(task.id);
    map.set(task.id, existing ? newerTask(task, existing) : task);
  });
  return [
    ...serverTasks.map(task => map.get(task.id)),
    ...cachedTasks.filter(task => !serverTasks.some(item => item.id === task.id))
  ];
}

async function migrateLocalCache(serverTasks, rev) {
  if (hasMigratedToServer()) return;
  const cached = readCachedTasks();
  if (!cached || !cached.length) {
    markMigratedToServer();
    return;
  }
  const merged = mergeLocalCache(serverTasks, cached);
  if (JSON.stringify(merged) === JSON.stringify(serverTasks)) {
    markMigratedToServer();
    return;
  }
  try {
    const data = await apiRequest('/api/tasks', { method: 'PUT', body: { baseRev: rev, tasks: merged } });
    tasks = merged;
    serverRev = data.rev;
    lastSyncedTasks = merged;
    cacheTasks();
    render({ animate: true });
    markMigratedToServer();
    showToast('已把本机历史工作项合并到服务器');
  } catch (error) {
    if (error.status === 401) redirectToLogin();
  }
}

function setSyncStatus(text, tone = 'ok') {
  if (!elements.syncStatus) return;
  elements.syncStatus.textContent = text;
  elements.syncStatus.dataset.tone = tone;
}

function saveTasks() {
  polishedReport = null;
  cacheTasks();
  if (!booted) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    flushSave();
  }, 150);
}

async function flushSave() {
  if (saving || !booted) return;
  saving = true;
  setSyncStatus('正在保存…', 'busy');
  const snapshot = tasks.map(task => ({ ...task, workLogs: task.workLogs.map(log => ({ ...log })) }));
  try {
    const data = await apiRequest('/api/tasks', { method: 'PUT', body: { baseRev: serverRev, tasks: snapshot } });
    serverRev = data.rev;
    lastSyncedTasks = snapshot;
    setSyncStatus('已同步到服务器');
  } catch (error) {
    if (error.status === 401) {
      redirectToLogin();
      return;
    }
    if (error.status === 409 && error.data) {
      await resolveSyncConflict(error.data, snapshot);
      return;
    }
    if (error.status === 503 && error.data && error.data.maintenance === true) {
      setSyncStatus('系统升级中，修改已保留本机', 'busy');
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        saveTimer = null;
        flushSave();
      }, 5000);
      return;
    }
    setSyncStatus('保存失败，已暂存本机', 'error');
    showToast('保存失败，已暂存本机，请检查网络');
  } finally {
    saving = false;
  }
}

function newerTask(localTask, remoteTask) {
  return (localTask.updatedAt || '') >= (remoteTask.updatedAt || '') ? localTask : remoteTask;
}

function mergeTaskLists(base, local, remote) {
  const baseMap = new Map(base.map(task => [task.id, task]));
  const localMap = new Map(local.map(task => [task.id, task]));
  const remoteMap = new Map(remote.map(task => [task.id, task]));
  const deletedLocally = new Set(base.filter(task => !localMap.has(task.id)).map(task => task.id));
  const merged = [];
  const used = new Set();

  local.forEach(task => {
    const baseTask = baseMap.get(task.id);
    const remoteTask = remoteMap.get(task.id);
    if (baseTask && !remoteTask) return;
    merged.push(remoteTask ? newerTask(task, remoteTask) : task);
    used.add(task.id);
  });

  remote.forEach(task => {
    if (used.has(task.id) || deletedLocally.has(task.id)) return;
    merged.push(task);
  });

  return merged;
}

async function resolveSyncConflict(remote, localSnapshot) {
  const remoteTasks = normalizeTaskList(Array.isArray(remote.tasks) ? remote.tasks : []);
  const baseTasks = Array.isArray(lastSyncedTasks) ? normalizeTaskList(lastSyncedTasks) : [];
  const merged = mergeTaskLists(baseTasks, localSnapshot, remoteTasks);
  try {
    const data = await apiRequest('/api/tasks', { method: 'PUT', body: { baseRev: remote.rev, tasks: merged } });
    tasks = merged;
    serverRev = data.rev;
    lastSyncedTasks = merged;
    cacheTasks();
    setSyncStatus('已同步到服务器');
    render({ animate: true });
    showToast('已合并其他设备的更新');
  } catch (error) {
    if (error.status === 401) {
      redirectToLogin();
      return;
    }
    showToast('同步冲突未解决，请刷新页面后重试');
  }
}

async function syncFromServer() {
  if (!booted || saving || saveTimer || document.visibilityState === 'hidden') return;
  if (lastSyncedTasks && JSON.stringify(tasks) !== JSON.stringify(lastSyncedTasks)) return;
  try {
    const data = await apiRequest('/api/tasks');
    if (!data || data.rev === serverRev) return;
    const remoteTasks = normalizeTaskList(Array.isArray(data.tasks) ? data.tasks : []);
    tasks = remoteTasks;
    serverRev = data.rev;
    lastSyncedTasks = remoteTasks;
    polishedReport = null;
    cacheTasks();
    setSyncStatus('已同步到服务器');
    render({ animate: true });
    showToast('已同步其他设备的更新');
  } catch (error) {
    if (error.status === 401) redirectToLogin();
  }
}

function startSync() {
  setInterval(syncFromServer, 20000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncFromServer();
  });
  window.addEventListener('focus', syncFromServer);
  window.addEventListener('pagehide', () => {
    if (!saveTimer) return;
    clearTimeout(saveTimer);
    saveTimer = null;
    fetch('/api/tasks', {
      method: 'PUT',
      keepalive: true,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseRev: serverRev, tasks })
    }).catch(() => {});
  });
}

const THEME_STORAGE_KEY = 'fishdesk_theme';
const THEME_LABELS = { light: '浅色', dark: '深色', system: '跟随系统' };
const systemThemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
let themePreference = readCachedTheme();

function readCachedTheme() {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    if (value === 'light' || value === 'dark' || value === 'system') return value;
  } catch (error) {}
  return 'system';
}

function resolveTheme(preference) {
  if (preference === 'system') return systemThemeQuery.matches ? 'dark' : 'light';
  return preference === 'dark' ? 'dark' : 'light';
}

function updateThemeControls() {
  if (elements.themeCurrentBadge) {
    elements.themeCurrentBadge.textContent = THEME_LABELS[themePreference];
  }
  document.querySelectorAll('[data-theme-choice]').forEach(button => {
    const active = button.dataset.themeChoice === themePreference;
    button.setAttribute('aria-checked', active ? 'true' : 'false');
    button.classList.toggle('is-active', active);
  });
}

function applyTheme(preference, { persistLocal = true } = {}) {
  themePreference = THEME_LABELS[preference] ? preference : 'system';
  const resolved = resolveTheme(themePreference);
  document.documentElement.dataset.theme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#0d100e' : '#edf0eb');
  if (persistLocal) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, themePreference);
    } catch (error) {}
  }
  updateThemeControls();
}

async function loadThemeSetting() {
  try {
    const data = await apiRequest('/api/settings');
    if (data && THEME_LABELS[data.theme]) applyTheme(data.theme);
  } catch (error) {
    if (error.status === 401) redirectToLogin();
  }
}

async function selectTheme(preference) {
  if (!THEME_LABELS[preference] || preference === themePreference) return;
  applyTheme(preference);
  try {
    await apiRequest('/api/settings', { method: 'PUT', body: { theme: preference } });
  } catch (error) {
    if (error.status === 401) {
      redirectToLogin();
      return;
    }
    showToast('主题已在本机生效，但同步到服务器失败');
  }
}

systemThemeQuery.addEventListener('change', () => {
  if (themePreference === 'system') applyTheme('system', { persistLocal: false });
});

async function boot() {
  setDateAndGreeting();
  applyTheme(themePreference, { persistLocal: false });
  loadThemeSetting();
  loadAIStatus();
  let data = null;
  try {
    data = await apiRequest('/api/tasks');
  } catch (error) {
    if (error.status === 401) {
      redirectToLogin();
      return;
    }
    const cached = readCachedTasks();
    tasks = cached && cached.length ? cached : createSampleTasks();
    setSyncStatus('未连接服务器，显示本机缓存', 'error');
    render();
    showToast('无法连接服务器，当前显示本机缓存，修改暂不会同步');
    return;
  }

  const serverTasks = normalizeTaskList(Array.isArray(data.tasks) ? data.tasks : []);
  if (data.rev === 0 && !serverTasks.length) {
    const cached = readCachedTasks();
    tasks = cached && cached.length ? cached : createSampleTasks();
    serverRev = 0;
    lastSyncedTasks = [];
    booted = true;
    cacheTasks();
    render();
    await flushSave();
    if (serverRev > 0) markMigratedToServer();
    if (cached && cached.length) showToast('已把本机历史数据同步到服务器');
  } else {
    tasks = serverTasks;
    serverRev = data.rev;
    lastSyncedTasks = serverTasks;
    booted = true;
    cacheTasks();
    setSyncStatus('已同步到服务器');
    render();
    await migrateLocalCache(serverTasks, data.rev);
  }
  startSync();
}

function setTaskStatus(task, status) {
  if (task.status === status) return;
  task.status = status;
  task.completedAt = status === 'done' ? new Date().toISOString() : null;
  task.updatedAt = new Date().toISOString();
}

function getLatestLog(task) {
  return [...task.workLogs].sort((a, b) => b.date.localeCompare(a.date))[0] || null;
}

function upsertWorkLog(task, date, content, originalDate = '') {
  if (originalDate) {
    const index = task.workLogs.findIndex(log => log.date === originalDate);
    if (index !== -1) {
      const duplicateIndex = task.workLogs.findIndex(log => log.date === date && log.date !== originalDate);
      if (content && duplicateIndex !== -1) {
        task.workLogs[duplicateIndex] = { ...task.workLogs[duplicateIndex], content };
        task.workLogs.splice(index, 1);
      } else if (content) {
        task.workLogs[index] = { ...task.workLogs[index], date, content };
      } else {
        task.workLogs.splice(index, 1);
      }
      task.workLogs.sort((a, b) => a.date.localeCompare(b.date));
      return;
    }
  }
  if (!content) return;
  const existing = task.workLogs.find(log => log.date === date);
  if (existing) existing.content = content;
  else task.workLogs.push({ id: createId(), date, content });
  task.workLogs.sort((a, b) => a.date.localeCompare(b.date));
}

function renderLogHistory(task, activeDate = '') {
  const logs = task
    ? [...task.workLogs].sort((a, b) => b.date.localeCompare(a.date))
    : [];
  elements.logHistory.hidden = logs.length < 2;
  elements.logHistoryCount.textContent = logs.length ? `共 ${logs.length} 条` : '';
  elements.logHistoryList.innerHTML = logs.map(log => `
    <li class="log-entry${log.date === activeDate ? ' is-active' : ''}">
      <button class="log-entry__main" type="button" data-log-action="load" data-log-date="${log.date}">
        <time>${formatShortDate(log.date)}</time>
        <span>${escapeHTML(log.content)}</span>
      </button>
      <button class="log-entry__delete" type="button" data-log-action="delete" data-log-date="${log.date}" aria-label="删除 ${formatShortDate(log.date)} 的工作记录">${icons.trash}</button>
    </li>`).join('');
}

function updateLogEditHint() {
  const date = elements.originalLogDate.value;
  elements.logEditHint.hidden = !date;
  if (date) elements.logEditHintText.textContent = `正在修改 ${formatShortDate(date)} 的记录`;
}

function loadWorkLog(date) {
  const task = tasks.find(item => item.id === elements.id.value);
  const log = task?.workLogs.find(item => item.date === date);
  if (!log) return;
  elements.originalLogDate.value = date;
  elements.note.value = log.content;
  elements.workDate.value = date;
  updateLogEditHint();
  resetLogPolishState();
  renderLogHistory(task, date);
  clearFormErrors();
  elements.note.focus();
}

function resetLogEditing() {
  const task = tasks.find(item => item.id === elements.id.value);
  elements.originalLogDate.value = '';
  elements.note.value = '';
  elements.workDate.value = dateStamp();
  updateLogEditHint();
  renderLogHistory(task, '');
  elements.note.focus();
}

function deleteWorkLog(date) {
  const task = tasks.find(item => item.id === elements.id.value);
  const index = task ? task.workLogs.findIndex(log => log.date === date) : -1;
  if (!task || index === -1) return;
  const removed = task.workLogs[index];
  task.workLogs.splice(index, 1);
  task.updatedAt = new Date().toISOString();

  if (elements.originalLogDate.value === date) {
    const latest = getLatestLog(task);
    elements.originalLogDate.value = latest ? latest.date : '';
    elements.note.value = latest ? latest.content : '';
    elements.workDate.value = latest ? latest.date : dateStamp();
    updateLogEditHint();
  }

  pendingLogUndo = { taskId: task.id, log: removed };
  elements.logUndo.hidden = false;
  elements.logUndoText.textContent = `已删除 ${formatShortDate(date)} 的工作记录`;

  saveTasks();
  render({ animate: true });
  renderLogHistory(task);
  showToast(`已删除 ${formatShortDate(date)} 的工作记录`);
}

function clearLogUndo() {
  pendingLogUndo = null;
  elements.logUndo.hidden = true;
  elements.logUndoText.textContent = '';
}

function undoLogDeletion() {
  if (!pendingLogUndo) return;
  const task = tasks.find(item => item.id === pendingLogUndo.taskId);
  if (!task) {
    clearLogUndo();
    return;
  }
  const restored = pendingLogUndo.log;
  task.workLogs.push(restored);
  task.workLogs.sort((a, b) => a.date.localeCompare(b.date));
  task.updatedAt = new Date().toISOString();
  clearLogUndo();
  saveTasks();
  render({ animate: true });
  loadWorkLog(restored.date);
  showToast('已恢复该条工作记录');
}

function escapeHTML(value) {
  return String(value).replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

function formatShortDate(stamp) {
  const date = parseDateStamp(stamp);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function taskCardTemplate(task) {
  const title = escapeHTML(task.title);
  const latestLog = getLatestLog(task);
  const checkLabel = task.status === 'done' ? `将“${title}”移回待办` : `将“${title}”标为完成`;
  const moveStatus = task.status === 'todo' ? 'doing' : task.status === 'doing' ? 'done' : 'todo';
  const logContent = latestLog
    ? `<p class="task-note">${escapeHTML(latestLog.content)}</p>`
    : '<p class="task-note task-note--empty">尚未填写实际进展，不会写入报告</p>';

  return `
    <article class="task-card task-card--${task.status}" data-id="${escapeHTML(task.id)}" draggable="true">
      <div class="card-top">
        <button class="task-check" type="button" data-action="check" aria-label="${checkLabel}" title="${checkLabel}">${icons.check}</button>
        <span class="card-label">${STATUS_NAMES[task.status]}</span>
        <button class="icon-button card-menu-trigger" type="button" data-action="menu" aria-label="${title}的更多操作" aria-expanded="false">${icons.more}</button>
      </div>
      <div class="card-project"><span>${escapeHTML(task.project)}</span><span>${escapeHTML(task.module)}</span></div>
      <h4>${title}</h4>
      ${logContent}
      ${task.issue ? `<div class="card-issue"><strong>风险</strong><span>${escapeHTML(task.issue)}</span></div>` : ''}
      ${task.nextStep ? `<p class="task-next"><strong>跟进</strong>${escapeHTML(task.nextStep)}</p>` : ''}
      <div class="card-footer">
        <button class="task-tag" type="button" data-action="history" aria-label="查看${title}的${task.workLogs.length}条工作记录">${task.workLogs.length} 条工作记录</button>
        <span class="task-time">${icons.calendar}${latestLog ? formatShortDate(latestLog.date) : '暂无记录'}</span>
      </div>
      <div class="card-menu" hidden>
        <button type="button" data-action="log">${icons.log}记录新进展</button>
        <button type="button" data-action="edit">${icons.edit}编辑工作项</button>
        <button type="button" data-action="move" data-target="${moveStatus}">${icons.arrow}移至${STATUS_NAMES[moveStatus]}</button>
        <button type="button" data-action="delete">${icons.trash}删除工作项</button>
      </div>
    </article>`;
}

function emptyStateTemplate(status) {
  const messages = {
    todo: ['没有待办工作项', '可以新建具体任务或交付项'],
    doing: ['当前没有进行中事项', '将待办拖到这里开始跟进'],
    done: ['还没有已闭环事项', '完成的工作项会保留在这里']
  };
  return `<div class="empty-state">${icons.inbox}<strong>${messages[status][0]}</strong><span>${messages[status][1]}</span></div>`;
}

function isArchived(task) {
  if (task.status !== 'done' || !task.completedAt) return false;
  const completed = new Date(task.completedAt).getTime();
  return Number.isFinite(completed) && Date.now() - completed >= ARCHIVE_AFTER_DAYS * 86400000;
}

function renderProjectFilter() {
  const projects = [...new Set(tasks.map(task => task.project))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  const activeProjects = [...new Set(tasks.filter(task => !isArchived(task)).map(task => task.project))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  if (selectedProject !== 'all' && !activeProjects.includes(selectedProject)) selectedProject = 'all';
  elements.projectFilter.innerHTML = '<option value="all">全部项目</option>' + activeProjects.map(project =>
    `<option value="${escapeHTML(project)}"${project === selectedProject ? ' selected' : ''}>${escapeHTML(project)}</option>`
  ).join('');
  document.querySelector('#project-suggestions').innerHTML = projects.map(project => `<option value="${escapeHTML(project)}"></option>`).join('');
}

function render({ animate = false } = {}) {
  const oldPositions = new Map();
  if (animate && !reduceMotion.matches) {
    document.querySelectorAll('.task-card').forEach(card => oldPositions.set(card.dataset.id, card.getBoundingClientRect()));
  }

  renderProjectFilter();
  const activeTasks = tasks.filter(task => !isArchived(task));
  const visibleTasks = selectedProject === 'all' ? activeTasks : activeTasks.filter(task => task.project === selectedProject);
  STATUSES.forEach(status => {
    const list = document.querySelector(`.task-list[data-status="${status}"]`);
    let filtered = visibleTasks.filter(task => task.status === status);
    if (status === 'done') {
      filtered = filtered.sort((a, b) => String(b.completedAt || '').localeCompare(String(a.completedAt || '')));
    }
    const collapsedCount = status === 'done' && !doneExpanded
      ? Math.max(0, filtered.length - DONE_PREVIEW)
      : 0;
    const shown = collapsedCount ? filtered.slice(0, DONE_PREVIEW) : filtered;
    const toggle = status === 'done' && filtered.length > DONE_PREVIEW
      ? `<button class="done-toggle" type="button" data-action="toggle-done" aria-expanded="${doneExpanded}">${doneExpanded ? '收起已完成历史' : `查看其余 ${filtered.length - DONE_PREVIEW} 项已完成`}${icons.chevron}</button>`
      : '';
    list.innerHTML = shown.length ? shown.map(taskCardTemplate).join('') + toggle : emptyStateTemplate(status);
    document.querySelector(`[data-count="${status}"]`).textContent = filtered.length;
  });
  updateOverview();

  if (animate && !reduceMotion.matches) {
    document.querySelectorAll('.task-card').forEach(card => {
      const previous = oldPositions.get(card.dataset.id);
      if (previous) {
        const current = card.getBoundingClientRect();
        const deltaX = previous.left - current.left;
        const deltaY = previous.top - current.top;
        if (deltaX || deltaY) card.animate([
          { transform: `translate(${deltaX}px, ${deltaY}px)` },
          { transform: 'translate(0, 0)' }
        ], { duration: 420, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
      } else {
        card.animate([
          { opacity: 0, transform: 'translateY(10px) scale(0.98)' },
          { opacity: 1, transform: 'translateY(0) scale(1)' }
        ], { duration: 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
      }
    });
  }
}

function updateOverview() {
  const todayEntries = getReportEntries('day', dateStamp());
  const weekEntries = getReportEntries('week', dateStamp());
  document.querySelector('#total-count').textContent = tasks.length;
  document.querySelector('#remaining-count').textContent = tasks.filter(task => task.status !== 'done').length;
  document.querySelector('#today-log-count').textContent = todayEntries.length;
  document.querySelector('#today-project-count').textContent = new Set(todayEntries.map(entry => entry.task.project)).size;
  document.querySelector('#week-log-count').textContent = weekEntries.length;
  document.querySelector('#doing-count').textContent = tasks.filter(task => task.status === 'doing').length;
  document.querySelector('#issue-count').textContent = tasks.filter(task => task.issue && task.status !== 'done').length;
}

function openTaskDialog(status = 'todo', task = null, newLog = false) {
  closeAllMenus();
  elements.form.reset();
  const latestLog = task && !newLog ? getLatestLog(task) : null;
  elements.id.value = task ? task.id : '';
  elements.originalLogDate.value = latestLog ? latestLog.date : '';
  elements.project.value = task ? task.project : (selectedProject !== 'all' ? selectedProject : '');
  elements.module.value = task ? task.module : '';
  elements.title.value = task ? task.title : '';
  elements.note.value = latestLog ? latestLog.content : '';
  elements.workDate.value = latestLog ? latestLog.date : dateStamp();
  elements.nextStep.value = task ? task.nextStep : '';
  elements.issue.value = task ? task.issue : '';
  elements.form.querySelector(`input[name="status"][value="${task ? task.status : status}"]`).checked = true;
  clearFormErrors();
  clearLogUndo();
  resetLogPolishState();
  renderLogHistory(task, latestLog ? latestLog.date : '');
  updateLogEditHint();

  document.querySelector('#dialog-title').textContent = newLog ? '记录项目进展' : task ? '编辑工作项' : '新建工作项';
  document.querySelector('#dialog-eyebrow').textContent = newLog ? 'ADD DATED WORK LOG' : 'ENGINEERING WORK ITEM';
  document.querySelector('#save-task-button').textContent = newLog ? '保存进展' : '保存工作项';
  elements.dialog.showModal();
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => (newLog ? elements.note : elements.project).focus());
}

function clearFormErrors() {
  elements.title.classList.remove('is-invalid');
  elements.note.classList.remove('is-invalid');
  document.querySelector('#title-error').classList.remove('is-visible');
  document.querySelector('#note-error').classList.remove('is-visible');
}

function handleFormSubmit(event) {
  event.preventDefault();
  clearFormErrors();
  const project = elements.project.value.trim();
  const title = elements.title.value.trim();
  const content = elements.note.value.trim();
  const workDate = elements.workDate.value;
  const status = elements.form.querySelector('input[name="status"]:checked').value;

  if (!project) {
    elements.project.focus();
    showToast('请填写项目名称');
    return;
  }
  if (!title) {
    elements.title.classList.add('is-invalid');
    document.querySelector('#title-error').classList.add('is-visible');
    elements.title.focus();
    return;
  }
  if (!workDate) {
    elements.workDate.focus();
    showToast('请选择工作日期');
    return;
  }
  const editingId = elements.id.value;
  const editingTask = tasks.find(item => item.id === editingId);
  const originalDate = elements.originalLogDate.value;
  const hasOtherResult = editingTask?.workLogs.some(log => log.date !== originalDate && log.content.trim()) || false;
  if (status === 'done' && !content && !hasOtherResult) {
    elements.note.classList.add('is-invalid');
    document.querySelector('#note-error').classList.add('is-visible');
    elements.note.focus();
    return;
  }

  const now = new Date().toISOString();
  if (editingId) {
    const task = tasks.find(item => item.id === editingId);
    if (task) {
      Object.assign(task, {
        project,
        module: elements.module.value.trim() || '通用',
        title,
        nextStep: elements.nextStep.value.trim(),
        issue: elements.issue.value.trim()
      });
      setTaskStatus(task, status);
      upsertWorkLog(task, workDate, content, elements.originalLogDate.value);
      task.updatedAt = now;
    }
  } else {
    const task = {
      id: createId(),
      project,
      module: elements.module.value.trim() || '通用',
      title,
      status,
      nextStep: elements.nextStep.value.trim(),
      issue: elements.issue.value.trim(),
      createdAt: now,
      updatedAt: now,
      completedAt: status === 'done' ? now : null,
      workLogs: []
    };
    upsertWorkLog(task, workDate, content);
    tasks.push(task);
  }

  saveTasks();
  elements.dialog.close();
  render({ animate: true });
  showToast(editingId ? '工作记录已保存' : '工作项已创建');
}

function requestCompletionResult(task) {
  openTaskDialog(task.status, task);
  elements.form.querySelector('input[name="status"][value="done"]').checked = true;
  showToast('请先填写实际结果再闭环');
  requestAnimationFrame(() => elements.note.focus());
}

function findTaskFromElement(element) {
  const card = element.closest('.task-card');
  return card ? tasks.find(task => task.id === card.dataset.id) || null : null;
}

function handleBoardClick(event) {
  const addButton = event.target.closest('.add-to-column');
  if (addButton) {
    openTaskDialog(addButton.dataset.status);
    return;
  }
  if (event.target.closest('[data-action="toggle-done"]')) {
    doneExpanded = !doneExpanded;
    render();
    return;
  }
  const actionButton = event.target.closest('[data-action]');
  if (!actionButton) {
    if (!event.target.closest('.card-menu')) closeAllMenus();
    return;
  }
  const task = findTaskFromElement(actionButton);
  if (!task) return;
  const action = actionButton.dataset.action;

  if (action === 'menu') {
    const card = actionButton.closest('.task-card');
    const menu = card.querySelector('.card-menu');
    const willOpen = menu.hidden;
    closeAllMenus();
    menu.hidden = !willOpen;
    actionButton.setAttribute('aria-expanded', String(willOpen));
    card.classList.toggle('menu-open', willOpen);
    if (willOpen) menu.querySelector('button').focus();
  } else if (action === 'edit') {
    openTaskDialog(task.status, task);
  } else if (action === 'history') {
    openTaskDialog(task.status, task);
    requestAnimationFrame(() => {
      if (!elements.logHistory.hidden) elements.logHistory.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  } else if (action === 'log') {
    openTaskDialog(task.status, task, true);
  } else if (action === 'check') {
    const targetStatus = task.status === 'done' ? 'todo' : 'done';
    if (targetStatus === 'done' && !task.workLogs.length) {
      requestCompletionResult(task);
    } else {
      setTaskStatus(task, targetStatus);
      saveAndRefresh(task.status === 'done' ? '工作项已闭环' : '工作项已移回待办');
    }
  } else if (action === 'move') {
    if (actionButton.dataset.target === 'done' && !task.workLogs.length) {
      requestCompletionResult(task);
    } else {
      setTaskStatus(task, actionButton.dataset.target);
      saveAndRefresh(`已移至${STATUS_NAMES[task.status]}`);
    }
  } else if (action === 'delete') {
    deleteTask(task.id);
  }
}

function deleteTask(id) {
  const index = tasks.findIndex(task => task.id === id);
  if (index === -1) return;
  const removed = tasks[index];
  tasks.splice(index, 1);
  saveTasks();
  render({ animate: true });
  showToast('工作项及其工作记录已删除', () => {
    tasks.splice(Math.min(index, tasks.length), 0, removed);
    saveTasks();
    render({ animate: true });
    showToast('工作项已恢复');
  });
}

function undoLastAction() {
  if (!undoHandler) return;
  const handler = undoHandler;
  undoHandler = null;
  elements.undoButton.hidden = true;
  elements.toast.classList.remove('is-visible');
  handler();
}

function saveAndRefresh(message) {
  closeAllMenus();
  saveTasks();
  render({ animate: true });
  showToast(message);
}

function showToast(message, handler = null) {
  clearTimeout(toastTimer);
  elements.toastMessage.textContent = message;
  undoHandler = typeof handler === 'function' ? handler : null;
  elements.undoButton.hidden = !undoHandler;
  elements.toast.classList.add('is-visible');
  toastTimer = setTimeout(() => {
    elements.toast.classList.remove('is-visible');
    undoHandler = null;
  }, undoHandler ? 5500 : 2800);
}

function closeAllMenus(except = null) {
  document.querySelectorAll('.task-card.menu-open').forEach(card => {
    if (card === except) return;
    card.classList.remove('menu-open');
    card.querySelector('.card-menu').hidden = true;
    card.querySelector('.card-menu-trigger').setAttribute('aria-expanded', 'false');
  });
}

function getDragAfterElement(container, y) {
  const cards = [...container.querySelectorAll('.task-card:not(.dragging)')];
  return cards.reduce((closest, card) => {
    const box = card.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    return offset < 0 && offset > closest.offset ? { offset, element: card } : closest;
  }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
}

function handleDragStart(event) {
  const card = event.target.closest('.task-card');
  if (!card || event.target.closest('button')) {
    event.preventDefault();
    return;
  }
  draggedId = card.dataset.id;
  card.classList.add('dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', draggedId);
}

function handleDragOver(event) {
  const list = event.target.closest('.task-list');
  if (!list || !draggedId) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  const card = document.querySelector(`.task-card[data-id="${CSS.escape(draggedId)}"]`);
  if (!card) return;
  const afterElement = getDragAfterElement(list, event.clientY);
  document.querySelectorAll('.task-column').forEach(column => column.classList.toggle('is-over', column.dataset.status === list.dataset.status));
  if (afterElement) list.insertBefore(card, afterElement);
  else list.appendChild(card);
}

function handleDrop(event) {
  const list = event.target.closest('.task-list');
  if (!list || !draggedId) return;
  event.preventDefault();
  const id = draggedId;
  const afterElement = getDragAfterElement(list, event.clientY);
  const targetId = afterElement ? afterElement.dataset.id : null;
  const task = tasks.find(item => item.id === id);
  if (!task) return;
  if (list.dataset.status === 'done' && task.status !== 'done' && !task.workLogs.length) {
    draggedId = null;
    cleanupDrag();
    render();
    requestCompletionResult(task);
    return;
  }
  const previousStatus = task.status;
  tasks = tasks.filter(item => item.id !== id);
  setTaskStatus(task, list.dataset.status);
  if (targetId) {
    const targetIndex = tasks.findIndex(item => item.id === targetId);
    tasks.splice(targetIndex, 0, task);
  } else {
    let insertAt = -1;
    tasks.forEach((item, index) => { if (item.status === task.status) insertAt = index; });
    tasks.splice(insertAt === -1 ? tasks.length : insertAt + 1, 0, task);
  }
  draggedId = null;
  cleanupDrag();
  saveTasks();
  render({ animate: true });
  if (previousStatus !== task.status) showToast(`已移至${STATUS_NAMES[task.status]}`);
}

function cleanupDrag() {
  document.querySelectorAll('.task-column').forEach(column => column.classList.remove('is-over'));
  document.querySelectorAll('.task-card.dragging').forEach(card => card.classList.remove('dragging'));
}

function handleDragEnd() {
  if (!draggedId) return;
  draggedId = null;
  cleanupDrag();
  render();
}

function handleMenuKeyboard(event) {
  const menu = event.target.closest('.card-menu');
  if (!menu || !['ArrowDown', 'ArrowUp', 'Escape'].includes(event.key)) return;
  const buttons = [...menu.querySelectorAll('button')];
  const index = buttons.indexOf(document.activeElement);
  if (event.key === 'Escape') {
    const trigger = menu.closest('.task-card').querySelector('.card-menu-trigger');
    closeAllMenus();
    trigger.focus();
  } else {
    event.preventDefault();
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    buttons[(index + direction + buttons.length) % buttons.length].focus();
  }
}

const REPORT_META = {
  day: { kind: '研发工作日报', section: '今日工作' },
  week: { kind: '研发工作周报', section: '本周工作' },
  month: { kind: '研发工作月报', section: '本月工作' }
};

function getReportPeriod(type, referenceStamp = activeReportDate) {
  const start = parseDateStamp(referenceStamp);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  if (type === 'week') {
    start.setDate(start.getDate() - (start.getDay() + 6) % 7);
    end.setTime(start.getTime());
    end.setDate(end.getDate() + 7);
  } else if (type === 'month') {
    start.setDate(1);
    end.setTime(start.getTime());
    end.setMonth(end.getMonth() + 1);
  } else {
    end.setDate(end.getDate() + 1);
  }
  const lastDay = new Date(end);
  lastDay.setDate(lastDay.getDate() - 1);
  return { start, end: lastDay, startStamp: dateStamp(start), endStamp: dateStamp(lastDay) };
}

function getReportEntries(type, referenceStamp = activeReportDate) {
  const period = getReportPeriod(type, referenceStamp);
  return tasks.flatMap(task => task.workLogs
    .filter(log => log.date >= period.startStamp && log.date <= period.endStamp)
    .map(log => ({ task, log }))
  ).sort((a, b) => b.log.date.localeCompare(a.log.date));
}

function getReportData() {
  const entries = getReportEntries(activeReportType);
  const followUps = tasks.filter(task => task.nextStep && task.status !== 'done');
  const risks = tasks.filter(task => task.issue && task.status !== 'done');
  return {
    entries,
    followUps,
    risks,
    projectCount: new Set(entries.map(entry => entry.task.project)).size,
    title: formatReportTitle(),
    period: getReportPeriod(activeReportType)
  };
}

function formatReportTitle() {
  const { start, end } = getReportPeriod(activeReportType);
  if (activeReportType === 'day') return `${start.getMonth() + 1}月${start.getDate()}日 · ${WEEKDAYS[start.getDay()]}`;
  if (activeReportType === 'week') return `${start.getMonth() + 1}月${start.getDate()}日—${end.getMonth() + 1}月${end.getDate()}日`;
  return `${start.getFullYear()}年${start.getMonth() + 1}月`;
}

function shiftReportPeriod(step) {
  const date = parseDateStamp(activeReportDate);
  if (activeReportType === 'week') date.setDate(date.getDate() + step * 7);
  else if (activeReportType === 'month') date.setMonth(date.getMonth() + step, 1);
  else date.setDate(date.getDate() + step);
  activeReportDate = dateStamp(date);
  renderReport();
}

function groupEntriesByProject(entries) {
  const groups = new Map();
  entries.forEach(entry => {
    if (!groups.has(entry.task.project)) groups.set(entry.task.project, []);
    groups.get(entry.task.project).push(entry);
  });
  return [...groups.entries()];
}

function chineseOrdinal(index) {
  const values = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五'];
  return values[index] || String(index + 1);
}

function taskLabel(task, grouped = false) {
  const module = task.module && task.module !== '通用' ? `${task.module}｜` : '';
  return `${grouped ? '' : `${task.project}｜`}${module}${task.title}`;
}

function entryLabel(entry, grouped) {
  return taskLabel(entry.task, grouped);
}

function groupEntriesByTask(entries) {
  const groups = new Map();
  entries.forEach(entry => {
    if (!groups.has(entry.task.id)) groups.set(entry.task.id, { task: entry.task, logs: [] });
    groups.get(entry.task.id).logs.push(entry.log);
  });
  return [...groups.values()].map(group => ({
    ...group,
    logs: group.logs.sort((a, b) => a.date.localeCompare(b.date))
  }));
}

function reportEntriesHTML(entries, grouped = false) {
  return `<ul class="engineering-report-list">${entries.map(entry => `
    <li><strong>${escapeHTML(entryLabel(entry, grouped))}</strong><p>${escapeHTML(entry.log.content)}</p><time>${formatShortDate(entry.log.date)}</time></li>`
  ).join('')}</ul>`;
}

function reportTaskGroupsHTML(entries) {
  return `<ul class="engineering-report-list engineering-report-list--grouped">${groupEntriesByTask(entries).map(group => `
    <li class="report-log-group">
      <strong>${escapeHTML(taskLabel(group.task, true))}</strong>
      <div class="report-log-lines">${group.logs.map(log => `
        <p><time>${formatShortDate(log.date)}</time><span>${escapeHTML(log.content)}</span></p>`).join('')}
      </div>
    </li>`).join('')}</ul>`;
}

function followUpHTML(data) {
  let html = '';
  if (data.followUps.length) {
    html += `<section class="report-section"><h4>后续跟进（截至今日）</h4><ul class="engineering-report-list">${data.followUps.map(task =>
      `<li><strong>${escapeHTML(task.project)}｜${escapeHTML(task.title)}</strong><p>${escapeHTML(task.nextStep)}</p></li>`
    ).join('')}</ul></section>`;
  }
  if (data.risks.length) {
    html += `<section class="report-section report-section--risk"><h4>问题与风险（截至今日）</h4><ul class="engineering-report-list">${data.risks.map(task =>
      `<li><strong>${escapeHTML(task.project)}｜${escapeHTML(task.title)}</strong><p>${escapeHTML(task.issue)}</p></li>`
    ).join('')}</ul></section>`;
  }
  return html;
}

function buildReportHTML(data) {
  const meta = REPORT_META[activeReportType];
  let html = `<section class="report-section"><h4>${meta.section}</h4>`;
  if (!data.entries.length) {
    html += '<p class="report-empty">该周期没有已保存的工作记录，不会自动生成内容。</p></section>';
  } else if (activeReportType === 'day') {
    html += `${reportEntriesHTML(data.entries)}</section>`;
  } else {
    html += '</section>' + groupEntriesByProject(data.entries).map(([project, entries], index) => `
      <section class="report-project"><h5>${chineseOrdinal(index)}、${escapeHTML(project)}</h5>${reportTaskGroupsHTML(entries)}</section>`
    ).join('');
  }
  return html + followUpHTML(data);
}

function renderReport() {
  const data = getReportData();
  elements.reportTabs.querySelectorAll('[role="tab"]').forEach(tab => {
    const selected = tab.dataset.reportType === activeReportType;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected) document.querySelector('#report-preview').setAttribute('aria-labelledby', tab.id);
  });
  elements.reportDate.value = activeReportDate;
  document.querySelector('#report-kind').textContent = REPORT_META[activeReportType].kind;
  document.querySelector('#report-document-title').textContent = data.title;
  document.querySelector('#report-summary').textContent = `${data.entries.length} 项工作记录 · ${data.projectCount} 个项目${data.risks.length ? ` · ${data.risks.length} 项风险` : ''}`;
  const polished = isPolishedReportActive();
  elements.reportPolishBanner.hidden = !polished;
  document.querySelector('#report-content').innerHTML = polished
    ? `<div class="report-polished-text">${escapeHTML(polishedReport.text)}</div>`
    : buildReportHTML(data);
  elements.reportNext.disabled = data.period.endStamp >= dateStamp();
}

function markdownText(value) {
  return String(value).replace(/[\r\n]+/g, ' ').trim();
}

function buildReportMarkdown(data = getReportData()) {
  const meta = REPORT_META[activeReportType];
  const lines = [`# ${meta.kind} · ${data.title}`, '', `## ${meta.section}`, ''];
  if (!data.entries.length) {
    lines.push('该周期没有已保存的工作记录。');
  } else if (activeReportType === 'day') {
    data.entries.forEach(entry => lines.push(`- ${entryLabel(entry)}：${markdownText(entry.log.content)}`));
  } else {
    groupEntriesByProject(data.entries).forEach(([project, entries], index) => {
      lines.push(`### ${chineseOrdinal(index)}、${project}`, '');
      groupEntriesByTask(entries).forEach(group => {
        if (group.logs.length === 1) {
          lines.push(`- ${taskLabel(group.task, true)}：${markdownText(group.logs[0].content)}`);
        } else {
          lines.push(`- ${taskLabel(group.task, true)}`);
          group.logs.forEach(log => lines.push(`  - ${formatShortDate(log.date)}：${markdownText(log.content)}`));
        }
      });
      lines.push('');
    });
  }
  if (data.followUps.length) {
    lines.push('', '## 后续跟进（截至今日）', '');
    data.followUps.forEach(task => lines.push(`- ${task.project}｜${task.title}：${markdownText(task.nextStep)}`));
  }
  if (data.risks.length) {
    lines.push('', '## 问题与风险（截至今日）', '');
    data.risks.forEach(task => lines.push(`- ${task.project}｜${task.title}：${markdownText(task.issue)}`));
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function buildReportText(data = getReportData()) {
  const meta = REPORT_META[activeReportType];
  const summary = `${data.entries.length} 项工作记录 · ${data.projectCount} 个项目${data.risks.length ? ` · ${data.risks.length} 项风险` : ''}`;
  const lines = [meta.kind, data.title, summary, '', `【${meta.section}】`];
  if (!data.entries.length) {
    lines.push('该周期没有已保存的工作记录。');
  } else if (activeReportType === 'day') {
    data.entries.forEach(entry => lines.push(`· ${entryLabel(entry)}：${markdownText(entry.log.content)}`));
  } else {
    groupEntriesByProject(data.entries).forEach(([project, entries], index) => {
      lines.push(`${chineseOrdinal(index)}、${project}`);
      groupEntriesByTask(entries).forEach(group => {
        if (group.logs.length === 1) {
          lines.push(`· ${taskLabel(group.task, true)}：${markdownText(group.logs[0].content)}`);
        } else {
          lines.push(`· ${taskLabel(group.task, true)}`);
          group.logs.forEach(log => lines.push(`    ${formatShortDate(log.date)} ${markdownText(log.content)}`));
        }
      });
      lines.push('');
    });
  }
  if (data.followUps.length) {
    lines.push('', '【后续跟进（截至今日）】');
    data.followUps.forEach(task => lines.push(`· ${task.project}｜${task.title}：${markdownText(task.nextStep)}`));
  }
  if (data.risks.length) {
    lines.push('', '【问题与风险（截至今日）】');
    data.risks.forEach(task => lines.push(`· ${task.project}｜${task.title}：${markdownText(task.issue)}`));
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function downloadReport() {
  const data = getReportData();
  const content = isPolishedReportActive() ? polishedReport.text : buildReportMarkdown(data);
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${REPORT_META[activeReportType].kind}-${activeReportDate}.md`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('工作报告已下载');
}

async function copyReport() {
  const content = isPolishedReportActive() ? polishedReport.text : buildReportText();
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(content);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = content;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      textarea.remove();
      if (!copied) throw new Error('copy command failed');
    }
    showToast('已复制为纯文本，可直接粘贴发送');
  } catch (error) {
    showToast('复制失败，请使用下载功能');
    console.warn('报告复制失败。', error);
  }
}

function refreshAIEntries() {
  elements.polishReportButton.hidden = !aiEnabled;
  elements.reportAINote.hidden = !aiEnabled;
  elements.reportAISetup.hidden = aiEnabled;
  elements.logPolishRow.hidden = !aiEnabled;
  if (aiEnabled) {
    elements.reportAINote.textContent = `润色会把当前报告文字发送到外部 AI 服务（${aiModelName}）处理，不会发送密码或工作记录以外的数据。`;
  }
}

async function loadAIStatus() {
  try {
    const data = await apiRequest('/api/ai-status');
    aiEnabled = Boolean(data && data.enabled);
    aiModelName = data && typeof data.model === 'string' ? data.model : '';
  } catch (error) {
    aiEnabled = false;
    aiModelName = '';
  }
  refreshAIEntries();
}

async function requestPolish(text, kind) {
  const response = await fetch('/api/polish', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, kind })
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error((data && data.error) || '润色失败，请稍后重试');
    error.status = response.status;
    throw error;
  }
  const result = data && typeof data.text === 'string' ? data.text.trim() : '';
  if (!result) throw new Error('AI 没有返回内容，请稍后重试');
  return result;
}

function isPolishedReportActive() {
  return Boolean(polishedReport && polishedReport.type === activeReportType && polishedReport.stamp === activeReportDate);
}

function closePolishPanel() {
  pendingReportPolish = null;
  elements.polishPanel.hidden = true;
  elements.polishActions.hidden = true;
  elements.polishStatus.textContent = '';
  elements.polishResult.textContent = '';
}

async function polishReport() {
  if (!aiEnabled || reportPolishing) return;
  const data = getReportData();
  if (!data.entries.length) {
    showToast('这个周期还没有工作记录，先记录进展再润色');
    return;
  }
  reportPolishing = true;
  elements.polishPanel.hidden = false;
  elements.polishActions.hidden = true;
  elements.polishResult.textContent = '';
  elements.polishStatus.textContent = '正在润色，通常需要几秒…';
  elements.polishReportButton.disabled = true;
  try {
    const result = await requestPolish(buildReportText(data), 'report');
    pendingReportPolish = result;
    elements.polishResult.textContent = result;
    elements.polishStatus.textContent = '请核对事实与数字，确认后再替换';
    elements.polishActions.hidden = false;
  } catch (error) {
    elements.polishStatus.textContent = error.message || '润色失败，请稍后重试';
  } finally {
    reportPolishing = false;
    elements.polishReportButton.disabled = false;
  }
}

function applyReportPolish() {
  if (!pendingReportPolish) return;
  polishedReport = { type: activeReportType, stamp: activeReportDate, text: pendingReportPolish };
  closePolishPanel();
  renderReport();
  showToast('已换成润色稿，可随时恢复原文');
}

function restoreReportOriginal() {
  polishedReport = null;
  renderReport();
  showToast('已恢复原文');
}

function closeLogPolishPanel() {
  pendingLogPolish = null;
  elements.logPolishPanel.hidden = true;
  elements.logPolishActions.hidden = true;
  elements.logPolishStatus.textContent = '';
  elements.logPolishResult.textContent = '';
}

function resetLogPolishState() {
  closeLogPolishPanel();
  logPolishOriginal = null;
  elements.logPolishUndo.hidden = true;
}

async function polishLog() {
  if (!aiEnabled || logPolishing) return;
  const content = elements.note.value.trim();
  if (!content) {
    showToast('先填写实际进展，再润色');
    elements.note.focus();
    return;
  }
  logPolishing = true;
  logPolishOriginal = elements.note.value;
  elements.logPolishPanel.hidden = false;
  elements.logPolishActions.hidden = true;
  elements.logPolishResult.textContent = '';
  elements.logPolishStatus.textContent = '正在润色，通常需要几秒…';
  elements.logPolishButton.disabled = true;
  try {
    const result = await requestPolish(content, 'log');
    pendingLogPolish = result;
    elements.logPolishResult.textContent = result;
    elements.logPolishStatus.textContent = '请核对事实与数字，确认后再替换';
    elements.logPolishActions.hidden = false;
  } catch (error) {
    elements.logPolishStatus.textContent = error.message || '润色失败，请稍后重试';
  } finally {
    logPolishing = false;
    elements.logPolishButton.disabled = false;
  }
}

function applyLogPolish() {
  if (!pendingLogPolish) return;
  elements.note.value = pendingLogPolish.slice(0, 600);
  closeLogPolishPanel();
  elements.logPolishUndo.hidden = logPolishOriginal === null;
  clearFormErrors();
  elements.note.focus();
}

function undoLogPolish() {
  if (logPolishOriginal === null) return;
  elements.note.value = logPolishOriginal;
  logPolishOriginal = null;
  elements.logPolishUndo.hidden = true;
  showToast('已恢复原措辞');
}

let recordsTab = 'archive';

function recordsProjectValue() {
  return elements.recordsProject.value || 'all';
}

function matchesKeyword(text, keyword) {
  return !keyword || text.toLowerCase().includes(keyword);
}

function renderRecordsProjectFilter() {
  const current = elements.recordsProject.value || 'all';
  const projects = [...new Set(tasks.map(task => task.project))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  elements.recordsProject.innerHTML = '<option value="all">全部项目</option>' + projects.map(project =>
    `<option value="${escapeHTML(project)}">${escapeHTML(project)}</option>`
  ).join('');
  elements.recordsProject.value = projects.includes(current) ? current : 'all';
}

function filteredArchived() {
  const keyword = elements.recordsSearch.value.trim().toLowerCase();
  const project = recordsProjectValue();
  const start = elements.archiveStart.value;
  const end = elements.archiveEnd.value;
  return tasks
    .filter(isArchived)
    .filter(task => project === 'all' || task.project === project)
    .filter(task => {
      const completed = dateStamp(new Date(task.completedAt));
      if (start && completed < start) return false;
      if (end && completed > end) return false;
      return true;
    })
    .filter(task => matchesKeyword([task.project, task.module, task.title, ...task.workLogs.map(log => log.content)].join(' '), keyword))
    .sort((a, b) => String(b.completedAt || '').localeCompare(String(a.completedAt || '')));
}

function renderArchive() {
  const archived = filteredArchived();
  elements.archiveCountLabel.textContent = archived.length ? `共 ${archived.length} 个工作项` : '';
  if (!archived.length) {
    const filtered = elements.recordsSearch.value.trim()
      || recordsProjectValue() !== 'all'
      || elements.archiveStart.value
      || elements.archiveEnd.value;
    elements.archiveList.innerHTML = `<p class="records-empty">${filtered
      ? '没有符合条件的归档工作项，可以换个关键词、项目或日期范围试试。'
      : `暂无归档。工作项标记完成满 ${ARCHIVE_AFTER_DAYS} 天后会自动移出看板、收进这里。`}</p>`;
    return;
  }
  const months = new Map();
  archived.forEach(task => {
    const date = new Date(task.completedAt);
    const key = `${date.getFullYear()}年${date.getMonth() + 1}月`;
    if (!months.has(key)) months.set(key, []);
    months.get(key).push(task);
  });
  elements.archiveList.innerHTML = [...months.entries()].map(([month, list], index) => `
    <details class="archive-month"${index === 0 ? ' open' : ''}>
      <summary>${month}<span>${list.length} 项</span></summary>
      <ul class="archive-month__list">${list.map(task => `
        <li><button class="archive-item" type="button" data-archive-task="${escapeHTML(task.id)}">
          <strong>${escapeHTML(taskLabel(task, true))}</strong>
          <span>${escapeHTML(task.project)} · ${formatShortDate(dateStamp(new Date(task.completedAt)))}完成 · ${task.workLogs.length} 条记录</span>
        </button></li>`).join('')}
      </ul>
    </details>`).join('');
}

function filteredLogEntries() {
  const keyword = elements.recordsSearch.value.trim().toLowerCase();
  const project = recordsProjectValue();
  const start = elements.logsStart.value;
  const end = elements.logsEnd.value;
  const entries = [];
  tasks.forEach(task => {
    if (project !== 'all' && task.project !== project) return;
    if (!matchesKeyword([task.project, task.module, task.title].join(' '), keyword)
      && !task.workLogs.some(log => matchesKeyword(log.content, keyword))) return;
    task.workLogs.forEach(log => {
      if (start && log.date < start) return;
      if (end && log.date > end) return;
      if (keyword && !matchesKeyword(log.content, keyword) && !matchesKeyword([task.project, task.module, task.title].join(' '), keyword)) return;
      entries.push({ task, log });
    });
  });
  return entries.sort((a, b) => b.log.date.localeCompare(a.log.date) || a.task.title.localeCompare(b.task.title, 'zh-CN'));
}

function renderLogs() {
  const entries = filteredLogEntries();
  elements.logsCountLabel.textContent = entries.length ? `共 ${entries.length} 条工作记录` : '';
  if (!entries.length) {
    elements.logsList.innerHTML = '<p class="records-empty">没有符合条件的记录，可以调整关键词、项目或日期范围。</p>';
    return;
  }
  const days = new Map();
  entries.forEach(entry => {
    if (!days.has(entry.log.date)) days.set(entry.log.date, []);
    days.get(entry.log.date).push(entry);
  });
  elements.logsList.innerHTML = [...days.entries()].map(([date, list]) => `
    <section class="log-record-day">
      <h5>${formatShortDate(date)} · ${WEEKDAYS[parseDateStamp(date).getDay()]}</h5>
      <ul>${list.map(({ task, log }) => `
        <li><button class="log-record" type="button" data-log-task="${escapeHTML(task.id)}">
          <strong>${escapeHTML(task.project)}｜${escapeHTML(taskLabel(task, true))}</strong>
          <span>${escapeHTML(log.content)}</span>
        </button></li>`).join('')}</ul>
    </section>`).join('');
}

function renderBackup() {
  const logCount = tasks.reduce((sum, task) => sum + task.workLogs.length, 0);
  const archivedCount = tasks.filter(isArchived).length;
  elements.backupStat.textContent = `当前共 ${tasks.length} 个工作项 · ${logCount} 条工作记录${archivedCount ? ` · ${archivedCount} 项已归档` : ''}`;
}

function renderRecords() {
  if (recordsTab === 'archive') renderArchive();
  else if (recordsTab === 'logs') renderLogs();
  else renderBackup();
}

function setRecordsTab(tab, moveFocus = false) {
  recordsTab = ['archive', 'logs', 'backup'].includes(tab) ? tab : 'archive';
  elements.recordsTabs.querySelectorAll('[data-records-tab]').forEach(button => {
    const selected = button.dataset.recordsTab === recordsTab;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
    if (selected && moveFocus) button.focus();
  });
  document.querySelectorAll('[data-records-panel]').forEach(panel => {
    panel.hidden = panel.dataset.recordsPanel !== recordsTab;
  });
  elements.recordsFilters.hidden = recordsTab === 'backup';
  renderRecords();
}

function openRecordsDialog() {
  closeAllMenus();
  renderRecordsProjectFilter();
  setRecordsTab(recordsTab);
  elements.recordsDialog.showModal();
  document.body.classList.add('modal-open');
}

function openTaskFromRecords(taskId) {
  const task = tasks.find(item => item.id === taskId);
  if (!task) return;
  openTaskDialog(task.status, task);
}

function syncModalClass() {
  document.body.classList.toggle('modal-open', Boolean(document.querySelector('dialog[open]')));
}

function exportData() {
  const payload = { app: 'FishDesk', version: 1, exportedAt: new Date().toISOString(), rev: serverRev, tasks };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `FishDesk-backup-${dateStamp()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
  showToast('已导出全部数据，可保存到本机之外');
}

async function importDataFile(file) {
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch (error) {
    showToast('备份文件不是合法的 JSON');
    return;
  }
  const rawTasks = Array.isArray(parsed) ? parsed : parsed && Array.isArray(parsed.tasks) ? parsed.tasks : null;
  if (!rawTasks) {
    showToast('备份文件里没有工作项数据');
    return;
  }
  const imported = normalizeTaskList(rawTasks);
  if (!imported.length) {
    showToast('备份文件中没有可导入的工作项');
    return;
  }
  const confirmed = window.confirm(`将用备份中的 ${imported.length} 个工作项覆盖当前 ${tasks.length} 个工作项。\n建议先导出当前数据再导入。确定继续？`);
  elements.importFileInput.value = '';
  if (!confirmed) return;
  try {
    const latest = await apiRequest('/api/tasks');
    const result = await apiRequest('/api/tasks', { method: 'PUT', body: { baseRev: latest.rev, tasks: imported } });
    tasks = imported;
    serverRev = result.rev;
    lastSyncedTasks = imported.map(task => ({ ...task, workLogs: task.workLogs.map(log => ({ ...log })) }));
    cacheTasks();
    setSyncStatus('已同步到服务器');
    render({ animate: true });
    renderRecordsProjectFilter();
    renderRecords();
    showToast(`已导入 ${imported.length} 个工作项`);
  } catch (error) {
    if (error.status === 401) {
      redirectToLogin();
      return;
    }
    showToast('导入失败，当前数据未改动');
  }
}

const UPDATE_ACTIVE_STATES = new Set(['checking', 'downloading', 'maintenance', 'backing_up', 'restarting', 'verifying', 'rolling_back']);
let updateInfo = null;
let updatePollTimer = null;
let updateActionPending = false;
let updateCompletionNotified = false;

function isUpdateActive(data) {
  const status = data && data.status;
  return Boolean(status && (UPDATE_ACTIVE_STATES.has(status.state) || UPDATE_ACTIVE_STATES.has(status.phase)));
}

function renderUpdateInfo(data) {
  if (!data) return;
  updateInfo = data;
  const status = data.status || {};
  const active = isUpdateActive(data);
  elements.updateCurrentVersion.textContent = `v${data.currentVersion}`;
  elements.updateLatestVersion.textContent = data.latestVersion ? `v${data.latestVersion}` : '未检查';
  elements.updateProgress.hidden = !active;
  elements.updateCheckButton.disabled = active || updateActionPending;
  elements.updateRunButton.disabled = active || updateActionPending || !data.available || !data.updateAvailable || data.requiresUpdaterUpdate;
  elements.updateRunButton.textContent = active ? '升级中…' : '立即升级';
  elements.updateBadge.classList.toggle('is-on', active || data.updateAvailable || status.state === 'succeeded');
  elements.updateBadge.textContent = active ? '升级中' : data.updateAvailable ? '有新版本' : status.state === 'failed' ? '升级失败' : `v${data.currentVersion}`;
  elements.updateStatus.classList.toggle('is-error', Boolean(data.checkError) || status.state === 'failed');
  elements.updateStatus.classList.toggle('is-success', status.state === 'succeeded');
  if (data.requiresUpdaterUpdate) {
    elements.updateStatus.textContent = '本次更新需要先升级服务器更新器，应用和数据尚未改动。请查看部署说明。';
  } else if (data.checkError) {
    elements.updateStatus.textContent = data.checkError;
  } else if (!data.available) {
    elements.updateStatus.textContent = '当前运行方式未启用网页升级；部署到云服务器后可在这里一键升级。';
  } else if (active || status.state === 'failed' || status.state === 'succeeded') {
    elements.updateStatus.textContent = status.message || status.error || '正在处理升级…';
  } else if (data.updateAvailable) {
    elements.updateStatus.textContent = `发现新版本 v${data.latestVersion}，升级期间会短暂中断访问。`;
  } else if (data.latestVersion) {
    elements.updateStatus.textContent = '当前已经是最新版本。';
  } else {
    elements.updateStatus.textContent = '点击“检查更新”获取官方最新版本。';
  }
}

function scheduleUpdatePoll() {
  clearTimeout(updatePollTimer);
  if (!isUpdateActive(updateInfo) || !elements.settingsDialog.open) return;
  updatePollTimer = setTimeout(pollUpdateStatus, 2000);
}

async function pollUpdateStatus() {
  if (updateActionPending) return;
  try {
    const data = await apiRequest('/api/update');
    const wasActive = isUpdateActive(updateInfo);
    renderUpdateInfo(data);
    if (wasActive && data.status && data.status.state === 'succeeded' && !updateCompletionNotified) {
      updateCompletionNotified = true;
      showToast(`已升级到 v${data.currentVersion}，数据已恢复同步`);
      syncFromServer();
    }
  } catch (error) {
    if (error.status === 401) {
      redirectToLogin();
      return;
    }
    if (isUpdateActive(updateInfo)) {
      elements.updateStatus.textContent = '服务正在重启，请稍候，页面会自动恢复…';
    }
  } finally {
    scheduleUpdatePoll();
  }
}

async function loadUpdateInfo(check = false) {
  const data = await apiRequest(check ? '/api/update?check=1' : '/api/update');
  renderUpdateInfo(data);
  scheduleUpdatePoll();
  return data;
}

async function handleUpdateCheck() {
  if (updateActionPending) return;
  updateActionPending = true;
  let failureMessage = '';
  elements.updateCheckButton.disabled = true;
  elements.updateStatus.classList.remove('is-error', 'is-success');
  elements.updateStatus.textContent = '正在检查官方最新版本…';
  try {
    await loadUpdateInfo(true);
  } catch (error) {
    if (error.status === 401) {
      redirectToLogin();
      return;
    }
    failureMessage = (error.data && error.data.error) || '检查更新失败，请稍后重试';
  } finally {
    updateActionPending = false;
    if (updateInfo) renderUpdateInfo(updateInfo);
    if (failureMessage) {
      elements.updateStatus.textContent = failureMessage;
      elements.updateStatus.classList.add('is-error');
    }
  }
}

async function waitForCurrentSave() {
  const startedAt = Date.now();
  while (saving && Date.now() - startedAt < 15000) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

async function saveChangesBeforeUpdate() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  await waitForCurrentSave();
  if (!lastSyncedTasks || JSON.stringify(tasks) !== JSON.stringify(lastSyncedTasks)) await flushSave();
  await waitForCurrentSave();
  if (!lastSyncedTasks || JSON.stringify(tasks) !== JSON.stringify(lastSyncedTasks) || saving) {
    throw new Error('工作记录尚未同步，已保留在本机。请检查网络后再升级。');
  }
}

async function handleUpdateRequest() {
  if (updateActionPending || !updateInfo || !updateInfo.updateAvailable) return;
  if (!window.confirm(`确定升级到 v${updateInfo.latestVersion}？\n\n系统会先保存当前记录并自动备份全部数据，升级期间会短暂中断访问；失败会自动回滚。`)) return;
  updateActionPending = true;
  updateCompletionNotified = false;
  let failureMessage = '';
  elements.updateRunButton.disabled = true;
  elements.updateCheckButton.disabled = true;
  elements.updateStatus.textContent = '正在保存本机工作记录…';
  try {
    await saveChangesBeforeUpdate();
    const data = await apiRequest('/api/update', { method: 'POST', body: { action: 'upgrade' } });
    renderUpdateInfo(data);
    scheduleUpdatePoll();
  } catch (error) {
    if (error.status === 401) {
      redirectToLogin();
      return;
    }
    failureMessage = (error.data && error.data.error) || (error instanceof ApiError ? '升级请求提交失败，当前数据未改动' : error.message);
  } finally {
    updateActionPending = false;
    if (updateInfo) renderUpdateInfo(updateInfo);
    if (failureMessage) {
      elements.updateStatus.textContent = failureMessage;
      elements.updateStatus.classList.add('is-error');
    }
    scheduleUpdatePoll();
  }
}

function setSettingsTestStatus(kind, message) {
  elements.aiTestResult.textContent = message;
  elements.aiTestResult.classList.toggle('is-success', kind === 'success');
  elements.aiTestResult.classList.toggle('is-error', kind === 'error');
}

function applySettingsToForm(data) {
  const ai = data && data.ai ? data.ai : {};
  if (data && THEME_LABELS[data.theme]) applyTheme(data.theme);
  elements.settingsAiBaseUrl.value = ai.baseUrl || '';
  elements.settingsAiModel.value = ai.model || '';
  elements.settingsSessionDays.value = data && Number.isInteger(data.sessionDays) ? data.sessionDays : '';
  const configured = Boolean(ai.keyConfigured);
  elements.aiConfigBadge.textContent = ai.enabled ? '已启用' : '未配置';
  elements.aiConfigBadge.classList.toggle('is-on', Boolean(ai.enabled));
  elements.aiKeyMasked.textContent = configured ? ai.keyMasked : '未保存';
  elements.settingsAiKey.placeholder = configured ? '已保存，留空表示不修改' : 'sk-...';
  elements.aiClearKeyButton.hidden = !configured;
}

async function openSettingsDialog() {
  elements.settingsForm.reset();
  elements.settingsAiKey.value = '';
  elements.passwordError.textContent = '';
  elements.passwordError.classList.remove('is-visible');
  elements.aiKeyMasked.textContent = '读取中…';
  elements.aiConfigBadge.textContent = '读取中';
  elements.aiConfigBadge.classList.remove('is-on');
  setSettingsTestStatus('', '');
  elements.settingsDialog.showModal();
  document.body.classList.add('modal-open');
  loadUpdateInfo().catch(error => {
    if (error.status === 401) {
      redirectToLogin();
      return;
    }
    elements.updateBadge.textContent = '读取失败';
    elements.updateStatus.textContent = '版本信息读取失败，请关闭设置后重试';
    elements.updateStatus.classList.add('is-error');
  });
  try {
    applySettingsToForm(await apiRequest('/api/settings'));
  } catch (error) {
    if (error.status === 401) {
      redirectToLogin();
      return;
    }
    elements.aiKeyMasked.textContent = '读取失败';
    elements.aiConfigBadge.textContent = '读取失败';
  }
}

async function handleSettingsSubmit(event) {
  event.preventDefault();
  const key = elements.settingsAiKey.value.trim();
  const baseUrl = elements.settingsAiBaseUrl.value.trim();
  const model = elements.settingsAiModel.value.trim();
  const days = elements.settingsSessionDays.value.trim();
  const body = { aiBaseUrl: baseUrl, aiModel: model };
  if (key) body.aiKey = key;
  if (days) body.sessionDays = Number(days);
  elements.settingsSaveButton.disabled = true;
  setSettingsTestStatus('', '');
  try {
    const data = await apiRequest('/api/settings', { method: 'PUT', body });
    applySettingsToForm(data);
    await loadAIStatus();
    elements.settingsDialog.close();
    showToast(data && data.ai && data.ai.enabled ? '设置已保存，AI 润色已可用' : '设置已保存');
  } catch (error) {
    if (error.status === 401) {
      redirectToLogin();
      return;
    }
    setSettingsTestStatus('error', (error.data && error.data.error) || '保存失败，请稍后重试');
  } finally {
    elements.settingsSaveButton.disabled = false;
  }
}

async function handleAITest() {
  const key = elements.settingsAiKey.value.trim();
  const body = {
    aiBaseUrl: elements.settingsAiBaseUrl.value.trim(),
    aiModel: elements.settingsAiModel.value.trim()
  };
  if (key) body.aiKey = key;
  elements.aiTestButton.disabled = true;
  setSettingsTestStatus('', '正在测试连接…');
  try {
    const data = await apiRequest('/api/ai/test', { method: 'POST', body });
    const ok = Boolean(data && data.ok);
    setSettingsTestStatus(ok ? 'success' : 'error', (data && data.message) || (ok ? '连接成功' : '连接失败'));
  } catch (error) {
    if (error.status === 401) {
      redirectToLogin();
      return;
    }
    setSettingsTestStatus('error', (error.data && error.data.error) || '测试失败，请稍后重试');
  } finally {
    elements.aiTestButton.disabled = false;
  }
}

async function clearAIKey() {
  if (!window.confirm('确定清除已保存的 API Key？清除后 AI 润色入口会隐藏。')) return;
  elements.aiClearKeyButton.disabled = true;
  try {
    const data = await apiRequest('/api/settings', { method: 'PUT', body: { clearAiKey: true } });
    applySettingsToForm(data);
    await loadAIStatus();
    setSettingsTestStatus('success', '已清除 API Key');
  } catch (error) {
    if (error.status === 401) {
      redirectToLogin();
      return;
    }
    setSettingsTestStatus('error', (error.data && error.data.error) || '清除失败，请稍后重试');
  } finally {
    elements.aiClearKeyButton.disabled = false;
  }
}

function showPasswordError(message) {
  elements.passwordError.textContent = message;
  elements.passwordError.classList.add('is-visible');
}

async function handlePasswordSubmit() {
  const current = elements.currentPassword.value;
  const next = elements.newPassword.value;
  const confirmation = elements.confirmPassword.value;
  elements.passwordError.textContent = '';
  elements.passwordError.classList.remove('is-visible');
  if (!current) {
    showPasswordError('请输入当前密码。');
    return;
  }
  if (next.length < 8) {
    showPasswordError('新密码至少 8 位。');
    return;
  }
  if (next !== confirmation) {
    showPasswordError('两次输入的新密码不一致。');
    return;
  }
  elements.passwordSubmit.disabled = true;
  try {
    await apiRequest('/api/password', { method: 'POST', body: { currentPassword: current, newPassword: next } });
    elements.currentPassword.value = '';
    elements.newPassword.value = '';
    elements.confirmPassword.value = '';
    showToast('密码已更新，当前设备保持登录，其他设备需要重新登录');
  } catch (error) {
    if (error.status === 401) {
      showPasswordError((error.data && error.data.error) || '当前密码不正确。');
    } else {
      showPasswordError((error.data && error.data.error) || '修改失败，请稍后重试。');
    }
  } finally {
    elements.passwordSubmit.disabled = false;
  }
}

function openReportDialog() {
  closeAllMenus();
  renderReport();
  elements.reportDialog.showModal();
  document.body.classList.add('modal-open');
}

function selectReportType(type, moveFocus = false) {
  if (!REPORT_META[type]) return;
  activeReportType = type;
  renderReport();
  if (moveFocus) document.querySelector(`#report-tab-${type}`).focus();
}

function handleReportTabKeys(event) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const types = Object.keys(REPORT_META);
  const currentIndex = types.indexOf(activeReportType);
  let nextIndex = currentIndex;
  if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % types.length;
  if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + types.length) % types.length;
  if (event.key === 'Home') nextIndex = 0;
  if (event.key === 'End') nextIndex = types.length - 1;
  selectReportType(types[nextIndex], true);
}

function setDateAndGreeting() {
  const now = new Date();
  document.querySelector('#current-date').textContent = dateStamp(now).replaceAll('-', ' / ');
  document.querySelector('#current-weekday').textContent = `${new Intl.DateTimeFormat('zh-CN', { weekday: 'long' }).format(now)} · WORKLOG`;
  const hour = now.getHours();
  const greeting = hour < 6 ? '夜深了，' : hour < 11 ? '早上好，' : hour < 14 ? '中午好，' : hour < 18 ? '下午好，' : '晚上好，';
  document.querySelector('#greeting').innerHTML = `${greeting}<br><span>把问题逐项闭环。</span>`;
}

document.querySelector('#new-task-button').addEventListener('click', () => openTaskDialog());
document.querySelector('#report-button').addEventListener('click', openReportDialog);
document.querySelector('#records-button').addEventListener('click', openRecordsDialog);
document.querySelector('.records-close').addEventListener('click', () => elements.recordsDialog.close());
document.querySelector('#records-close-button').addEventListener('click', () => elements.recordsDialog.close());
elements.recordsTabs.addEventListener('click', event => {
  const tab = event.target.closest('[data-records-tab]');
  if (tab) setRecordsTab(tab.dataset.recordsTab);
});
elements.recordsSearch.addEventListener('input', renderRecords);
elements.recordsProject.addEventListener('change', renderRecords);
elements.logsStart.addEventListener('change', renderRecords);
elements.logsEnd.addEventListener('change', renderRecords);
elements.archiveStart.addEventListener('change', renderRecords);
elements.archiveEnd.addEventListener('change', renderRecords);
elements.archiveList.addEventListener('click', event => {
  const item = event.target.closest('[data-archive-task]');
  if (item) openTaskFromRecords(item.dataset.archiveTask);
});
elements.logsList.addEventListener('click', event => {
  const item = event.target.closest('[data-log-task]');
  if (item) openTaskFromRecords(item.dataset.logTask);
});
document.querySelector('#export-data-button').addEventListener('click', exportData);
document.querySelector('#import-data-button').addEventListener('click', () => elements.importFileInput.click());
elements.importFileInput.addEventListener('change', () => {
  const file = elements.importFileInput.files && elements.importFileInput.files[0];
  if (file) importDataFile(file);
});
document.querySelector('#settings-button').addEventListener('click', openSettingsDialog);
document.querySelector('.settings-close').addEventListener('click', () => elements.settingsDialog.close());
document.querySelector('.settings-cancel').addEventListener('click', () => elements.settingsDialog.close());
elements.settingsForm.addEventListener('submit', handleSettingsSubmit);
elements.updateCheckButton.addEventListener('click', handleUpdateCheck);
elements.updateRunButton.addEventListener('click', handleUpdateRequest);
elements.settingsForm.addEventListener('keydown', event => {
  if (event.key === 'Enter' && event.target.closest('.settings-password')) {
    event.preventDefault();
    handlePasswordSubmit();
  }
});
elements.passwordSubmit.addEventListener('click', handlePasswordSubmit);
document.querySelectorAll('[data-theme-choice]').forEach(button => {
  button.addEventListener('click', () => selectTheme(button.dataset.themeChoice));
});
elements.aiTestButton.addEventListener('click', handleAITest);
elements.aiClearKeyButton.addEventListener('click', clearAIKey);
elements.reportAISetupButton.addEventListener('click', () => {
  elements.reportDialog.close();
  openSettingsDialog();
});
document.querySelector('.dialog-close').addEventListener('click', () => elements.dialog.close());
document.querySelector('.dialog-cancel').addEventListener('click', () => elements.dialog.close());
document.querySelector('.report-close').addEventListener('click', () => elements.reportDialog.close());
document.querySelector('#copy-report-button').addEventListener('click', copyReport);
document.querySelector('#download-report-button').addEventListener('click', downloadReport);
document.querySelector('#print-report-button').addEventListener('click', () => window.print());
elements.polishReportButton.addEventListener('click', polishReport);
elements.polishApply.addEventListener('click', applyReportPolish);
elements.polishDiscard.addEventListener('click', closePolishPanel);
elements.polishClose.addEventListener('click', closePolishPanel);
elements.restoreReportButton.addEventListener('click', restoreReportOriginal);
elements.logPolishButton.addEventListener('click', polishLog);
elements.logPolishApply.addEventListener('click', applyLogPolish);
elements.logPolishCancel.addEventListener('click', closeLogPolishPanel);
elements.logPolishClose.addEventListener('click', closeLogPolishPanel);
elements.logPolishUndoButton.addEventListener('click', undoLogPolish);
elements.form.addEventListener('submit', handleFormSubmit);
elements.title.addEventListener('input', clearFormErrors);
elements.note.addEventListener('input', clearFormErrors);
elements.dialog.addEventListener('close', syncModalClass);
elements.reportDialog.addEventListener('close', () => {
  closePolishPanel();
  syncModalClass();
});
elements.recordsDialog.addEventListener('close', syncModalClass);
elements.settingsDialog.addEventListener('close', () => {
  clearTimeout(updatePollTimer);
  syncModalClass();
});
elements.reportTabs.addEventListener('click', event => {
  const tab = event.target.closest('[data-report-type]');
  if (tab) selectReportType(tab.dataset.reportType);
});
elements.reportTabs.addEventListener('keydown', handleReportTabKeys);
elements.reportDate.addEventListener('change', () => {
  if (isDateStamp(elements.reportDate.value)) {
    activeReportDate = elements.reportDate.value;
    renderReport();
  }
});
elements.reportPrev.addEventListener('click', () => shiftReportPeriod(-1));
elements.reportNext.addEventListener('click', () => shiftReportPeriod(1));
elements.logEditReset.addEventListener('click', resetLogEditing);
elements.logUndoButton.addEventListener('click', undoLogDeletion);
elements.logHistoryList.addEventListener('click', event => {
  const target = event.target.closest('[data-log-action]');
  if (!target) return;
  if (target.dataset.logAction === 'load') loadWorkLog(target.dataset.logDate);
  if (target.dataset.logAction === 'delete') deleteWorkLog(target.dataset.logDate);
});
elements.projectFilter.addEventListener('change', () => {
  selectedProject = elements.projectFilter.value;
  render();
});
elements.board.addEventListener('click', handleBoardClick);
elements.board.addEventListener('keydown', handleMenuKeyboard);
elements.board.addEventListener('dragstart', handleDragStart);
elements.board.addEventListener('dragover', handleDragOver);
elements.board.addEventListener('drop', handleDrop);
elements.board.addEventListener('dragend', handleDragEnd);
elements.undoButton.addEventListener('click', undoLastAction);
document.addEventListener('click', event => { if (!event.target.closest('.task-card')) closeAllMenus(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeAllMenus(); });
[elements.dialog, elements.reportDialog, elements.recordsDialog, elements.settingsDialog].forEach(dialog => {
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
});

const logoutButton = document.querySelector('#logout-button');
if (logoutButton) {
  logoutButton.addEventListener('click', async () => {
    try {
      await apiRequest('/api/logout', { method: 'POST' });
    } catch (error) {
      console.warn('退出登录请求失败。', error);
    }
    location.replace('/login');
  });
}

boot();
