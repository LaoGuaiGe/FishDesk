'use strict';
const fs = require('node:fs');
const originalFetch = global.fetch;
global.fetch = async (url, options) => {
  if (String(url) !== 'https://style-test.invalid/chat/completions') return originalFetch(url, options);
  const request = JSON.parse(options.body);
  const file = process.env.FISHDESK_STYLE_CAPTURE;
  const messages = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  messages.push(request.messages);
  fs.writeFileSync(file, JSON.stringify(messages));
  return new Response(JSON.stringify({ choices: [{ message: { content: '润色后的测试文本' }, finish_reason: 'stop' }] }), { status: 200 });
};
