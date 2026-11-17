'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Model = require('../model');

test('当前年份展示过去一年，按周分列且每列七天，顶部月份跨年连续', () => {
  const data = Model.contributionYear([], 2026, '2026-11-17');
  assert.equal(data.days.length, 365);
  assert.equal(data.end, '2026-11-17');
  assert.equal(data.start, '2025-11-18');
  assert.equal(data.cells.length % 7, 0);
  assert.equal(new Date(data.cells[0].date + 'T12:00:00').getDay(), 0);
  assert.equal(new Date(data.cells.at(-1).date + 'T12:00:00').getDay(), 6);
  assert.equal(data.months[0].label, '11月');
  assert.equal(data.months.at(-1).label, '11月');
  assert.equal(data.cells.filter(cell => !cell.outside).length, 365);
});

test('历史年份展示完整一年并正确处理闰年，工作活动统计不变', () => {
  const task = { id: 'a', status: 'done', completedOn: '2024-02-29', workLogs: [{ date: '2024-02-29', kind: 'completed', completedOn: '2024-02-29', content: '已完成' }] };
  const data = Model.contributionYear([task], 2024, '2026-11-17');
  assert.equal(data.start, '2024-01-01'); assert.equal(data.end, '2024-12-31');
  assert.equal(data.days.length, 366); assert.equal(data.total, 1); assert.equal(data.records, 1); assert.equal(data.completed, 1);
  assert.equal(Model.contributionYear([task], 2026, '2026-11-17').total, 0);
  assert.equal(Model.contributionYear([], 2027, '2026-11-17'), null);
});
