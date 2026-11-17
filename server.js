'use strict';

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const DATA_FILE = path.join(DATA_DIR, 'daylight.json');
const AUTH_FILE = path.join(DATA_DIR, 'auth.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const SECRET_FILE = path.join(DATA_DIR, 'session.secret');
const PASSWORD = process.env.PASSWORD || '';
const ENV_SESSION_DAYS = Math.min(365, Math.max(1, Number(process.env.SESSION_DAYS) || 30));
const COOKIE_NAME = 'daylight_session';
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_TASKS = 5000;
const STATUSES = new Set(['todo', 'doing', 'done']);
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_MAX_FAILURES = 8;
const APP_VERSION = require('./package.json').version;
const UPDATE_ENABLED = process.env.FISHDESK_UPDATE_ENABLED === '1';
const UPDATE_REQUEST_FILE = process.env.UPDATE_REQUEST_FILE || '/update/requests/upgrade.json';
const UPDATE_STATUS_FILE = process.env.UPDATE_STATUS_FILE || '/update/status/status.json';
const UPDATE_RELEASE_URL = 'https://github.com/LaoGuaiGe/FishDesk/releases/latest/download/release.json';
const UPDATE_IMAGE = 'ghcr.io/laoguaige/fishdesk';
const UPDATER_VERSION = 1;
const UPDATE_CACHE_MS = 5 * 60 * 1000;
const UPDATE_ACTIVE_STATES = new Set(['checking', 'downloading', 'maintenance', 'backing_up', 'restarting', 'verifying', 'rolling_back']);
const UPDATE_MAINTENANCE_STATES = new Set(['maintenance', 'backing_up', 'restarting', 'verifying', 'rolling_back']);

// AI 润色：默认对接 DeepSeek。密钥等配置优先读取界面「设置」保存的 config.json，
// 环境变量只作为首次运行的默认值；修改后立即生效，无需重启。
const ENV_AI_BASE_URL = String(process.env.AI_BASE_URL || 'https://api.deepseek.com').trim().replace(/\/+$/, '');
const ENV_AI_API_KEY = String(process.env.AI_API_KEY || '').trim();
const ENV_AI_MODEL = String(process.env.AI_MODEL || 'deepseek-chat').trim();
const AI_TIMEOUT_MS = 60000;
const AI_TEST_TIMEOUT_MS = 20000;
const AI_MAX_INPUT = 12000;
const AI_SYSTEM_PROMPT = [
  '你是中文技术写作润色助手，服务对象是嵌入式研发工程师。',
  '任务：在完全保留原意的前提下润色下面的工作记录或工作报告，让表达更通顺、简洁、专业。',
  '硬性要求：',
  '1. 所有事实、数字、日期、时间、项目名、模块名、型号、专有名词、命令、单位必须原样保留，不得增删、改写、换算或猜测。',
  '2. 不得新增原文没有的工作内容、结论、评价或承诺；无法确定的内容保持原样。',
  '3. 保持原有的条目数量、顺序和分段结构，不要合并或拆分条目。',
  '4. 只输出润色后的正文本身，不要加标题、解释、前后缀，也不要使用 Markdown 代码块。'
].join('\n');

const STATIC_FILES = new Map([
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
  ['/styles.css', 'styles.css'],
  ['/app.js', 'app.js']
]);
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8'
};

let auth = null;

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function writeAuthFile() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmpFile = `${AUTH_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmpFile, `${JSON.stringify(auth, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmpFile, AUTH_FILE);
}

function loadAuth() {
  try {
    const parsed = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
    if (typeof parsed.salt === 'string' && typeof parsed.hash === 'string' && Number.isInteger(parsed.version)) {
      return {
        salt: parsed.salt,
        hash: parsed.hash,
        version: parsed.version,
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null
      };
    }
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('[fishdesk] 密码文件读取失败：', error.message);
  }
  return null;
}

auth = loadAuth();
if (!auth) {
  if (!PASSWORD) {
    console.error('[fishdesk] 首次启动需要设置 PASSWORD 环境变量（之后可直接在界面修改密码）。');
    console.error('[fishdesk] 示例：PASSWORD=你的访问密码 node server.js');
    process.exit(1);
  }
  const salt = crypto.randomBytes(16).toString('hex');
  auth = { salt, hash: hashPassword(PASSWORD, salt), version: 1, updatedAt: new Date().toISOString() };
  writeAuthFile();
  console.log('[fishdesk] 首次启动：已用环境变量密码初始化，之后可在界面修改密码');
}

// ---------- 运行期配置（可在网页设置里修改，保存后立即生效） ----------

const THEMES = new Set(['light', 'dark', 'system']);

let runtimeConfig = loadRuntimeConfig();

