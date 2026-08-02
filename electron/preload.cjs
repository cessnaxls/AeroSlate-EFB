const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('dispatchlinkNative', {
  isElectron: true,
  openExternal: (url) => ipcRenderer.invoke('dispatchlink:open-external', url),
  getAppUrl: () => ipcRenderer.invoke('dispatchlink:get-app-url'),
  setAppUrl: (url) => ipcRenderer.invoke('dispatchlink:set-app-url', url)
});
