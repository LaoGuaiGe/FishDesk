'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Model = require('../model');

test('预览、复制和 Markdown 都按项目区分完成、推进、未知，历史报告不混入今日计划', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const tasks = [{ id: 'a', project: '项目 A', module: '测试', title: '持续调试', status: 'done', nextStep: '未来计划不应出现', issue: '未来风险不应出现',
    workLogs: [{ date: '2026-11-16', kind: 'progress', content: '第一天推进' }],
    statusHistory: [{ date: '2026-11-16', status: 'doing', nextStep: '当时的后续计划', issue: '' }] },
    { id: 'b', project: '项目 A', title: '已交付任务', status: 'done', workLogs: [{ date: '2026-11-16', kind: 'completed', content: '已验证完成' }] },
    { id: 'c', project: '项目 B', title: '旧任务', status: 'done', workLogs: [{ date: '2026-11-16', content: '历史状态未知' }] }];
  const context = vm.createContext({ FishDeskModel: Model, tasks, projects: [], activeReportType: 'day', activeReportDate: '2026-11-16',
    dateStamp: () => '2026-11-17', parseDateStamp: stamp => new Date(stamp + 'T00:00:00'), formatShortDate: stamp => stamp,
    WEEKDAYS: ['日','一','二','三','四','五','六'], REPORT_META: { day: { kind: '日报' } },
    escapeHTML: value => String(value).replaceAll('<', '&lt;').replaceAll('>', '&gt;') });
  // Date conversion in getReportPeriod must preserve the requested boundaries.
  context.dateStamp = date => date ? Model.day(date.toISOString()) : '2026-11-17';
  vm.runInContext(source.slice(source.indexOf('function getReportPeriod'), source.indexOf('\nfunction downloadReport')), context);
  const data = context.getReportData();
  for (const output of [context.buildReportHTML(data), context.buildReportMarkdown(data), context.buildReportText(data)]) {
    for (const required of ['项目 A','项目 B','本期已完成','本期推进','未分类历史记录','第一天推进','已验证完成','历史状态未知','当时的后续计划']) assert.ok(output.includes(required), required);
    assert.ok(!output.includes('未来计划不应出现'));
    assert.ok(!output.includes('未来风险不应出现'));
    assert.ok(output.indexOf('已验证完成') < output.indexOf('第一天推进'));
  }
});
