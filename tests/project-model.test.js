'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../model');
const task = (id, project = '项目 A', overrides = {}) => ({ id, project, title: id, status: 'doing', workLogs: [], ...overrides });

test('旧任务按项目归组，不因任务都已完成而自动结束项目，空项目仍保留', () => {
  const list = [task('a', '项目 A', { status: 'done' }), task('b'), task('c', '项目 B')];
  const result = model.projectsFor(list, [{ id: 'empty', name: '空项目', status: 'active' }]);
  assert.equal(result.length, 3);
  assert.equal(result.find(p => p.name === '项目 A').status, 'active');
  assert.equal(model.projectsFor(list, result).length, 3);
  result.find(p => p.name === '项目 A').status = 'completed';
  assert.equal(model.projectsFor(list, result).find(p => p.name === '项目 A').status, 'completed');
});

test('报告按记录日期和记录类型区分推进、完成、未知，不用当前状态倒推历史', () => {
  const list = [task('a', '项目 A', { status: 'done', completedAt: '2026-11-20T12:00:00Z', workLogs: [
    { date: '2026-11-16', content: '第一天推进', kind: 'progress' },
    { date: '2026-11-17', content: '原始旧记录' },
    { date: '2026-11-20', content: '验证完成', kind: 'completed' }
  ] })];
  const monday = model.report(list, '2026-11-16', '2026-11-16', '2026-11-21');
  assert.equal(monday.progress.length, 1); assert.equal(monday.completed.length, 0);
  const month = model.report(list, '2026-11-01', '2026-11-30', '2026-11-21');
  assert.equal(month.progress.length, 1); assert.equal(month.completed.length, 1); assert.equal(month.unknown.length, 1);
});

test('历史报告只使用当期快照，不混入未来计划和无关项目', () => {
  const list = [task('a', '项目 A', { nextStep: '未来计划', issue: '未来风险',
    workLogs: [{ date: '2026-11-16', content: '调试', kind: 'progress' }],
    statusHistory: [{ date: '2026-11-16', status: 'doing', nextStep: '当时计划', issue: '当时问题' },
      { date: '2026-11-18', status: 'doing', nextStep: '未来计划', issue: '未来风险' }] }),
    task('b', '无关项目', { nextStep: '不应混入' })];
  const report = model.report(list, '2026-11-16', '2026-11-16', '2026-11-20');
  assert.deepEqual(report.followUps.map(t => t.nextStep), ['当时计划']);
  assert.deepEqual(report.risks.map(t => t.issue), ['当时问题']);
  list[0].statusHistory = [];
  assert.equal(model.report(list, '2026-11-16', '2026-11-16', '2026-11-20').followUps.length, 0);
});

test('完成任务按今天和往期日期分组，超过七天也不丢失', () => {
  const groups = model.completedGroups([task('a', 'A', { status: 'done', completedOn: '2026-11-17' }),
    task('b', 'A', { status: 'done', completedOn: '2026-10-01' }), task('c')], '2026-11-17');
  assert.equal(groups.length, 2); assert.equal(groups[0].today, true); assert.equal(groups[1].date, '2026-10-01');
});

test('项目结束单独写入报告，重新开启项目不抹掉过去的结束记录', () => {
  const projects = [{ id: 'p', name: '项目 A', status: 'active', statusHistory: [
    { date: '2026-11-16', status: 'completed' }, { date: '2026-11-17', status: 'active' }
  ] }];
  const report = model.report([], '2026-11-16', '2026-11-16', '2026-11-17', projects);
  assert.deepEqual(report.projectNames, ['项目 A']);
  assert.equal(report.projectCompletions[0].eventDate, '2026-11-16');
  assert.equal(report.completed.length, 0);
});