function loadRuntimeConfig() {
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    const result = {};
    if (typeof parsed.aiApiKey === 'string') result.aiApiKey = parsed.aiApiKey.trim();
    if (typeof parsed.aiBaseUrl === 'string' && parsed.aiBaseUrl.trim()) result.aiBaseUrl = parsed.aiBaseUrl.trim();
    if (typeof parsed.aiModel === 'string' && parsed.aiModel.trim()) result.aiModel = parsed.aiModel.trim();
    if (Number.isInteger(parsed.sessionDays)) result.sessionDays = Math.min(365, Math.max(1, parsed.sessionDays));
    if (THEMES.has(parsed.theme)) result.theme = parsed.theme;
    return result;
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('[fishdesk] 配置文件读取失败：', error.message);
    return {};
  }
}

function persistRuntimeConfig() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const payload = { ...runtimeConfig, updatedAt: new Date().toISOString() };
  const tmpFile = `${CONFIG_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmpFile, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmpFile, CONFIG_FILE);
}

function getSessionDays() {
  return runtimeConfig.sessionDays || ENV_SESSION_DAYS;
}

function getAIConfig() {
  const baseUrl = String(runtimeConfig.aiBaseUrl || ENV_AI_BASE_URL || 'https://api.deepseek.com').trim().replace(/\/+$/, '');
  const model = String(runtimeConfig.aiModel || ENV_AI_MODEL || 'deepseek-chat').trim();
  // 界面保存过 '' 表示用户主动清除，优先于环境变量；从未保存过才回退到环境变量
  const apiKey = typeof runtimeConfig.aiApiKey === 'string'
    ? runtimeConfig.aiApiKey
    : ENV_AI_API_KEY;
  return { baseUrl, model, apiKey, enabled: Boolean(baseUrl && model && apiKey) };
}

function maskApiKey(key) {
  if (!key) return '';
  if (key.length <= 8) return '••••••';
  return `${key.slice(0, 3)}••••••${key.slice(-4)}`;
}

function publicSettings() {
  const ai = getAIConfig();
  return {
    ai: {
      enabled: ai.enabled,
      keyConfigured: Boolean(ai.apiKey),
      keyMasked: maskApiKey(ai.apiKey),
      baseUrl: ai.baseUrl,
      model: ai.model
    },
    sessionDays: getSessionDays(),
    theme: runtimeConfig.theme || 'system'
  };
}

function normalizeBaseUrl(value) {
  const raw = String(value || '').trim().replace(/\/+$/, '');
  if (!raw) return ENV_AI_BASE_URL || 'https://api.deepseek.com';
  if (raw.length > 300) return null;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  return raw;
}

function normalizeModel(value) {
  const raw = String(value || '').trim();
  if (!raw) return ENV_AI_MODEL || 'deepseek-chat';
  if (raw.length > 100) return null;
  return raw;
}

let sessionSecret = null;

function getSessionSecret() {
  if (sessionSecret) return sessionSecret;
  if (process.env.SESSION_SECRET) {
    sessionSecret = process.env.SESSION_SECRET;
    return sessionSecret;
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  try {
    const stored = fs.readFileSync(SECRET_FILE, 'utf8').trim();
    if (stored) {
      sessionSecret = stored;
      return sessionSecret;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  sessionSecret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SECRET_FILE, sessionSecret, { mode: 0o600 });
  return sessionSecret;
}

function hmac(payload) {
  return crypto.createHmac('sha256', getSessionSecret()).update(payload).digest('base64url');
}

function signSession() {
  const sessionDays = getSessionDays();
  const expiresAt = Date.now() + sessionDays * 86400000;
  const payload = Buffer.from(JSON.stringify({ exp: expiresAt, pv: auth.version }), 'utf8').toString('base64url');
  return `${payload}.${hmac(payload)}`;
}

function verifySession(token) {
  if (typeof token !== 'string' || !token) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payload, signature] = parts;
  if (!payload || !/^[A-Za-z0-9_-]{43}$/.test(signature)) return false;
  const expected = hmac(payload);
  if (expected.length !== signature.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.pv === auth.version && typeof data.exp === 'number' && data.exp > Date.now();
  } catch {
    return false;
  }
}

function parseCookies(header) {
  const result = {};
  if (!header) return result;
  header.split(';').forEach(part => {
    const index = part.indexOf('=');
    if (index === -1) return;
    try {
      result[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      // Malformed cookie values are untrusted input, not server failures.
    }
  });
  return result;
}

function isAuthenticated(req) {
  return verifySession(parseCookies(req.headers.cookie)[COOKIE_NAME]);
}

function isSecureRequest(req) {
  if (req.socket && req.socket.encrypted) return true;
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  return proto === 'https';
}

function sessionCookie(value, maxAgeSeconds, secure) {
  const parts = [`${COOKIE_NAME}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSeconds}`];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function checkPassword(input) {
  if (typeof input !== 'string' || !input) return false;
  const expected = Buffer.from(auth.hash, 'hex');
  const actual = Buffer.from(hashPassword(input, auth.salt), 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

const loginAttempts = new Map();

function isRateLimited(ip) {
  const record = loginAttempts.get(ip);
  if (!record) return false;
  if (Date.now() - record.firstAt > LOGIN_WINDOW_MS) {
    loginAttempts.delete(ip);
    return false;
  }
  return record.failures >= LOGIN_MAX_FAILURES;
}

function recordFailure(ip) {
  const record = loginAttempts.get(ip);
  if (!record || Date.now() - record.firstAt > LOGIN_WINDOW_MS) {
    loginAttempts.set(ip, { failures: 1, firstAt: Date.now() });
    return;
  }
  record.failures += 1;
}

let store = null;
let storePromise = null;
let writeChain = Promise.resolve();

async function getStore() {
  if (store) return store;
  if (storePromise) return storePromise;
  storePromise = (async () => {
    await fsp.mkdir(DATA_DIR, { recursive: true });
    try {
      const raw = await fsp.readFile(DATA_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed || !Number.isInteger(parsed.rev) || parsed.rev < 0 || !validateTasks(parsed.tasks)) {
        throw new Error('工作数据结构不合法');
      }
      store = {
        rev: Number.isInteger(parsed.rev) ? parsed.rev : 0,
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks : []
      };
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('[fishdesk] 数据文件读取失败，已禁止覆盖原文件：', error.message);
        throw httpError(503, '工作数据读取失败，已保留原文件，请检查或恢复备份');
      }
      store = { rev: 0, updatedAt: null, tasks: [] };
    }
    return store;
  })();
  try {
    return await storePromise;
  } finally {
    storePromise = null;
  }
}

function persist(tasks, baseRev) {
  const tmpFile = `${DATA_FILE}.${process.pid}.tmp`;
  const operation = writeChain.then(async () => {
    const current = await getStore();
    if (baseRev !== current.rev) return { conflict: current };
    const next = { tasks, rev: current.rev + 1, updatedAt: new Date().toISOString() };
    const snapshot = `${JSON.stringify(next)}\n`;
    try {
      await fsp.writeFile(tmpFile, snapshot, 'utf8');
      await fsp.rename(tmpFile, DATA_FILE);
    } catch (error) {
      console.error('[fishdesk] 数据写入失败：', error.message);
      throw httpError(503, '数据保存失败，服务器仍保留上次成功保存的数据，请稍后重试');
    }
    store = next;
    return { saved: next };
  });
  // Keep the queue usable after a failed write, while exposing failure to this request.
  writeChain = operation.catch(() => {});
  return operation;
}

function validateTasks(value) {
  if (!Array.isArray(value) || value.length > MAX_TASKS) return null;
  const seen = new Set();
  const result = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') return null;
    if (typeof item.id !== 'string' || !item.id || seen.has(item.id)) return null;
    if (typeof item.title !== 'string' || !item.title) return null;
    if (!STATUSES.has(item.status)) return null;
    if (!Array.isArray(item.workLogs)) return null;
    seen.add(item.id);
    result.push(item);
  }
  return result;
}

function sendJSON(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(body);
}

function sendText(res, status, text) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(text);
}

function redirect(res, location) {
  res.writeHead(302, {
    Location: location,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end();
}

function isJsonRequest(req) {
  return String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json');
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function readJSON(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let tooLarge = false;
    const chunks = [];
    req.on('data', chunk => {
      if (tooLarge) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooLarge) {
        reject(httpError(413, '请求体过大'));
        return;
      }
      if (!chunks.length) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(httpError(400, '请求体不是合法 JSON'));
      }
    });
    req.on('error', reject);
  });
}

function parseVersion(value) {
  if (typeof value !== 'string' || !/^\d+\.\d+\.\d+$/.test(value)) return null;
  return value.split('.').map(Number);
}

function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return 0;
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

function normalizeRelease(value) {
  if (!value || typeof value !== 'object') return null;
  if (!parseVersion(value.version) || value.image !== UPDATE_IMAGE) return null;
  if (typeof value.digest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(value.digest)) return null;
  if (!Number.isInteger(value.minUpdaterVersion) || value.minUpdaterVersion < 1) return null;
  return {
    version: value.version,
    image: value.image,
    digest: value.digest,
    minUpdaterVersion: value.minUpdaterVersion,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : null
  };
}

function defaultUpdateStatus() {
  return { state: 'idle', phase: 'idle', message: '尚未开始升级', currentVersion: APP_VERSION, latestVersion: null, backup: null, error: null, updatedAt: null };
}

async function includePendingUpdate(status) {
  try {
    await fsp.access(UPDATE_REQUEST_FILE);
    return { ...status, state: 'checking', phase: 'checking', message: '升级请求已提交，等待更新器处理', error: null };
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn('[fishdesk] 升级请求状态检查失败：', error.message);
    return status;
  }
}

async function readUpdateStatus() {
  try {
    const raw = await fsp.readFile(UPDATE_STATUS_FILE, 'utf8');
    const value = JSON.parse(raw);
    const status = defaultUpdateStatus();
    for (const key of ['state', 'phase', 'message', 'currentVersion', 'latestVersion', 'backup', 'error', 'updatedAt']) {
      if (typeof value[key] === 'string') status[key] = value[key].slice(0, 1000);
    }
    return includePendingUpdate(status);
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn('[fishdesk] 升级状态读取失败：', error.message);
    return includePendingUpdate(defaultUpdateStatus());
  }
}

async function rejectDuringMaintenance(res) {
  const status = await readUpdateStatus();
  if (!UPDATE_MAINTENANCE_STATES.has(status.state) && !UPDATE_MAINTENANCE_STATES.has(status.phase)) return false;
  sendJSON(res, 503, { maintenance: true, error: '系统正在升级，当前修改已保留在本机，请稍后同步' });
  return true;
}

let updateReleaseCache = { checkedAt: 0, release: null, error: null };

async function fetchLatestRelease(force = false) {
  if (!force && Date.now() - updateReleaseCache.checkedAt < UPDATE_CACHE_MS) {
    if (updateReleaseCache.release) return updateReleaseCache.release;
    if (updateReleaseCache.error) throw httpError(502, updateReleaseCache.error);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(UPDATE_RELEASE_URL, {
      headers: { Accept: 'application/json', 'User-Agent': `FishDesk/${APP_VERSION}` },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const release = normalizeRelease(await response.json());
    if (!release) throw new Error('发布清单格式不正确');
    updateReleaseCache = { checkedAt: Date.now(), release, error: null };
    return release;
  } catch (error) {
    const message = error.name === 'AbortError' ? '检查更新超时，请检查服务器网络' : '无法读取官方发布信息，请稍后重试';
    updateReleaseCache = { checkedAt: Date.now(), release: null, error: message };
    throw httpError(502, message);
  } finally {
    clearTimeout(timer);
  }
}

function updateResponse(status, release, checkError = null) {
  return {
    available: UPDATE_ENABLED,
    currentVersion: APP_VERSION,
    latestVersion: release ? release.version : null,
    updateAvailable: Boolean(release && compareVersions(release.version, APP_VERSION) > 0),
    requiresUpdaterUpdate: Boolean(release && release.minUpdaterVersion > UPDATER_VERSION),
    checkedAt: updateReleaseCache.checkedAt ? new Date(updateReleaseCache.checkedAt).toISOString() : null,
    checkError,
    status
  };
}

async function handleGetUpdate(req, res, url) {
  const status = await readUpdateStatus();
  let release = updateReleaseCache.release;
  let checkError = null;
  if (url.searchParams.get('check') === '1') {
    try {
      release = await fetchLatestRelease(true);
    } catch (error) {
      checkError = error.message;
    }
  }
  sendJSON(res, 200, updateResponse(status, release, checkError));
}

async function handleRequestUpdate(req, res) {
  if (!UPDATE_ENABLED) {
    sendJSON(res, 503, { error: '当前运行方式未启用网页升级，请使用服务器部署版本' });
    return;
  }
  if (!isJsonRequest(req)) {
    sendJSON(res, 415, { error: '需要 application/json 请求' });
    return;
  }
  let body;
  try {
    body = await readJSON(req);
  } catch (error) {
    sendJSON(res, error.status || 400, { error: '请求格式错误' });
    return;
  }
  if (!body || body.action !== 'upgrade' || Object.keys(body).some(key => key !== 'action')) {
    sendJSON(res, 400, { error: '升级请求只能包含固定的 upgrade 动作' });
    return;
  }
  const status = await readUpdateStatus();
  if (UPDATE_ACTIVE_STATES.has(status.state) || UPDATE_ACTIVE_STATES.has(status.phase)) {
    sendJSON(res, 409, { error: '已有升级任务正在执行', status });
    return;
  }
  try {
    await fsp.access(UPDATE_REQUEST_FILE);
    sendJSON(res, 409, { error: '升级请求已提交，请等待更新器处理' });
    return;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  let release;
  try {
    release = await fetchLatestRelease();
  } catch (error) {
    sendJSON(res, error.status || 502, { error: error.message || '无法检查官方最新版本' });
    return;
  }
  if (release.minUpdaterVersion > UPDATER_VERSION) {
    sendJSON(res, 409, { error: '本次更新需要先升级服务器更新器，应用和数据尚未改动' });
    return;
  }
  if (compareVersions(release.version, APP_VERSION) <= 0) {
    sendJSON(res, 409, { error: '当前已经是最新版本' });
    return;
  }
  await fsp.mkdir(path.dirname(UPDATE_REQUEST_FILE), { recursive: true });
  const temporary = `${UPDATE_REQUEST_FILE}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  await fsp.writeFile(temporary, `${JSON.stringify({ action: 'upgrade', requestedAt: new Date().toISOString() })}\n`, { mode: 0o600 });
  await fsp.rename(temporary, UPDATE_REQUEST_FILE);
  sendJSON(res, 202, { ok: true, ...updateResponse({ ...status, state: 'checking', phase: 'checking', message: '升级请求已提交，等待更新器处理' }, release) });
}

