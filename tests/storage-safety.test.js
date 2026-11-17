'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { startServer } = require('./helpers.cjs');

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
