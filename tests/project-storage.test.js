'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('./helpers.cjs');

test('旧数据生成项目入口，保存项目资料后旧客户端写入仍保留资料，重启后保留', async t => {
  const task = { id: 'task', title: '联调', project: '机器人', status: 'doing', workLogs: [{ id: 'log', date: '2026-11-16', content: '旧进展' }] };
  const server = await startServer(t, { files: { 'daylight.json': JSON.stringify({ rev: 3, updatedAt: null, tasks: [task] }) } });
  const cookie = await server.cookie();
  const get = s => s.request('/api/tasks', { headers: { Cookie: cookie } }).then(r => r.json());
  const put = (s, data) => s.request('/api/tasks', { method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const initial = await get(server);
  assert.equal(initial.projects[0].name, '机器人');
  assert.deepEqual(initial.tasks, [task]);
  initial.projects[0].goal = '交付可演示样机';
  initial.projects[0].status = 'completed';
  assert.equal((await put(server, { baseRev: 3, tasks: initial.tasks, projects: initial.projects })).status, 200);
  assert.equal((await put(server, { baseRev: 4, tasks: initial.tasks })).status, 200);
  await server.stop();
  const restarted = await startServer(t, { dataDir: server.dataDir });
  const saved = await get(restarted);
  assert.equal(saved.projects[0].goal, '交付可演示样机');
  assert.equal(saved.projects[0].status, 'completed');
  assert.deepEqual(saved.tasks[0].workLogs, task.workLogs);
});

test('无任务的独立项目可保存，冲突时携带项目资料用于合并，非法项目不能覆盖数据', async t => {
  const server = await startServer(t);
  const cookie = await server.cookie();
  const project = { id: 'project-empty', name: '刚启动的项目', status: 'active', goal: '需求确认', phase: '准备' };
  const put = data => server.request('/api/tasks', { method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  assert.equal((await put({ baseRev: 0, tasks: [], projects: [project] })).status, 200);
  const conflict = await put({ baseRev: 0, tasks: [], projects: [] });
  assert.equal(conflict.status, 409); assert.deepEqual((await conflict.json()).projects, [project]);
  assert.equal((await put({ baseRev: 1, tasks: [], projects: [{ ...project, name: '' }] })).status, 400);
  const saved = await (await server.request('/api/tasks', { headers: { Cookie: cookie } })).json();
  assert.deepEqual(saved.projects, [project]);
});

test('旧标签页保存任务时不抹掉新的记录分类和历史快照', async t => {
  const original = { id: 'task', title: '调试', project: '机器人', status: 'done', completedOn: '2026-11-16',
    statusHistory: [{ date: '2026-11-16', status: 'done', nextStep: '', issue: '' }],
    workLogs: [{ id: 'log', date: '2026-11-16', content: '已完成', kind: 'completed', snapshot: { status: 'done', nextStep: '', issue: '' } }] };
  const server = await startServer(t, { files: { 'daylight.json': JSON.stringify({ rev: 1, tasks: [original] }) } });
  const cookie = await server.cookie();
  const legacyTask = { id: 'task', title: '调试', project: '机器人', status: 'done', workLogs: [{ id: 'log', date: '2026-11-16', content: '已完成，补充说明' }] };
  const response = await server.request('/api/tasks', { method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ baseRev: 1, tasks: [legacyTask] }) });
  assert.equal(response.status, 200);
  const result = await (await server.request('/api/tasks', { headers: { Cookie: cookie } })).json();
  assert.equal(result.tasks[0].workLogs[0].kind, 'completed');
  assert.equal(result.tasks[0].workLogs[0].content, '已完成，补充说明');
  assert.deepEqual(result.tasks[0].statusHistory, original.statusHistory);
  assert.deepEqual(result.tasks[0].workLogs[0].snapshot, original.workLogs[0].snapshot);
  assert.equal(result.tasks[0].completedOn, '2026-11-16');
});
