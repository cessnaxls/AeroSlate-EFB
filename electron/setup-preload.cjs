const { contextBridge, ipcRenderer } = require('electron');
const api = { complete: (url) => ipcRenderer.invoke('aeroslate:setup-complete', url) };
contextBridge.exposeInMainWorld('aeroslateSetup', api);
contextBridge.exposeInMainWorld('dispatchlinkSetup', api);
