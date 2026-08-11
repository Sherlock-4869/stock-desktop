'use strict';

const { normalizeApiRequest } = require('../shared/protocol');

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

async function readResponseBody(response) {
  const declaredSize = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredSize) && declaredSize > MAX_RESPONSE_BYTES) {
    throw new Error('服务器响应过大');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_RESPONSE_BYTES) throw new Error('服务器响应过大');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function responseError(status, payload) {
  const message = payload && typeof payload === 'object' && typeof payload.error === 'string'
    ? payload.error : `请求失败（HTTP ${status}）`;
  return Object.assign(new Error(message), { statusCode:status });
}

class DesktopApiClient {
  constructor({ preferences, vault, fetchImpl = global.fetch }) {
    this.preferences = preferences;
    this.vault = vault;
    this.fetch = fetchImpl;
    this.session = vault.load();
  }

  getServerUrl() {
    return this.preferences.getPublic().serverUrl;
  }

  async request(input) {
    const request = normalizeApiRequest(input);
    if (!request) throw new Error('不允许的桌面端请求');
    const serverUrl = this.getServerUrl();
    if (!serverUrl) throw new Error('请先填写股票服务地址');
    const headers = { Accept:'application/json, text/plain;q=0.9' };
    if (this.session?.token && request.path !== '/api/auth/desktop/login') {
      headers.Authorization = `Bearer ${this.session.token}`;
    }
    if (request.body != null) headers['Content-Type'] = 'application/json';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    let response;
    try {
      response = await this.fetch(new URL(request.path, `${serverUrl}/`), {
        method:request.method,
        headers,
        body:request.body == null ? undefined : JSON.stringify(request.body),
        signal:controller.signal,
      });
    } catch (error) {
      throw new Error(error.name === 'AbortError' ? '请求超时，请检查网络连接' : '无法连接到股票服务');
    } finally {
      clearTimeout(timer);
    }
    const text = await readResponseBody(response);
    const contentType = response.headers.get('content-type') || '';
    let payload = text;
    if (contentType.includes('application/json')) {
      try { payload = text ? JSON.parse(text) : {}; }
      catch (_) { throw new Error('服务器返回了无效数据'); }
    }
    if (!response.ok) throw responseError(response.status, payload);
    return payload;
  }

  saveDesktopSession(payload) {
    const session = payload?.desktopSession;
    if (!session || typeof session.token !== 'string') throw new Error('服务器未返回有效桌面会话');
    this.session = { token:session.token, expiresAt:session.expiresAt || null };
    const persisted = this.vault.save(this.session);
    const publicPayload = { ...payload };
    delete publicPayload.desktopSession;
    return { payload:publicPayload, persisted };
  }

  async login({ username, password }) {
    const payload = await this.request({
      method:'POST', path:'/api/auth/desktop/login', body:{ username, password },
    });
    return this.saveDesktopSession(payload);
  }

  async refresh() {
    const payload = await this.request({ method:'POST', path:'/api/auth/desktop/refresh', body:{} });
    return this.saveDesktopSession(payload);
  }

  async bootstrap() {
    if (!this.session?.token) return { auth:null, sessionRestored:false };
    try {
      // Rotating at startup limits the useful lifetime of a copied desktop token
      // and confirms that the server session has not been revoked.
      const result = await this.refresh();
      return { auth:result.payload, sessionRestored:true, secureStorageAvailable:result.persisted };
    } catch (error) {
      if (error.statusCode === 401) {
        this.session = null;
        this.vault.clear();
        return { auth:null, sessionRestored:false };
      }
      return { auth:null, sessionRestored:false, offline:true, error:error.message };
    }
  }

  async logout() {
    try {
      if (this.session?.token) await this.request({ method:'POST', path:'/api/auth/desktop/logout', body:{} });
    } finally {
      this.session = null;
      this.vault.clear();
    }
  }
}

module.exports = { DesktopApiClient, readResponseBody };
