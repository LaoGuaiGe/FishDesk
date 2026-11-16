'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const packageJson = require('../package.json');

const root = path.resolve(__dirname, '..');
const releaseMock = path.join(__dirname, 'update-release-mock.cjs');

async function waitForHealth(port) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/healthz`);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('测试服务启动超时');
}

test('在线升级 API 的鉴权、请求约束和维护保护', async t => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'fishdesk-update-test-'));
  const dataDir = path.join(temporaryRoot, 'data');
  const requestFile = path.join(temporaryRoot, 'update', 'requests', 'upgrade.json');
  const statusFile = path.join(temporaryRoot, 'update', 'status', 'status.json');
  const port = 24000 + Math.floor(Math.random() * 10000);
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: {
      ...process.env,
      NODE_OPTIONS: `--require=${releaseMock}`,
      PASSWORD: 'update-test-password',
      PORT: String(port),
      HOST: '127.0.0.1',
      DATA_DIR: dataDir,
      FISHDESK_UPDATE_ENABLED: '1',
      UPDATE_REQUEST_FILE: requestFile,
      UPDATE_STATUS_FILE: statusFile
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });

  t.after(async () => {
    if (child.exitCode === null) child.kill();
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  });

  await waitForHealth(port).catch(error => {
    throw new Error(`${error.message}\n${output}`);
  });
  const health = await (await fetch(`${baseUrl}/healthz`)).json();
  assert.equal(health.version, packageJson.version);

  assert.equal((await fetch(`${baseUrl}/api/update`)).status, 401);
  assert.equal((await fetch(`${baseUrl}/api/update`, { method: 'POST' })).status, 401);

  const login = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'update-test-password' })
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const request = (pathname, options = {}) => fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: { Cookie: cookie, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) }
  });

  const initial = await (await request('/api/update')).json();
  assert.equal(initial.available, true);
  assert.equal(initial.currentVersion, packageJson.version);

  const injection = await request('/api/update', {
    method: 'POST',
    body: JSON.stringify({ action: 'upgrade', image: 'example.com/untrusted', command: 'whoami' })
  });
  assert.equal(injection.status, 400);
  await assert.rejects(fs.access(requestFile));

  const checked = await (await request('/api/update?check=1')).json();
  assert.equal(checked.updateAvailable, true);
  assert.equal(checked.requiresUpdaterUpdate, false);

  const accepted = await request('/api/update', { method: 'POST', body: JSON.stringify({ action: 'upgrade' }) });
  assert.equal(accepted.status, 202);
  const queued = JSON.parse(await fs.readFile(requestFile, 'utf8'));
  assert.deepEqual(Object.keys(queued).sort(), ['action', 'requestedAt']);
  assert.equal(queued.action, 'upgrade');
  const pending = await (await request('/api/update')).json();
  assert.equal(pending.status.state, 'checking');

  const duplicate = await request('/api/update', { method: 'POST', body: JSON.stringify({ action: 'upgrade' }) });
  assert.equal(duplicate.status, 409);
  await fs.rm(requestFile);

  await fs.mkdir(path.dirname(statusFile), { recursive: true });
  await fs.writeFile(statusFile, JSON.stringify({ state: 'backing_up', phase: 'backing_up', message: '测试备份中' }));
  const protectedWrite = await request('/api/tasks', { method: 'PUT', body: JSON.stringify({ baseRev: 0, tasks: [] }) });
  assert.equal(protectedWrite.status, 503);
  const protectedSettings = await request('/api/settings', { method: 'PUT', body: JSON.stringify({ sessionDays: 30 }) });
  assert.equal(protectedSettings.status, 503);
  const protectedPassword = await request('/api/password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword: 'update-test-password', newPassword: 'another-test-password' })
  });
  assert.equal(protectedPassword.status, 503);

  await fs.writeFile(statusFile, JSON.stringify({ state: 'idle', phase: 'idle', message: '测试完成' }));
  const tasks = await request('/api/tasks');
  assert.equal(tasks.status, 200);
  assert.equal((await tasks.json()).rev, 0);
});
