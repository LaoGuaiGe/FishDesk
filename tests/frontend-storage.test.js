'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('保存异常不误显示成系统升级，明确提示尚未保存', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const code = source.slice(source.indexOf('async function flushSave()'), source.indexOf('\nfunction newerTask'));
  const messages = [];
  const context = vm.createContext({ saving: false, booted: true, tasks: [], serverRev: 0, saveTimer: null,
    apiRequest: async () => { throw { status: 503, data: { error: '数据保存失败' } }; },
    setSyncStatus: message => messages.push(message), showToast: message => messages.push(message),
    setTimeout: () => { throw new Error('Storage failure must not be treated as maintenance'); }, clearTimeout() {} });
  vm.runInContext(code, context);
  await context.flushSave();
  assert.ok(messages.some(message => message.includes('保存失败')));
  assert.ok(messages.every(message => !message.includes('升级')));
});
