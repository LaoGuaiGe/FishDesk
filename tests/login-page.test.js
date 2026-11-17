'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function page(status, payload) {
  const html = fs.readFileSync(path.join(__dirname, '..', 'login.html'), 'utf8');
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
  const handlers = {};
  const input = { value: 'wrong', type: 'password', classList: { add() {}, remove() {} }, focus() {}, select() {},
    addEventListener: (name, fn) => { handlers[name] = fn; } };
  const form = { addEventListener: (name, fn) => { handlers[name] = fn; } };
  const error = { hidden: true, textContent: '' };
  const button = { disabled: false, textContent: '进入工作台' };
  const attributes = { 'aria-pressed': 'false', 'aria-label': '显示密码' };
  const toggle = { setAttribute: (key, value) => { attributes[key] = value; },
    addEventListener: (name, fn) => { handlers[`toggle-${name}`] = fn; } };
  const elements = { '#login-form': form, '#password': input, '#login-error': error, '#login-button': button, '#password-toggle': toggle };
  let now = 1000;
  let calls = 0;
  let tick;
  const location = { search: '', replace() { throw new Error('Unexpected navigation'); } };
  vm.runInNewContext(script, { document: { querySelector: selector => elements[selector] }, location, URLSearchParams,
    Date: { now: () => now }, setTimeout: fn => { tick = fn; return 1; }, clearTimeout() {},
    fetch: async () => { calls++; return { ok: status === 200, status, headers: new Headers(), json: async () => payload }; } });
  return { input, error, button, attributes, calls: () => calls, toggle: () => handlers['toggle-click'](),
    submit: () => handlers.submit({ preventDefault() {} }), inputEvent: () => handlers.input(),
    advance: milliseconds => { now += milliseconds; tick(); } };
}

test('错误密码显示明确提示', async () => {
  const ui = page(401, { error: '密码不正确' });
  await ui.submit();
  assert.equal(ui.error.hidden, false);
  assert.equal(ui.error.textContent, '密码不正确');
  assert.equal(ui.button.disabled, false);
});

test('密码查看按钮由页面提供，输错并重新输入后仍可切换，提交时恢复隐藏', async () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'login.html'), 'utf8');
  assert.match(html, /<button[^>]*id="password-toggle"[^>]*type="button"/);
  const ui = page(401, { error: '密码不正确' });
  assert.equal(ui.input.type, 'password');
  ui.toggle();
  assert.equal(ui.input.type, 'text');
  assert.equal(ui.attributes['aria-label'], '隐藏密码');
  assert.equal(ui.attributes['aria-pressed'], 'true');
  await ui.submit();
  assert.equal(ui.input.type, 'password');
  assert.equal(ui.attributes['aria-pressed'], 'false');
  ui.input.value = 'second-try';
  ui.inputEvent();
  ui.toggle();
  assert.equal(ui.input.type, 'text');
  assert.equal(ui.input.value, 'second-try');
  ui.toggle();
  assert.equal(ui.input.type, 'password');
  assert.equal(ui.attributes['aria-label'], '显示密码');
});

test('限流期间显示倒计时，不能通过重新输入或再次提交绕过，期满恢复', async () => {
  const ui = page(429, { error: '密码错误次数过多', retryAfter: 10 });
  await ui.submit();
  assert.equal(ui.button.disabled, true);
  assert.match(ui.error.textContent, /10/);
  ui.inputEvent();
  assert.equal(ui.error.hidden, false);
  await ui.submit();
  assert.equal(ui.calls(), 1);
  ui.advance(11000);
  assert.equal(ui.button.disabled, false);
  assert.match(ui.error.textContent, /重新/);
});
