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
  setServerUrl:value => ipcRenderer.invoke('desktop:set-server-url', value),
  login:credentials => ipcRenderer.invoke('desktop:login', credentials),
  request:request => ipcRenderer.invoke('desktop:request', request),
  logout:() => ipcRenderer.invoke('desktop:logout'),
  openOverlay:() => ipcRenderer.invoke('desktop:overlay-open'),
  closeOverlay:() => ipcRenderer.invoke('desktop:overlay-close'),
  updateOverlay:values => ipcRenderer.invoke('desktop:overlay-update', values),
  checkForUpdates:() => ipcRenderer.invoke('desktop:update-check'),
  downloadUpdate:() => ipcRenderer.invoke('desktop:update-download'),
  installUpdate:() => ipcRenderer.invoke('desktop:update-install'),
  onNavigate:callback => subscribe('desktop:navigate', callback),
  onOverlayGroup:callback => subscribe('desktop:overlay-group', callback),
  onUpdateStatus:callback => subscribe('desktop:update-status', callback),
  onSessionRefreshed:callback => subscribe('desktop:session-refreshed', callback),
}));
