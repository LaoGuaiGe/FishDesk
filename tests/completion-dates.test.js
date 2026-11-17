'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const Model = require('../model');

test('工作日期与完成日期不同，今日完成只按结束日期筛选', () => {
  const tasks = [{ id: 'a', status: 'done', title: '验证', completedOn: '2026-11-17', workLogs: [{ date: '2026-11-16', content: '工作记录' }] },
    { id: 'b', status: 'done', title: '昨日结束', completedOn: '2026-11-16', workLogs: [{ date: '2026-11-17', content: '补充记录' }] }];
  assert.deepEqual(Model.completedGroups(tasks, '2026-11-17', '2026-11-17', '2026-11-17').flatMap(group => group.tasks.map(task => task.id)), ['a']);
});

test('完成卡片明确区分完成日期和工作记录日期', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const context = vm.createContext({ FishDeskModel: Model, STATUS_NAMES: { done: '已完成' }, icons: { check: '', more: '', calendar: '', log: '', edit: '', arrow: '', trash: '' },
    getLatestLog: task => task.workLogs[0], formatShortDate: date => date });
  vm.runInContext(source.slice(source.indexOf('function escapeHTML('), source.indexOf('\nfunction formatShortDate(')), context);
  vm.runInContext(source.slice(source.indexOf('function taskCardTemplate('), source.indexOf('\nfunction emptyStateTemplate(')), context);
  const html = context.taskCardTemplate({ id: 'a', project: '项目', module: '模块', title: '验证', status: 'done', completedOn: '2026-11-17', workLogs: [{ date: '2026-11-16', content: '工作记录' }] });
  assert.ok(html.includes('完成：2026-11-17'));
  assert.ok(html.includes('工作记录：2026-11-16'));
});

test('完成成果按独立结束日期进入报告，并保留原工作日期', () => {
  const task = { id: 'a', project: '项目', title: '验证', status: 'done', completedOn: '2026-11-17', workLogs: [
    { date: '2026-11-16', completedOn: '2026-11-17', kind: 'completed', content: '验证通过' }
  ] };
  const yesterday = Model.report([task], '2026-11-16', '2026-11-16', '2026-11-17');
  const today = Model.report([task], '2026-11-17', '2026-11-17', '2026-11-17');
  assert.equal(yesterday.completed.length, 0);
  assert.equal(today.completed.length, 1);
  assert.equal(today.completed[0].log.workDate, '2026-11-16');
  assert.equal(task.workLogs[0].date, '2026-11-16');
});