async function handleLogin(req, res) {
  if (!isJsonRequest(req)) {
    sendJSON(res, 415, { error: '需要 application/json 请求' });
    return;
  }
  const ip = req.socket.remoteAddress || 'unknown';
  if (isRateLimited(ip)) {
    sendJSON(res, 429, { error: '尝试次数过多，请十分钟后再试' });
    return;
  }
  let body;
  try {
    body = await readJSON(req);
  } catch (error) {
    sendJSON(res, error.status || 400, { error: '登录请求格式错误' });
    return;
  }
  if (!checkPassword(body && body.password)) {
    recordFailure(ip);
    sendJSON(res, 401, { error: '密码不正确' });
    return;
  }
  loginAttempts.delete(ip);
  res.setHeader('Set-Cookie', sessionCookie(signSession(), getSessionDays() * 86400, isSecureRequest(req)));
  sendJSON(res, 200, { ok: true, expiresInDays: getSessionDays() });
}

function handleLogout(req, res) {
  res.setHeader('Set-Cookie', sessionCookie('', 0, isSecureRequest(req)));
  sendJSON(res, 200, { ok: true });
}

async function handleChangePassword(req, res) {
  if (!isJsonRequest(req)) {
    sendJSON(res, 415, { error: '需要 application/json 请求' });
    return;
  }
  let body;
  try {
    body = await readJSON(req);
  } catch (error) {
    sendJSON(res, error.status || 400, { error: '请求格式错误' });
    return;
  }
  const currentPassword = body && body.currentPassword;
  const newPassword = body && body.newPassword;
  if (!checkPassword(currentPassword)) {
    sendJSON(res, 401, { error: '当前密码不正确' });
    return;
  }
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    sendJSON(res, 400, { error: '新密码至少 8 位' });
    return;
  }
  if (newPassword.length > 200) {
    sendJSON(res, 400, { error: '新密码过长' });
    return;
  }
  if (newPassword === currentPassword) {
    sendJSON(res, 400, { error: '新密码不能与当前密码相同' });
    return;
  }
  const salt = crypto.randomBytes(16).toString('hex');
  auth = {
    salt,
    hash: hashPassword(newPassword, salt),
    version: auth.version + 1,
    updatedAt: new Date().toISOString()
  };
  try {
    writeAuthFile();
  } catch (error) {
    console.error('[fishdesk] 密码写入失败：', error.message);
    sendJSON(res, 500, { error: '密码保存失败，请稍后重试' });
    return;
  }
  // 当前设备换发新会话；其他设备的旧会话因版本不匹配立即失效
  res.setHeader('Set-Cookie', sessionCookie(signSession(), getSessionDays() * 86400, isSecureRequest(req)));
  sendJSON(res, 200, { ok: true });
}

