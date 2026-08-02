const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('dispatchlinkSetup', {
  complete: (url) => ipcRenderer.invoke('dispatchlink:setup-complete', url)
});
