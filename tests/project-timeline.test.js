'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Model = require('../model');

test('连续进展展示模块和标题，同名任务可区分，模块名称经过转义', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const source = fs.readFileSync(path.join(__dirname, '..', 'projects.js'), 'utf8');
  const entries = ['控制板', '结构件', '<模块>', '通用'].map((module, i) => ({ id: `task-${i}`, title: '功能验证', project: '项目 A', module,
    workLogs: [{ id: `log-${i}`, date: '2026-11-17', content: '已完成本轮检查', kind: 'progress' }] }));
  const output = { innerHTML: '' };
  const elements = {
    '#timeline-period': { value: 'all' }, '#timeline-start': { value: '', parentElement: {} },
    '#timeline-end': { value: '', parentElement: {} }, '#project-timeline': output
  };
  const context = vm.createContext({ FishDeskModel: Model, selectedProjectData: () => ({ name: '项目 A' }), projectTasks: () => entries,
    dateStamp: () => '2026-11-17', document: { querySelector: selector => elements[selector] } });
  vm.runInContext(app.slice(app.indexOf('function escapeHTML('), app.indexOf('\nfunction formatShortDate(')), context);
  vm.runInContext(app.slice(app.indexOf('function taskLabel('), app.indexOf('\nfunction entryLabel(')), context);
  vm.runInContext(source.slice(source.indexOf('function renderProjectTimeline('), source.indexOf('\nfunction renderCompletedTasks(')), context);
  context.renderProjectTimeline();
  for (const label of ['控制板｜功能验证', '结构件｜功能验证', '&lt;模块&gt;｜功能验证']) assert.ok(output.innerHTML.includes(label), label);
  assert.ok(!output.innerHTML.includes('<模块>'));
  assert.ok(!output.innerHTML.includes('通用｜'));
  assert.ok(output.innerHTML.includes('data-timeline-task="task-0"'));
});
