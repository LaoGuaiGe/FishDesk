'use strict';

const originalFetch = global.fetch;
const releaseUrl = 'https://github.com/LaoGuaiGe/FishDesk/releases/latest/download/release.json';

global.fetch = async (input, options) => {
  if (String(input) !== releaseUrl) return originalFetch(input, options);
  const current = require('../package.json').version.split('.').map(Number);
  current[2] += 1;
  return new Response(JSON.stringify({
    version: current.join('.'),
    image: 'ghcr.io/laoguaige/fishdesk',
    digest: `sha256:${'a'.repeat(64)}`,
    minUpdaterVersion: 1,
    createdAt: new Date().toISOString()
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
