'use strict';

const fs = require('fs');
const path = require('path');

class TokenVault {
  constructor(userDataPath, safeStorage) {
    this.filePath = path.join(userDataPath, 'desktop-session.v1');
    this.safeStorage = safeStorage;
  }

  isAvailable() {
    try { return Boolean(this.safeStorage?.isEncryptionAvailable()); } catch (_) { return false; }
  }

  load() {
    if (!this.isAvailable()) return null;
    try {
      const encrypted = Buffer.from(fs.readFileSync(this.filePath, 'utf8'), 'base64');
      const session = JSON.parse(this.safeStorage.decryptString(encrypted));
      if (!session || typeof session.token !== 'string' || !/^[A-Za-z0-9_-]{40,200}$/.test(session.token)) return null;
      return { token:session.token, expiresAt:typeof session.expiresAt === 'string' ? session.expiresAt : null };
    } catch (_) { return null; }
  }

  save(session) {
    if (!this.isAvailable()) return false;
    if (!session || typeof session.token !== 'string' || !/^[A-Za-z0-9_-]{40,200}$/.test(session.token)) {
      throw new Error('桌面会话凭据不正确');
    }
    const value = JSON.stringify({ token:session.token, expiresAt:session.expiresAt || null });
    const encrypted = this.safeStorage.encryptString(value).toString('base64');
    fs.mkdirSync(path.dirname(this.filePath), { recursive:true, mode:0o700 });
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, encrypted, { encoding:'utf8', mode:0o600 });
    fs.renameSync(temporary, this.filePath);
    return true;
  }

  clear() {
    try { fs.unlinkSync(this.filePath); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

module.exports = { TokenVault };
