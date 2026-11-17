'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { startServer } = require('./helpers.cjs');

const task = title => ({ id: 'task-1', title, status: 'doing', workLogs: [] });
function save(server, cookie, baseRev, tasks) {
  return server.request('/api/tasks', { method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ baseRev, tasks }) });
}

test('写入失败不报成功、不改变已保存数据，恢复后可重试且重启后保留', async t => {
  const server = await startServer(t);
  const cookie = await server.cookie();
  assert.equal((await save(server, cookie, 0, [task('original')])).status, 200);
  const file = path.join(server.dataDir, 'daylight.json');
  const original = await fs.readFile(file, 'utf8');
  const blocked = `${file}.${server.child.pid}.tmp`;
  await fs.mkdir(blocked);
  assert.equal((await save(server, cookie, 1, [task('changed')])).status, 503);
  assert.equal(await fs.readFile(file, 'utf8'), original);
  assert.deepEqual(await (await server.request('/api/tasks', { headers: { Cookie: cookie } })).json(), JSON.parse(original));
  await fs.rmdir(blocked);
  assert.equal((await save(server, cookie, 1, [task('changed')])).status, 200);
  await server.stop();
  const restarted = await startServer(t, { dataDir: server.dataDir });
  const reloaded = await (await restarted.request('/api/tasks', { headers: { Cookie: cookie } })).json();
  assert.equal(reloaded.tasks[0].title, 'changed');
  assert.equal(reloaded.rev, 2);
});

test('同时保存相同版本时只有一次成功，另一次明确报告冲突', async t => {
  const server = await startServer(t);
  const cookie = await server.cookie();
  const responses = await Promise.all([save(server, cookie, 0, [task('A')]), save(server, cookie, 0, [task('B')])]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
  const stored = await (await server.request('/api/tasks', { headers: { Cookie: cookie } })).json();
  assert.equal(stored.rev, 1);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(server.dataDir, 'daylight.json'), 'utf8')), stored);
});

test('损坏或结构异常的数据文件不可读写，健康检查失败且原文件保留', async t => {
  for (const contents of ['{broken', 'null', '{"rev":1,"tasks":"wrong"}', '{"rev":1,"tasks":[{}]}']) {
    await t.test(contents, async t => {
      const server = await startServer(t, { files: { 'daylight.json': contents } });
      const cookie = await server.cookie();
      assert.equal((await server.request('/healthz')).status, 503);
      assert.equal((await server.request('/api/tasks', { headers: { Cookie: cookie } })).status, 503);
      const response = await server.request('/api/tasks', { method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ baseRev: 0, tasks: [] }) });
      assert.equal(response.status, 503);
      assert.equal(await fs.readFile(path.join(server.dataDir, 'daylight.json'), 'utf8'), contents);
      const restored = { rev: 5, updatedAt: null, tasks: [] };
      await fs.writeFile(path.join(server.dataDir, 'daylight.json'), JSON.stringify(restored));
      assert.equal((await server.request('/healthz')).status, 200);
      assert.deepEqual(await (await server.request('/api/tasks', { headers: { Cookie: cookie } })).json(), restored);
    });
  }
});
