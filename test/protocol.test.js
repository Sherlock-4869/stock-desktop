'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseDeepLink,
  protocolTargetFromArgv,
  normalizeApiRequest,
  isRendererRequest,
  normalizeServerUrl,
} = require('../src/shared/protocol');

test('deep links accept only public group or stock locations', () => {
  assert.deepEqual(parseDeepLink('stockwatch://watch?group=g_long_term'), { type:'group', groupId:'g_long_term' });
  assert.deepEqual(parseDeepLink('stockwatch://stock?symbol=sh600519'), { type:'stock', symbol:'sh600519' });
  assert.deepEqual(protocolTargetFromArgv(['--flag', 'stockwatch://stock?symbol=usAAPL']), { type:'stock', symbol:'usAAPL' });
  assert.equal(parseDeepLink('stockwatch://watch?group=default&token=secret'), null);
  assert.equal(parseDeepLink('stockwatch://stock?symbol=sh600519&password=secret'), null);
  assert.equal(parseDeepLink('stockwatch://watch?group=../../etc'), null);
  assert.equal(parseDeepLink('https://stockwatch/watch?group=default'), null);
});

test('desktop API bridge has a narrow allowlist and validates quote symbols', () => {
  assert.deepEqual(normalizeApiRequest({ method:'POST', path:'/api/auth/desktop/login', body:{ username:'demo', password:'secret' } }), {
    method:'POST', path:'/api/auth/desktop/login', body:{ username:'demo', password:'secret' },
  });
  assert.deepEqual(normalizeApiRequest({ method:'GET', path:'/api/quote?symbols=sh600519%2Csz000001' }), {
    method:'GET', path:'/api/quote?symbols=sh600519%2Csz000001', body:null,
  });
  assert.equal(normalizeApiRequest({ method:'POST', path:'/api/admin/users', body:{} }), null);
  assert.equal(normalizeApiRequest({ method:'GET', path:'/api/quote?symbols=sh600519&next=https://evil.test' }), null);
  assert.equal(normalizeApiRequest({ method:'GET', path:'https://evil.test/api/quote?symbols=sh600519' }), null);
  assert.equal(isRendererRequest({ method:'POST', path:'/api/auth/desktop/login', body:{} }), null);
  assert.deepEqual(isRendererRequest({ method:'GET', path:'/api/auth/me' }), { method:'GET', path:'/api/auth/me', body:null });
});

test('server address rejects credentials, paths, and production HTTP', () => {
  assert.equal(normalizeServerUrl('https://stock.example.com/'), 'https://stock.example.com');
  assert.equal(normalizeServerUrl('https://user:password@stock.example.com'), null);
  assert.equal(normalizeServerUrl('https://stock.example.com/api'), null);
  assert.equal(normalizeServerUrl('http://stock.example.com'), null);
  assert.equal(normalizeServerUrl('http://stock.example.com', { allowHttp:true }), 'http://stock.example.com');
});

test('main window keeps a dock presence and a full-width draggable title bar', () => {
  const mainSource = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'src', 'main', 'index.js'), 'utf8');
  const html = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'src', 'renderer', 'main.html'), 'utf8');
  assert.match(mainSource, /movable:true/);
  assert.match(mainSource, /skipTaskbar:false/);
  assert.match(mainSource, /app\.setActivationPolicy\('regular'\)/);
  assert.match(mainSource, /app\.dock\?\.show\(\)/);
  assert.match(mainSource, /skipTransformProcessType:true/);
  assert.match(html, /<header class="topbar drag-region">/);
  assert.match(html, /topbar-actions no-drag/);
});
