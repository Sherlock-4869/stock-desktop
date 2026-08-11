'use strict';

const fs = require('fs');
const path = require('path');
const { normalizeServerUrl } = require('../shared/protocol');

const DEFAULT_OVERLAY = Object.freeze({
  bounds: null,
  opacity: 0.94,
  alwaysOnTop: true,
  groupId: null,
});

function validBounds(value, { minWidth = 360, minHeight = 230, maxWidth = 3200, maxHeight = 2200 } = {}) {
  if (!value || typeof value !== 'object') return null;
  const { x, y, width, height } = value;
  if (![x, y, width, height].every(Number.isInteger)
    || Math.abs(x) > 100000 || Math.abs(y) > 100000
    || width < minWidth || width > maxWidth || height < minHeight || height > maxHeight) return null;
  return { x, y, width, height };
}

function sanitizeOverlay(value) {
  const source = value && typeof value === 'object' ? value : {};
  const opacity = Number(source.opacity);
  const groupId = typeof source.groupId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(source.groupId)
    ? source.groupId : null;
  return {
    bounds: validBounds(source.bounds),
    opacity: Number.isFinite(opacity) && opacity >= 0.3 && opacity <= 1 ? opacity : DEFAULT_OVERLAY.opacity,
    alwaysOnTop: source.alwaysOnTop !== false,
    groupId,
  };
}

function defaultSettings() {
  return {
    version: 1,
    serverUrl: '',
    mainWindowBounds: null,
    overlay: { ...DEFAULT_OVERLAY },
  };
}

class PreferencesStore {
  constructor(userDataPath) {
    this.filePath = path.join(userDataPath, 'desktop-preferences.json');
    this.settings = defaultSettings();
  }

  load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      this.settings = {
        version: 1,
        serverUrl: normalizeServerUrl(parsed?.serverUrl, { allowHttp:process.env.NODE_ENV !== 'production' }) || '',
        mainWindowBounds: validBounds(parsed?.mainWindowBounds, { minWidth:900, minHeight:620, maxWidth:5000, maxHeight:4000 }),
        overlay: sanitizeOverlay(parsed?.overlay),
      };
    } catch (_) {
      this.settings = defaultSettings();
    }
    return this.getPublic();
  }

  getPublic() {
    return JSON.parse(JSON.stringify(this.settings));
  }

  save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive:true, mode:0o700 });
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(this.settings), { encoding:'utf8', mode:0o600 });
    fs.renameSync(temporary, this.filePath);
  }

  setServerUrl(value) {
    const serverUrl = normalizeServerUrl(value, { allowHttp:process.env.NODE_ENV !== 'production' });
    if (!serverUrl) throw new Error('服务器地址必须是 HTTPS 地址（仅开发环境允许 HTTP）');
    this.settings.serverUrl = serverUrl;
    this.save();
    return serverUrl;
  }

  setMainWindowBounds(bounds) {
    const valid = validBounds(bounds, { minWidth:900, minHeight:620, maxWidth:5000, maxHeight:4000 });
    if (!valid) return;
    this.settings.mainWindowBounds = valid;
    this.save();
  }

  setOverlay(update) {
    this.settings.overlay = sanitizeOverlay({ ...this.settings.overlay, ...update });
    this.save();
    return { ...this.settings.overlay };
  }
}

module.exports = { PreferencesStore, validBounds, sanitizeOverlay };
