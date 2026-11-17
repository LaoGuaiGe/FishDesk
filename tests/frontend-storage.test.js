'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const Model = require('../model');

test('首次打开空工作台不生成示例项目或虚构工作记录', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const code = source.slice(source.indexOf('async function boot()'), source.indexOf('\nfunction recordTaskSnapshot'));
  const context = vm.createContext({ FishDeskModel: Model, tasks: [], projects: [], themePreference: 'system',
    setDateAndGreeting() {}, applyTheme() {}, loadThemeSetting() {}, loadAIStatus() {},
    apiRequest: async () => ({ rev: 0, tasks: [], projects: [] }), normalizeTaskList: value => value,
    readCachedTasks: () => null, cacheTasks() {}, render() {}, flushSave: async () => {},
    startSync() {}, markMigratedToServer() {}, setSyncStatus() {}, showToast() {}, booted: false, serverRev: 0,
    lastSyncedTasks: null, lastSyncedProjects: null });
  vm.runInContext(code, context);
  await context.boot();
  assert.equal(context.tasks.length, 0);
  assert.equal(context.projects.length, 0);
  assert.equal(context.booted, true);
});

test('保存异常不误显示成系统升级，明确提示尚未保存', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const code = source.slice(source.indexOf('async function flushSave()'), source.indexOf('\nfunction newerTask'));
  const messages = [];
  const context = vm.createContext({ saving: false, saveRequested: false, booted: true, tasks: [], projects: [], serverRev: 0, saveTimer: null,
    apiRequest: async () => { throw { status: 503, data: { error: '数据保存失败' } }; },
    setSyncStatus: message => messages.push(message), showToast: message => messages.push(message),
    setTimeout: () => { throw new Error('Storage failure must not be treated as maintenance'); }, clearTimeout() {} });
  vm.runInContext(code, context);
  await context.flushSave();
  assert.ok(messages.some(message => message.includes('保存失败')));
  assert.ok(messages.every(message => !message.includes('升级')));
});

test('上次保存尚未完成时的新项目修改会接着保存，不丢失第二次修改', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const code = source.slice(source.indexOf('async function flushSave()'), source.indexOf('\nfunction newerTask'));
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const writes = [];
  const context = vm.createContext({ saving: false, saveRequested: false, booted: true, tasks: [], projects: [{ id: 'p', goal: 'first' }], serverRev: 0,
    queueMicrotask, setSyncStatus() {}, apiRequest: async (url, { body }) => { writes.push(body); if (writes.length === 1) await gate; return { rev: writes.length }; } });
  vm.runInContext(code, context);
  const first = context.flushSave();
  context.projects[0].goal = 'second';
  await context.flushSave();
  release(); await first;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(writes.length, 2);
  assert.equal(writes[0].projects[0].goal, 'first');
  assert.equal(writes[1].projects[0].goal, 'second');
  assert.equal(writes[1].baseRev, 1);
});
