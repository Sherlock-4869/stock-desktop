'use strict';

function createUpdateService({ app, autoUpdater, send }) {
  let configured = false;
  let checkTimer = null;

  function publish(status, details = {}) {
    send('desktop:update-status', { status, ...details });
  }

  function setup() {
    if (configured || !app.isPackaged) return false;
    configured = true;
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.channel = process.env.STOCK_DESKTOP_UPDATE_CHANNEL === 'beta' ? 'beta' : 'latest';
    autoUpdater.on('checking-for-update', () => publish('checking'));
    autoUpdater.on('update-available', info => publish('available', { version:info.version }));
    autoUpdater.on('update-not-available', () => publish('current'));
    autoUpdater.on('update-downloaded', info => publish('downloaded', { version:info.version }));
    autoUpdater.on('error', () => publish('error', { message:'更新检查失败，请稍后重试' }));
    return true;
  }

  async function check() {
    if (!setup()) return { available:false, reason:'development' };
    const result = await autoUpdater.checkForUpdates();
    return { available:Boolean(result?.updateInfo?.version), version:result?.updateInfo?.version || null };
  }

  async function download() {
    if (!setup()) throw new Error('开发环境不提供自动更新');
    return autoUpdater.downloadUpdate();
  }

  function install() {
    if (!configured) throw new Error('当前没有已下载的更新');
    autoUpdater.quitAndInstall();
  }

  function start() {
    if (!setup()) return;
    check().catch(() => {});
    checkTimer = setInterval(() => check().catch(() => {}), 6 * 60 * 60 * 1000);
  }

  function stop() {
    if (checkTimer) clearInterval(checkTimer);
    checkTimer = null;
  }

  return { start, stop, check, download, install };
}

module.exports = { createUpdateService };