async function handleGetTasks(res) {
  const current = await getStore();
  sendJSON(res, 200, { rev: current.rev, updatedAt: current.updatedAt, tasks: current.tasks });
}

async function handlePutTasks(req, res) {
  if (!isJsonRequest(req)) {
    sendJSON(res, 415, { error: '需要 application/json 请求' });
    return;
  }
  let body;
  try {
    body = await readJSON(req);
  } catch (error) {
    sendJSON(res, error.status || 400, { error: '请求格式错误' });
    return;
  }
  if (!body || typeof body !== 'object') {
    sendJSON(res, 400, { error: '请求格式错误' });
    return;
  }
  const incoming = validateTasks(body.tasks);
  if (!incoming) {
    sendJSON(res, 400, { error: '工作项数据不合法' });
    return;
  }
  const baseRev = Number.isInteger(body.baseRev) ? body.baseRev : -1;
  const result = await persist(incoming, baseRev);
  if (result.conflict) {
    const current = result.conflict;
    sendJSON(res, 409, { rev: current.rev, updatedAt: current.updatedAt, tasks: current.tasks });
    return;
  }
  const current = result.saved;
  sendJSON(res, 200, { rev: current.rev, updatedAt: current.updatedAt });
}

async function handlePolish(req, res) {
  const ai = getAIConfig();
  if (!ai.enabled) {
    sendJSON(res, 503, { error: 'AI 润色未配置，请先在「设置」里填写 API Key' });
    return;
  }
  if (!isJsonRequest(req)) {
    sendJSON(res, 415, { error: '需要 application/json 请求' });
    return;
  }
  let body;
  try {
    body = await readJSON(req);
  } catch (error) {
    sendJSON(res, error.status || 400, { error: '请求格式错误' });
    return;
  }
  const text = body && typeof body.text === 'string' ? body.text.trim() : '';
  const kind = body && body.kind === 'log' ? 'log' : 'report';
  if (!text) {
    sendJSON(res, 400, { error: '没有可润色的内容' });
    return;
  }
  if (text.length > AI_MAX_INPUT) {
    sendJSON(res, 400, { error: '内容过长，请分多次润色' });
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const response = await fetch(`${ai.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ai.apiKey}`
      },
      body: JSON.stringify({
        model: ai.model,
        temperature: 0.3,
        stream: false,
        messages: [
          { role: 'system', content: AI_SYSTEM_PROMPT },
          {
            role: 'user',
            content: kind === 'log'
              ? `请润色下面这条工作记录，只改措辞：\n${text}`
              : `请润色下面这份工作报告，只改措辞：\n${text}`
          }
        ]
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error(`[fishdesk] AI 服务返回 ${response.status}：${detail.slice(0, 300)}`);
      if (response.status === 401 || response.status === 403) {
        sendJSON(res, 502, { error: 'AI 服务鉴权失败，请到「设置」里检查 API Key 是否正确' });
      } else if (response.status === 429) {
        sendJSON(res, 502, { error: 'AI 服务请求过于频繁或余额不足，请稍后再试' });
      } else {
        sendJSON(res, 502, { error: `AI 服务返回错误（HTTP ${response.status}）` });
      }
      return;
    }

    const payload = await response.json();
    const message = payload && payload.choices && payload.choices[0] && payload.choices[0].message;
    let output = message && typeof message.content === 'string' ? message.content.trim() : '';
    output = output.replace(/^```[a-zA-Z]*\s*\n?/, '').replace(/\n?```$/, '').trim();
    if (!output) {
      sendJSON(res, 502, { error: 'AI 没有返回内容，请稍后再试' });
      return;
    }
    sendJSON(res, 200, { text: output, model: ai.model });
  } catch (error) {
    if (error.name === 'AbortError') {
      sendJSON(res, 504, { error: 'AI 服务响应超时，请稍后再试' });
      return;
    }
    console.error('[fishdesk] AI 请求失败：', error.message);
    sendJSON(res, 502, { error: '无法连接 AI 服务，请到「设置」里检查接口地址或服务器网络' });
  } finally {
    clearTimeout(timer);
  }
}

async function handleGetSettings(res) {
  sendJSON(res, 200, publicSettings());
}

async function handleUpdateSettings(req, res) {
  if (!isJsonRequest(req)) {
    sendJSON(res, 415, { error: '需要 application/json 请求' });
    return;
  }
  let body;
  try {
    body = await readJSON(req);
  } catch (error) {
    sendJSON(res, error.status || 400, { error: '请求格式错误' });
    return;
  }
  if (!body || typeof body !== 'object') {
    sendJSON(res, 400, { error: '请求格式错误' });
    return;
  }

  const previous = runtimeConfig;
  const next = { ...runtimeConfig };

  if (typeof body.aiKey === 'string' && body.aiKey.trim()) {
    const key = body.aiKey.trim();
    if (key.length > 300) {
      sendJSON(res, 400, { error: 'API Key 过长，请检查是否粘贴了多余内容' });
      return;
    }
    next.aiApiKey = key;
  }
  if (body.clearAiKey === true) next.aiApiKey = '';

  if (Object.prototype.hasOwnProperty.call(body, 'aiBaseUrl')) {
    const baseUrl = normalizeBaseUrl(body.aiBaseUrl);
    if (!baseUrl) {
      sendJSON(res, 400, { error: '接口地址需要是完整的 http:// 或 https:// 地址' });
      return;
    }
    next.aiBaseUrl = baseUrl;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'aiModel')) {
    const model = normalizeModel(body.aiModel);
    if (!model) {
      sendJSON(res, 400, { error: '模型名过长' });
      return;
    }
    next.aiModel = model;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'sessionDays')) {
    const days = Number(body.sessionDays);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      sendJSON(res, 400, { error: '登录有效期需要是 1 到 365 之间的整数' });
      return;
    }
    next.sessionDays = days;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'theme')) {
    if (!THEMES.has(body.theme)) {
      sendJSON(res, 400, { error: '主题设置不合法' });
      return;
    }
    next.theme = body.theme;
  }

  runtimeConfig = next;
  try {
    persistRuntimeConfig();
  } catch (error) {
    runtimeConfig = previous;
    console.error('[fishdesk] 配置写入失败：', error.message);
    sendJSON(res, 500, { error: '设置保存失败，请稍后重试' });
    return;
  }
  sendJSON(res, 200, { ok: true, ...publicSettings() });
}

