const { contextBridge, ipcRenderer } = require('electron');
const api = {
  isElectron: true,
  openExternal: (url) => ipcRenderer.invoke('aeroslate:open-external', url),
  openProvider: (url, title) => ipcRenderer.invoke('aeroslate:open-provider', url, title),
  getAppUrl: () => ipcRenderer.invoke('aeroslate:get-app-url'),
  setAppUrl: (url) => ipcRenderer.invoke('aeroslate:set-app-url', url)
};
contextBridge.exposeInMainWorld('aeroslateNative', api);
contextBridge.exposeInMainWorld('dispatchlinkNative', api);
