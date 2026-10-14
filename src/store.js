const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const DEFAULT_STATE = () => {
  const sceneId = randomUUID();
  return {
    version: 1,
    assets: [],
    scenes: [{ id: sceneId, name: '我的桌面', wallpaper: null, musicIds: [], musicVolume: 0.7, pets: [] }],
    activeSceneId: sceneId,
    settings: {
      launchAtLogin: false,
      pauseOnBattery: true,
      pauseOnFullscreen: true,
      showOnFullscreen: false,
      showDockIconWhenClosed: true,
      mute: true,
      showPets: true,
      theme: 'dark'
    }
  };
};

const clamp = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};

function normalize(input) {
  if (!input || !Array.isArray(input.scenes)) return DEFAULT_STATE();
  const state = DEFAULT_STATE();
  state.assets = Array.isArray(input.assets) ? input.assets.filter(asset => asset && typeof asset.id === 'string' && typeof asset.path === 'string').map(asset => ({
    id: asset.id,
    path: asset.path,
    name: typeof asset.name === 'string' ? asset.name : path.basename(asset.path),
    kind: ['image', 'audio'].includes(asset.kind) ? asset.kind : 'video',
    format: typeof asset.format === 'string' ? asset.format : path.extname(asset.path).slice(1).toLowerCase(),
    playbackPath: typeof asset.playbackPath === 'string' ? asset.playbackPath : null,
    status: ['ready', 'error'].includes(asset.status) ? asset.status : 'ready',
    error: typeof asset.error === 'string' ? asset.error : null
  })) : [];
  state.scenes = input.scenes.filter(scene => scene && typeof scene.id === 'string').map(scene => ({
    id: scene.id,
    name: typeof scene.name === 'string' ? scene.name.slice(0, 80) : '未命名场景',
    wallpaper: typeof scene.wallpaper === 'string' ? scene.wallpaper : null,
    musicIds: Array.isArray(scene.musicIds) ? [...new Set(scene.musicIds.filter(id => typeof id === 'string'))] : [],
    musicVolume: clamp(scene.musicVolume, 0, 1, 0.7),
    pets: Array.isArray(scene.pets) ? scene.pets.filter(pet => pet && typeof pet.id === 'string').map(pet => ({
      id: pet.id,
      name: typeof pet.name === 'string' ? pet.name.slice(0, 80) : '桌宠',
      assetIds: Array.isArray(pet.assetIds) ? pet.assetIds.filter(id => typeof id === 'string').slice(0, 1) : [],
      layer: pet.layer === 'floating' ? 'floating' : 'desktop',
      monitorId: typeof pet.monitorId === 'string' ? pet.monitorId : 'primary',
      x: clamp(pet.x, 0, 1, 0.65),
      y: clamp(pet.y, 0, 1, 0.55),
      width: clamp(pet.width, 0.04, 1, 0.2),
      speed: clamp(pet.speed, 0.25, 3, 1),
      opacity: clamp(pet.opacity, 0.1, 1, 1),
      motion: ['fixed', 'wander', 'follow', 'horizontal', 'vertical', 'orbit', 'figure8', 'custom'].includes(pet.motion) ? pet.motion : (pet.roam ? 'wander' : 'fixed'),
      motionDuration: clamp(pet.motionDuration, 4, 120, 20),
      routePoints: Array.isArray(pet.routePoints) ? pet.routePoints.slice(0, 20).filter(point => point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y))).map(point => ({ x: clamp(point.x, 0, 1, 0), y: clamp(point.y, 0, 1, 0) })) : [],
      hoverStyle: ['none', 'soft', 'sparkle', 'magic'].includes(pet.hoverStyle) ? pet.hoverStyle : (pet.hoverEffect === false ? 'none' : 'sparkle'),
      visible: pet.visible !== false
    })) : []
  }));
  if (!state.scenes.length) state.scenes = DEFAULT_STATE().scenes;
  state.activeSceneId = state.scenes.some(scene => scene.id === input.activeSceneId) ? input.activeSceneId : state.scenes[0].id;
  state.settings = { ...state.settings, ...(input.settings || {}) };
  for (const key of ['launchAtLogin', 'pauseOnBattery', 'pauseOnFullscreen', 'showOnFullscreen', 'showDockIconWhenClosed', 'mute', 'showPets']) {
    state.settings[key] = Boolean(state.settings[key]);
  }
  state.settings.theme = ['dark', 'light', 'system'].includes(state.settings.theme) ? state.settings.theme : 'dark';
  return state;
}

class Store {
  constructor(filePath) {
    this.filePath = filePath;
    try { this.state = normalize(JSON.parse(fs.readFileSync(filePath, 'utf8'))); }
    catch { this.state = DEFAULT_STATE(); }
  }

  get() { return structuredClone(this.state); }

  update(mutator) {
    const next = this.get();
    mutator(next);
    this.state = normalize(next);
    this.save();
    return this.get();
  }

  save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temp = `${this.filePath}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(this.state, null, 2), 'utf8');
    fs.renameSync(temp, this.filePath);
  }
}

module.exports = { Store, clamp };
