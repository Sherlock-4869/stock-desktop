'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  if (typeof callback !== 'function') throw new TypeError('监听器必须是函数');
  const listener = (_event, value) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('desktop', Object.freeze({
  bootstrap:() => ipcRenderer.invoke('desktop:bootstrap'),
  login:credentials => ipcRenderer.invoke('desktop:login', credentials),
  request:request => ipcRenderer.invoke('desktop:request', request),
  logout:() => ipcRenderer.invoke('desktop:logout'),
  openOverlay:() => ipcRenderer.invoke('desktop:overlay-open'),
  closeOverlay:() => ipcRenderer.invoke('desktop:overlay-close'),
  updateOverlay:values => ipcRenderer.invoke('desktop:overlay-update', values),
  previewOverlayOpacity:value => ipcRenderer.invoke('desktop:overlay-preview-opacity', value),
  setMarketColors:value => ipcRenderer.invoke('desktop:market-colors-update', value),
  minimizeMain:() => ipcRenderer.invoke('desktop:window-minimize'),
  quitApp:() => ipcRenderer.invoke('desktop:app-quit'),
  checkForUpdates:() => ipcRenderer.invoke('desktop:update-check'),
  downloadUpdate:() => ipcRenderer.invoke('desktop:update-download'),
  installUpdate:() => ipcRenderer.invoke('desktop:update-install'),
  onNavigate:callback => subscribe('desktop:navigate', callback),
  onOverlayGroup:callback => subscribe('desktop:overlay-group', callback),
  onMarketColors:callback => subscribe('desktop:market-colors', callback),
  onUpdateStatus:callback => subscribe('desktop:update-status', callback),
  onSessionRefreshed:callback => subscribe('desktop:session-refreshed', callback),
}));
