'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
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
