'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { startServer } = require('./helpers.cjs');

test('自定义润色风格可保存、重启恢复，应用于记录及报告并保留事实约束', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'fishdesk-style-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const capture = path.join(directory, 'capture.json');
  const env = { AI_BASE_URL: 'https://style-test.invalid', AI_API_KEY: 'style-test-key', FISHDESK_STYLE_CAPTURE: capture,
    NODE_OPTIONS: `--require=${path.join(__dirname, 'ai-style-mock.cjs')}` };
  const server = await startServer(t, { dataDir: directory, env });
  const cookie = await server.cookie();
  const headers = { Cookie: cookie, 'Content-Type': 'application/json' };
  const initial = await (await server.request('/api/settings', { headers })).json();
  assert.equal(initial.ai.polishStyle, '');
  const style = '简洁直接，适合给领导看的日报，不写空话。';
  const saved = await server.request('/api/settings', { method: 'PUT', headers, body: JSON.stringify({ aiPolishStyle: style }) });
  assert.equal(saved.status, 200); assert.equal((await saved.json()).ai.polishStyle, style);
  for (const kind of ['log', 'report']) {
    const response = await server.request('/api/polish', { method: 'POST', headers, body: JSON.stringify({ kind, text: '完成 RK3566 接口验证，耗时 2 小时。' }) });
    assert.equal(response.status, 200);
  }
  const messages = JSON.parse(await fs.readFile(capture, 'utf8'));
  assert.equal(messages.length, 2);
  for (const request of messages) {
    assert.equal(request[0].role, 'system');
    assert.ok(request[0].content.includes('所有事实、数字、日期'));
    assert.ok(request.some(message => message.role === 'user' && message.content.includes(style)));
  }
  assert.equal((await server.request('/api/settings', { method: 'PUT', headers, body: JSON.stringify({ aiPolishStyle: 'x'.repeat(2001) }) })).status, 400);
  await server.stop();
  const restarted = await startServer(t, { dataDir: directory, env });
  const restored = await (await restarted.request('/api/settings', { headers })).json();
  assert.equal(restored.ai.polishStyle, style);
  assert.equal((await restarted.request('/api/settings', { method: 'PUT', headers, body: JSON.stringify({ aiPolishStyle: '' }) })).status, 200);
  assert.equal((await (await restarted.request('/api/settings', { headers })).json()).ai.polishStyle, '');
});
