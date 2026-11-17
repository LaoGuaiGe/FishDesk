'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Model = require('../model');

test('热力图分别使用工作日期与结束日期，同一天的同一任务不重复加深', () => {
  const tasks = [{ id: 'a', status: 'done', completedOn: '2026-11-17', workLogs: [
    { date: '2026-11-16', kind: 'completed', completedOn: '2026-11-17', content: '跨日完成' }
  ] }, { id: 'b', status: 'done', completedOn: '2026-11-17', workLogs: [
    { date: '2026-11-17', kind: 'completed', completedOn: '2026-11-17', content: '当天完成' }
  ] }, { id: 'c', status: 'doing', workLogs: [{ date: '2026-11-17', kind: 'progress', content: '继续推进' }] }];
  const days = Model.monthActivity(tasks, '2026-11', '2026-11-17');
  assert.equal(days.length, 30);
  assert.deepEqual(days.find(day => day.date === '2026-11-16'), { date: '2026-11-16', records: 1, completed: 0, score: 1, level: 1, future: false });
  assert.deepEqual(days.find(day => day.date === '2026-11-17'), { date: '2026-11-17', records: 2, completed: 2, score: 3, level: 2, future: false });
});

test('热力图支持闰年、空月份与未来日期，旧记录也能显示活动', () => {
  assert.equal(Model.monthActivity([], '2024-02', '2024-02-29').length, 29);
  assert.equal(Model.monthActivity([], '2026-02', '2026-11-17').length, 28);
  const days = Model.monthActivity([{ id: 'old', status: 'doing', workLogs: [{ date: '2026-11-16', content: '旧记录' }, { date: '2026-11-18', content: '未来' }] }], '2026-11', '2026-11-17');
  assert.equal(days[15].score, 1); assert.equal(days[17].score, 0); assert.equal(days[17].future, true);
  assert.deepEqual(Model.monthActivity([], 'bad', '2026-11-17'), []);
});
