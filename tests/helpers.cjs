'use strict';
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');

async function startServer(t, { dataDir, env = {}, files = {} } = {}) {
  if (!dataDir) {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fishdesk-regression-'));
    t.after(() => fs.rm(dataDir, { recursive: true, force: true }));
  }
  for (const [name, contents] of Object.entries(files)) {
    await fs.writeFile(path.join(dataDir, name), contents);
  }
  const listener = net.createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, NODE_OPTIONS: '', PASSWORD: 'regression-test-password', HOST: '127.0.0.1',
      PORT: String(port), DATA_DIR: dataDir, FISHDESK_UPDATE_ENABLED: '0', TRUST_PROXY: '0', ...env },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  async function stop() {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill();
    await exited;
  }
  t.after(stop);
  const base = `http://127.0.0.1:${port}`;
  // A corrupt data file may intentionally make health return 503.
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { await fetch(`${base}/api/session`); ready = true; break; } catch {}
    if (child.exitCode !== null) throw new Error(output);
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  if (!ready) throw new Error(`Service startup timed out: ${output}`);
  const request = (url, options) => fetch(`${base}${url}`, options);
  const login = (password = 'regression-test-password', headers = {}) => request('/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ password })
  });
  async function cookie() {
    const response = await login();
    if (!response.ok) throw new Error(`Login failed: ${response.status}`);
    return response.headers.get('set-cookie').split(';')[0];
  }
  return { child, dataDir, port, request, login, cookie, stop, output: () => output };
}
module.exports = { startServer };