async function handleTestAI(req, res) {
  if (!isJsonRequest(req)) {
    sendJSON(res, 415, { error: '需要 application/json 请求' });
    return;
  }
  let body;
  try {
    body = await readJSON(req);
  } catch (error) {
    sendJSON(res, error.status || 400, { error: '请求格式错误' });
    return;
  }
  const stored = getAIConfig();
  const draftKey = body && typeof body.aiKey === 'string' ? body.aiKey.trim() : '';
  const baseUrl = body && Object.prototype.hasOwnProperty.call(body, 'aiBaseUrl')
    ? normalizeBaseUrl(body.aiBaseUrl)
    : stored.baseUrl;
  const model = body && Object.prototype.hasOwnProperty.call(body, 'aiModel')
    ? normalizeModel(body.aiModel)
    : stored.model;
  const apiKey = draftKey || stored.apiKey;

  if (!baseUrl || !model) {
    sendJSON(res, 200, { ok: false, message: '接口地址或模型名不合法，请检查后重试' });
    return;
  }
  if (!apiKey) {
    sendJSON(res, 200, { ok: false, message: '还没有可用的 API Key，请先填写' });
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TEST_TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        max_tokens: 8,
        temperature: 0,
        stream: false,
        messages: [{ role: 'user', content: '只回复 OK' }]
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error(`[fishdesk] AI 连接测试返回 ${response.status}：${detail.slice(0, 300)}`);
      let message;
      if (response.status === 401 || response.status === 403) {
        message = '连接失败：API Key 无效或已被撤销（鉴权失败）';
      } else if (response.status === 402 || response.status === 429) {
        message = '连接失败：账户余额不足或请求过于频繁';
      } else if (response.status === 404) {
        message = '连接失败：接口地址或模型名不存在，请检查后重试';
      } else {
        message = `连接失败：AI 服务返回 HTTP ${response.status}`;
      }
      sendJSON(res, 200, { ok: false, message });
      return;
    }
    await response.json().catch(() => null);
    sendJSON(res, 200, {
      ok: true,
      message: `连接成功，模型 ${model} 可正常调用`,
      model,
      latencyMs: Date.now() - startedAt
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      sendJSON(res, 200, { ok: false, message: '连接失败：请求超时，请检查服务器网络' });
      return;
    }
    console.error('[fishdesk] AI 连接测试失败：', error.message);
    sendJSON(res, 200, { ok: false, message: '连接失败：无法访问接口地址，请检查地址或服务器网络' });
  } finally {
    clearTimeout(timer);
  }
}

