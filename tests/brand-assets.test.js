'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('./helpers.cjs');

test('未登录可加载 Logo 和浏览器图标，工作数据和程序仍需鉴权', async t => {
  const server = await startServer(t);
  for (const [url, mime] of [
    ['/assets/brand/fishdesk-logo-horizontal.svg', 'image/svg+xml'],
    ['/assets/brand/fishdesk-logo-horizontal-dark.svg', 'image/svg+xml'],
    ['/assets/brand/fishdesk-app-icon.svg', 'image/svg+xml'],
    ['/assets/brand/favicon-32.png', 'image/png'],
    ['/assets/brand/favicon-256.png', 'image/png'],
    ['/favicon.ico?v=1.1.2', 'image/x-icon']
  ]) {
    const response = await server.request(url);
    assert.equal(response.status, 200, url);
    assert.equal(response.headers.get('content-type'), mime);
    assert.ok((await response.arrayBuffer()).byteLength > 0);
    const head = await server.request(url, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal((await head.arrayBuffer()).byteLength, 0);
  }
  for (const url of ['/api/tasks', '/api/settings', '/app.js']) assert.equal((await server.request(url)).status, 401);
  for (const url of ['/assets/brand/server.js', '/assets/brand/../../server.js', '/data/config.json']) assert.equal((await server.request(url)).status, 404);
});
