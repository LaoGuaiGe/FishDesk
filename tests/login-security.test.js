'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { startServer } = require('./helpers.cjs');

test('同时开始的错误登录不能越过八次失败上限', async t => {
  const server = await startServer(t);
  const body = JSON.stringify({ password: 'wrong' });
  const requests = [];
  const results = [];
  for (let i = 0; i < 20; i++) {
    results.push(new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port: server.port, path: '/api/login', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, res => {
        res.resume(); res.on('end', () => resolve(res.statusCode));
      });
      req.on('error', reject); req.flushHeaders(); requests.push(req);
    }));
  }
  await new Promise(resolve => setTimeout(resolve, 100));
  requests.forEach(req => req.end(body));
  const statuses = await Promise.all(results);
  assert.equal(statuses.filter(status => status === 401).length, 8);
  assert.equal(statuses.filter(status => status === 429).length, 12);
  const blocked = await server.login();
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  assert.ok((await blocked.json()).retryAfter > 0);
});

test('服务重启不清空登录限制，过期后允许重新登录', async t => {
  const server = await startServer(t);
  for (let i = 0; i < 8; i++) assert.equal((await server.login('wrong')).status, 401);
  await server.stop();
  const restarted = await startServer(t, { dataDir: server.dataDir });
  assert.equal((await restarted.login()).status, 429);
  await restarted.stop();
  const file = path.join(server.dataDir, 'login-attempts.json');
  const saved = JSON.parse(await fs.readFile(file, 'utf8'));
  saved.attempts.forEach(([, record]) => { record.firstAt = Date.now() - 11 * 60 * 1000; });
  await fs.writeFile(file, JSON.stringify(saved));
  const expired = await startServer(t, { dataDir: server.dataDir });
  assert.equal((await expired.login()).status, 200);
});

test('损坏的登录限制文件不能静默清零', async t => {
  const server = await startServer(t, { files: { 'login-attempts.json': '{broken' } });
  assert.equal((await server.login()).status, 503);
});
