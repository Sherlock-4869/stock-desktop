'use strict';

const PROTOCOL = 'stockwatch:';
const GROUP_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const SYMBOL_PATTERN = /^[A-Za-z0-9._-]{1,24}$/;

function parseDeepLink(value) {
  if (typeof value !== 'string' || value.length > 512) return null;
  let url;
  try { url = new URL(value); } catch (_) { return null; }
  if (url.protocol !== PROTOCOL || !['watch', 'stock'].includes(url.hostname)) return null;
  if (!['', '/'].includes(url.pathname) || url.username || url.password || url.port || url.hash) return null;

  const keys = [...url.searchParams.keys()];
  if (url.hostname === 'watch') {
    if (keys.length !== 1 || keys[0] !== 'group') return null;
    const groupId = url.searchParams.get('group') || '';
    return GROUP_ID_PATTERN.test(groupId) ? { type:'group', groupId } : null;
  }
  if (keys.length !== 1 || keys[0] !== 'symbol') return null;
  const symbol = url.searchParams.get('symbol') || '';
  return SYMBOL_PATTERN.test(symbol) ? { type:'stock', symbol } : null;
}

function protocolTargetFromArgv(argv) {
  if (!Array.isArray(argv)) return null;
  for (const value of argv) {
    const target = parseDeepLink(value);
    if (target) return target;
  }
  return null;
}

function normalizeServerUrl(value, { allowHttp = false } = {}) {
  if (typeof value !== 'string' || value.length > 500) return null;
  let url;
  try { url = new URL(value.trim()); } catch (_) { return null; }
  const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(allowHttp || localHttp) || url.username || url.password || url.search || url.hash) return null;
  if (url.pathname !== '/' && url.pathname !== '') return null;
  return url.origin;
}

function allowedSymbols(value) {
  const symbols = String(value || '').split(',').filter(Boolean);
  return symbols.length > 0 && symbols.length <= 100 && symbols.every(symbol => SYMBOL_PATTERN.test(symbol));
}

function normalizeApiRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const method = String(input.method || 'GET').toUpperCase();
  if (!['GET', 'POST'].includes(method) || typeof input.path !== 'string' || input.path.length > 1200) return null;
  let url;
  try { url = new URL(input.path, 'https://desktop.invalid'); } catch (_) { return null; }
  if (url.origin !== 'https://desktop.invalid' || url.hash || url.username || url.password) return null;
  const pathname = url.pathname;
  const permitted = new Set([
    'GET /api/auth/me',
    'POST /api/auth/desktop/login',
    'POST /api/auth/desktop/refresh',
    'POST /api/auth/desktop/logout',
  ]);
  if (permitted.has(`${method} ${pathname}`) && !url.search) {
    if (method === 'POST' && input.body != null && (typeof input.body !== 'object' || Array.isArray(input.body))) return null;
    return { method, path:pathname, body:input.body == null ? null : input.body };
  }
  if (method !== 'GET' || pathname !== '/api/quote' || [...url.searchParams.keys()].length !== 1 || !url.searchParams.has('symbols')) return null;
  const symbols = url.searchParams.get('symbols');
  if (!allowedSymbols(symbols)) return null;
  return { method, path:`${pathname}?symbols=${encodeURIComponent(symbols)}`, body:null };
}

function isRendererRequest(input) {
  const request = normalizeApiRequest(input);
  if (!request) return null;
  if (request.method === 'GET' && (request.path === '/api/auth/me' || request.path.startsWith('/api/quote?symbols='))) return request;
  return null;
}

module.exports = {
  GROUP_ID_PATTERN,
  SYMBOL_PATTERN,
  parseDeepLink,
  protocolTargetFromArgv,
  normalizeServerUrl,
  normalizeApiRequest,
  isRendererRequest,
};