async function serveFile(res, fileName, req) {
  const filePath = path.join(__dirname, fileName);
  let stat;
  try {
    stat = await fsp.stat(filePath);
  } catch {
    sendText(res, 404, 'Not Found');
    return;
  }
  const headers = {
    'Content-Type': CONTENT_TYPES[path.extname(fileName)] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin'
  };
  if (fileName === 'login.html') {
    // 登录页渲染前注入已保存的主题，换设备登录也不会先闪一下浅色
    const template = await fsp.readFile(filePath, 'utf8');
    const body = Buffer.from(template.replaceAll('__FISHDESK_THEME__', runtimeConfig.theme || 'system'), 'utf8');
    res.writeHead(200, { ...headers, 'Content-Length': body.length });
    res.end(req.method === 'HEAD' ? undefined : body);
    return;
  }
  res.writeHead(200, { ...headers, 'Content-Length': stat.size });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch {
    sendJSON(res, 400, { error: '请求地址格式错误' });
    return;
  }
  const pathname = url.pathname;
  try {
    if (pathname === '/healthz') {
      await getStore();
      await fsp.access(DATA_DIR, fs.constants.R_OK | fs.constants.W_OK);
      sendJSON(res, 200, { ok: true, version: APP_VERSION });
      return;
    }

    if (pathname === '/login') {
      if (req.method !== 'GET') {
        sendText(res, 405, 'Method Not Allowed');
        return;
      }
      if (isAuthenticated(req)) {
        redirect(res, '/');
        return;
      }
      await serveFile(res, 'login.html', req);
      return;
    }

    if (pathname === '/api/login' && req.method === 'POST') {
      await handleLogin(req, res);
      return;
    }

    if (pathname === '/api/logout' && req.method === 'POST') {
      handleLogout(req, res);
      return;
    }

    if (pathname === '/api/password' && req.method === 'POST') {
      if (!isAuthenticated(req)) {
        sendJSON(res, 401, { error: '未登录' });
        return;
      }
      if (await rejectDuringMaintenance(res)) return;
      await handleChangePassword(req, res);
      return;
    }

    if (pathname === '/api/session' && req.method === 'GET') {
      sendJSON(res, 200, { authenticated: isAuthenticated(req) });
      return;
    }

    if (pathname === '/api/ai-status' && req.method === 'GET') {
      if (!isAuthenticated(req)) {
        sendJSON(res, 401, { error: '未登录' });
        return;
      }
      const ai = getAIConfig();
      sendJSON(res, 200, { enabled: ai.enabled, model: ai.enabled ? ai.model : '' });
      return;
    }

    if (pathname === '/api/update') {
      if (!isAuthenticated(req)) {
        sendJSON(res, 401, { error: '未登录' });
        return;
      }
      if (req.method === 'GET') {
        await handleGetUpdate(req, res, url);
        return;
      }
      if (req.method === 'POST') {
        await handleRequestUpdate(req, res);
        return;
      }
      sendJSON(res, 405, { error: '方法不支持' });
      return;
    }

    if (pathname === '/api/settings') {
      if (!isAuthenticated(req)) {
        sendJSON(res, 401, { error: '未登录' });
        return;
      }
      if (req.method === 'GET') {
        await handleGetSettings(res);
        return;
      }
      if (req.method === 'PUT') {
        if (await rejectDuringMaintenance(res)) return;
        await handleUpdateSettings(req, res);
        return;
      }
      sendJSON(res, 405, { error: '方法不支持' });
      return;
    }

    if (pathname === '/api/ai/test' && req.method === 'POST') {
      if (!isAuthenticated(req)) {
        sendJSON(res, 401, { error: '未登录' });
        return;
      }
      await handleTestAI(req, res);
      return;
    }

    if (pathname === '/api/polish' && req.method === 'POST') {
      if (!isAuthenticated(req)) {
        sendJSON(res, 401, { error: '未登录' });
        return;
      }
      await handlePolish(req, res);
      return;
    }

    if (pathname === '/api/tasks') {
      if (!isAuthenticated(req)) {
        sendJSON(res, 401, { error: '未登录' });
        return;
      }
      if (req.method === 'GET') {
        await handleGetTasks(res);
        return;
      }
      if (req.method === 'PUT') {
        if (await rejectDuringMaintenance(res)) return;
        await handlePutTasks(req, res);
        return;
      }
      sendJSON(res, 405, { error: '方法不支持' });
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendText(res, 405, 'Method Not Allowed');
      return;
    }

    const fileName = STATIC_FILES.get(pathname);
    if (!fileName) {
      sendText(res, 404, 'Not Found');
      return;
    }
    if (!isAuthenticated(req)) {
      if (fileName === 'index.html') {
        redirect(res, `/login?next=${encodeURIComponent(pathname)}`);
        return;
      }
      sendText(res, 401, '请先登录');
      return;
    }
    await serveFile(res, fileName, req);
  } catch (error) {
    console.error('[fishdesk] 请求处理失败：', error);
    if (!res.headersSent) sendJSON(res, error.status || 500, { error: error.status ? error.message : '服务器内部错误' });
    else res.end();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[fishdesk] 已启动：http://${HOST}:${PORT}`);
  console.log(`[fishdesk] 本机访问：http://127.0.0.1:${PORT}`);
  console.log(`[fishdesk] 数据目录：${DATA_DIR}`);
  console.log('[fishdesk] 密码来源：data/auth.json（环境变量仅用于首次初始化）');
  console.log(`[fishdesk] 登录有效期：${getSessionDays()} 天（可在界面设置中修改）`);
  const ai = getAIConfig();
  if (ai.enabled) {
    console.log(`[fishdesk] AI 润色：已启用（${ai.model} · ${ai.baseUrl}）`);
  } else {
    console.log('[fishdesk] AI 润色：未配置 API Key，登录后到「设置」里填写即可');
  }
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[fishdesk] 收到 ${signal}，等待当前数据写入完成后停止`);
  server.close(async () => {
    await writeChain;
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
