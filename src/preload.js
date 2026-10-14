const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('deskPets', {
  getState: () => ipcRenderer.invoke('state:get'),
  getDisplays: () => ipcRenderer.invoke('displays:get'),
  importMedia: kind => ipcRenderer.invoke('media:import', kind),
  addPet: (assetId, monitorId) => ipcRenderer.invoke('pet:add', assetId, monitorId),
  patchPet: (id, patch) => ipcRenderer.invoke('pet:patch', id, patch),
  removePet: id => ipcRenderer.invoke('pet:remove', id),
  addScene: () => ipcRenderer.invoke('scene:add'),
  renameScene: (id, name) => ipcRenderer.invoke('scene:rename', id, name),
  deleteScene: id => ipcRenderer.invoke('scene:delete', id),
  activateScene: id => ipcRenderer.invoke('scene:activate', id),
  setSceneWallpaper: assetId => ipcRenderer.invoke('scene:wallpaper', assetId),
  addSceneMusic: assetId => ipcRenderer.invoke('scene:music:add', assetId),
  removeSceneMusic: assetId => ipcRenderer.invoke('scene:music:remove', assetId),
  setSceneMusicVolume: volume => ipcRenderer.invoke('scene:music:volume', volume),
  updateSettings: patch => ipcRenderer.invoke('settings:update', patch),
  removeAsset: id => ipcRenderer.invoke('asset:remove', id),
  pause: value => ipcRenderer.invoke('playback:pause', value),
  showManager: () => ipcRenderer.invoke('manager:show'),
  onState: callback => { const handler = (_event, state) => callback(state); ipcRenderer.on('state:changed', handler); return () => ipcRenderer.removeListener('state:changed', handler); },
  onDisplays: callback => { const handler = (_event, displays) => callback(displays); ipcRenderer.on('displays:changed', handler); return () => ipcRenderer.removeListener('displays:changed', handler); },
  onPlayback: callback => { const handler = (_event, data) => callback(data); ipcRenderer.on('playback:changed', handler); return () => ipcRenderer.removeListener('playback:changed', handler); },
  onCursor: callback => { const handler = (_event, point) => callback(point); ipcRenderer.on('cursor:move', handler); return () => ipcRenderer.removeListener('cursor:move', handler); },
  onTheme: callback => { const handler = (_event, theme) => callback(theme); ipcRenderer.on('theme:changed', handler); return () => ipcRenderer.removeListener('theme:changed', handler); },
  onNotice: callback => { const handler = (_event, notice) => callback(notice); ipcRenderer.on('notice', handler); return () => ipcRenderer.removeListener('notice', handler); }
});
