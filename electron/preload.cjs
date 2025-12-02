const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('codexApi', {
  pickImages: () => ipcRenderer.invoke('file:pickImages'),
  startSession: (opts) => ipcRenderer.invoke('session:start', opts),
  sendMessage: (payload) => ipcRenderer.invoke('session:send', payload),
  stopSession: (sessionId) => ipcRenderer.invoke('session:stop', sessionId),
  onData: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('session:data', listener);
    return () => ipcRenderer.removeListener('session:data', listener);
  },
  onError: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('session:error', listener);
    return () => ipcRenderer.removeListener('session:error', listener);
  },
  onExit: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('session:exit', listener);
    return () => ipcRenderer.removeListener('session:exit', listener);
  },
  readImageAsDataUrl: (filePath) => ipcRenderer.invoke('file:previewImage', filePath),
  pickCwd: () => ipcRenderer.invoke('cwd:pick'),
});
