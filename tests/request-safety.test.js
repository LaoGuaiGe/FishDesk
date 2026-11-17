'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { startServer } = require('./helpers.cjs');

test('非法 Host 被拒绝且进程保持运行', async t => {
  const server = await startServer(t);
  const status = await new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port: server.port, path: '/', headers: { Host: '[' } }, res => {
      res.resume(); res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
  });
  assert.equal(status, 400);
  assert.equal((await server.request('/healthz')).status, 200);
});

test('非法 Cookie 和会话签名按未登录处理，不返回内部错误', async t => {
  const server = await startServer(t);
  for (const cookie of ['daylight_session=%ZZ', `daylight_session=x.${'中'.repeat(43)}`]) {
    // Encode non-ASCII bytes for a legal HTTP header, then decode in cookie parsing.
    const response = await server.request('/api/session', { headers: { Cookie: cookie.replaceAll('中', '%E4%B8%AD') } });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { authenticated: false });
  }
  const valid = await server.cookie();
  assert.deepEqual(await (await server.request('/api/session', { headers: { Cookie: `${valid}.extra` } })).json(), { authenticated: false });
});
