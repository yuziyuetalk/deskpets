let state;
let displays = [];
let selectedPetId = null;
let selectedDisplayId = null;
let routeEditing = false;
let inspectorTab = 'basic';
let playback = { paused: false, reasons: [] };
let noticeTimer;

const $ = selector => document.querySelector(selector);
const scene = () => state.scenes.find(item => item.id === state.activeSceneId);
const asset = id => state.assets.find(item => item.id === id);
const pet = () => scene().pets.find(item => item.id === selectedPetId);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const format = value => Math.round(value * 100);

function displayForPet(item) {
  return displays.find(display => display.id === item.monitorId) || displays.find(display => display.primary) || displays[0];
}
function currentDisplay() { return displays.find(display => display.id === selectedDisplayId) || displays.find(display => display.primary) || displays[0]; }
function showNotice(message, type = 'info') {
  const el = $('#notice');
  el.textContent = message;
  el.className = `notice ${type}`;
  el.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { el.hidden = true; }, 6500);
}
function renderSceneList() {
  $('#scene-list').innerHTML = state.scenes.map(item => `<button class="scene-button ${item.id === state.activeSceneId ? 'active' : ''}" data-scene="${item.id}"><span class="scene-dot"></span><span>${escapeHtml(item.name)}</span><span class="count">${item.pets.length}</span></button>`).join('');
}
function renderAssetList() {
  const list = state.assets;
  $('#asset-list').innerHTML = list.length ? list.map(item => {
    const isVideo = item.kind === 'video';
    const isAudio = item.kind === 'audio';
    const action = isVideo ? 'add' : isAudio ? 'music' : 'wallpaper';
    const label = isVideo ? '添加桌宠' : isAudio ? (scene().musicIds.includes(item.id) ? '已加入场景' : '添加到场景') : '设为壁纸';
    return `<div class="asset-card ${item.exists ? '' : 'missing'}"><div class="asset-top"><div class="asset-icon">${isVideo ? '▶' : isAudio ? '♫' : '▧'}</div><div class="asset-info"><span class="asset-name" title="${escapeHtml(item.path)}">${escapeHtml(item.name)}</span><div class="asset-format">${item.exists ? item.format.toUpperCase() : '素材文件已丢失'}</div></div></div><div class="asset-actions"><button data-asset-action="${action}" data-id="${item.id}" ${!item.exists || item.status !== 'ready' || (isAudio && scene().musicIds.includes(item.id)) ? 'disabled' : ''}>${label}</button><button class="remove" data-asset-action="remove" data-id="${item.id}">移除</button></div></div>`;
  }).join('') : '<div class="empty-state">还没有素材。可以导入 WebM 视频、图片壁纸或音乐。</div>';
}
function renderDisplaySelect() {
  const current = currentDisplay();
  selectedDisplayId = current?.id || null;
  $('#preview-display').innerHTML = displays.map(display => `<option value="${display.id}" ${display.id === selectedDisplayId ? 'selected' : ''}>${escapeHtml(display.name)}${display.primary ? ' · 主屏' : ''}</option>`).join('');
  const stage = $('#stage');
  if (current) stage.style.aspectRatio = `${current.bounds.width} / ${current.bounds.height}`;
}
function renderStage() {
  const current = currentDisplay();
  if (!current) return;
  const background = asset(scene().wallpaper);
  const stage = $('#stage');
  stage.style.backgroundImage = background && background.exists ? `url("${background.url.replace(/"/g, '%22')}")` : '';
  const holder = $('#stage-pets');
  holder.replaceChildren();
  for (const item of scene().pets.filter(item => item.visible && displayForPet(item)?.id === current.id)) {
    const media = asset(item.assetIds[0]);
    if (!media) continue;
    const node = document.createElement('div');
    node.className = `preview-pet ${item.id === selectedPetId ? 'selected' : ''}`;
    node.dataset.id = item.id;
    node.style.left = `${item.x * 100}%`;
    node.style.top = `${item.y * 100}%`;
    node.style.width = `${item.width * 100}%`;
    node.style.opacity = item.opacity;
    const name = document.createElement('span');
    name.className = 'preview-name';
    name.textContent = item.name;
    node.append(name);
    if (media.exists && media.status === 'ready') {
      const video = document.createElement('video');
      video.src = media.url;
      video.autoplay = true;
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      video.playbackRate = item.speed;
      video.addEventListener('error', () => { video.replaceWith(document.createTextNode('视频无法预览')); }, { once: true });
      node.append(video);
      if (playback.paused) video.pause();
    } else {
      const placeholder = document.createElement('div');
      placeholder.textContent = '素材不可用';
      placeholder.style.padding = '22px 8px';
      node.append(placeholder);
    }
    node.addEventListener('pointerdown', beginDrag);
    holder.append(node);
  }
  $('#stage-count').textContent = `${scene().pets.length} 个桌宠`;
  renderRoute();
}
function renderRoute() {
  const holder = $('#route-layer');
  holder.replaceChildren();
  const item = pet();
  holder.classList.toggle('editing', Boolean(routeEditing && item?.motion === 'custom'));
  if (!item || item.motion !== 'custom' || !item.routePoints.length) return;
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  line.setAttribute('viewBox', '0 0 100 100');
  line.setAttribute('preserveAspectRatio', 'none');
  line.classList.add('route-line');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  path.setAttribute('points', [...item.routePoints, item.routePoints[0]].map(p => `${p.x * 100},${p.y * 100}`).join(' '));
  line.append(path); holder.append(line);
  item.routePoints.forEach((point, index) => {
    const dot = document.createElement('button');
    dot.className = 'route-point'; dot.textContent = String(index + 1); dot.title = `路径点 ${index + 1}，拖动调整`;
    dot.style.left = `${point.x * 100}%`; dot.style.top = `${point.y * 100}%`;
    dot.addEventListener('pointerdown', event => {
      event.stopPropagation(); dot.setPointerCapture(event.pointerId);
      dot.onpointermove = move => {
        const bounds = $('#stage').getBoundingClientRect();
        point.x = Math.max(0, Math.min(1, (move.clientX - bounds.left) / bounds.width));
        point.y = Math.max(0, Math.min(1, (move.clientY - bounds.top) / bounds.height));
        dot.style.left = `${point.x * 100}%`; dot.style.top = `${point.y * 100}%`;
        path.setAttribute('points', [...item.routePoints, item.routePoints[0]].map(p => `${p.x * 100},${p.y * 100}`).join(' '));
      };
      dot.onpointerup = async up => { dot.releasePointerCapture(up.pointerId); dot.onpointermove = null; dot.onpointerup = null; await window.deskPets.patchPet(item.id, { routePoints: item.routePoints }); };
    });
    holder.append(dot);
  });
}
function beginDrag(event) {
  if (event.button !== 0) return;
  const node = event.currentTarget;
  const id = node.dataset.id;
  const item = scene().pets.find(candidate => candidate.id === id);
  if (!item) return;
  selectedPetId = id;
  inspectorTab = 'basic';
  routeEditing = false;
  renderInspector();
  renderPetList();
  for (const other of document.querySelectorAll('.preview-pet')) other.classList.toggle('selected', other.dataset.id === id);
  const stageBounds = $('#stage').getBoundingClientRect();
  const startX = event.clientX;
  const startY = event.clientY;
  const initialX = item.x;
  const initialY = item.y;
  node.classList.add('dragging');
  node.setPointerCapture(event.pointerId);
  node.onpointermove = move => {
    if (!node.hasPointerCapture(move.pointerId)) return;
    item.x = Math.min(1 - item.width, Math.max(0, initialX + (move.clientX - startX) / stageBounds.width));
    const maxY = Math.max(0, 1 - node.getBoundingClientRect().height / stageBounds.height);
    item.y = Math.min(maxY, Math.max(0, initialY + (move.clientY - startY) / stageBounds.height));
    node.style.left = `${item.x * 100}%`;
    node.style.top = `${item.y * 100}%`;
  };
  node.onpointerup = async up => {
    node.releasePointerCapture(up.pointerId);
    node.classList.remove('dragging');
    node.onpointermove = null;
    node.onpointerup = null;
    await window.deskPets.patchPet(id, { x: item.x, y: item.y });
  };
}
function renderPetList() {
  $('#pet-list').innerHTML = scene().pets.length ? scene().pets.map(item => `<button class="pet-chip ${item.id === selectedPetId ? 'active' : ''}" data-pet="${item.id}"><span class="tiny-dot"></span>${escapeHtml(item.name)} <span class="chip-layer">${item.layer === 'desktop' ? '桌面' : '悬浮'}</span></button>`).join('') : '<div class="empty-state">场景是空的。从左侧素材库添加一个视频。</div>';
}
function renderInspector() {
  const item = pet();
  const root = $('#inspector-content');
  if (!item) {
    const images = state.assets.filter(asset => asset.kind === 'image' && asset.exists);
    const music = scene().musicIds.map(asset).filter(Boolean);
    root.innerHTML = `<h2>场景设置</h2><p class="sub">壁纸和音乐按场景独立保存。</p><div class="scene-wallpaper"><strong>图片壁纸</strong><div class="hint">默认保留当前系统壁纸；只在主动选择图片时更换。</div><select id="wallpaper-select"><option value="">保持当前壁纸</option>${images.map(image => `<option value="${image.id}" ${scene().wallpaper === image.id ? 'selected' : ''}>${escapeHtml(image.name)}</option>`).join('')}</select></div><div class="scene-music"><strong>场景音乐</strong><p class="hint">按列表顺序循环播放；暂停时音乐也会暂停。</p><div class="music-list">${music.length ? music.map(entry => `<div class="music-row"><span title="${escapeHtml(entry.name)}">♫ ${escapeHtml(entry.name)}</span><button data-music-remove="${entry.id}" aria-label="移除 ${escapeHtml(entry.name)}">移除</button></div>`).join('') : '<div class="empty-state">从左侧素材库添加音乐。</div>'}</div><div class="field"><label for="scene-music-volume">音乐音量</label><input id="scene-music-volume" type="range" min="0" max="100" value="${format(scene().musicVolume)}"><span class="field-value" id="scene-music-volume-value">${format(scene().musicVolume)}%</span></div></div>`;
    return;
  }
  const basic = `<div class="field"><label for="pet-name">名称</label><input id="pet-name" maxlength="80" value="${escapeHtml(item.name)}"></div>
    <div class="field"><span class="group-label">显示层级</span><div class="segment"><button data-layer="desktop" class="${item.layer === 'desktop' ? 'active' : ''}">桌面</button><button data-layer="floating" class="${item.layer === 'floating' ? 'active' : ''}">悬浮</button></div><p class="hint">鼠标穿透，不影响桌面图标与窗口点击。</p></div>
    <div class="field"><label for="pet-monitor">显示器</label><select id="pet-monitor">${displays.map(display => `<option value="${display.id}" ${displayForPet(item)?.id === display.id ? 'selected' : ''}>${escapeHtml(display.name)}${display.primary ? ' · 主屏' : ''}</option>`).join('')}</select></div>
    <div class="field"><label for="pet-width">大小</label><input id="pet-width" type="range" min="5" max="70" value="${format(item.width)}"><span class="field-value" id="pet-width-value">屏幕宽度的 ${format(item.width)}%</span></div>
    <div class="field"><label for="pet-opacity">不透明度</label><input id="pet-opacity" type="range" min="10" max="100" value="${format(item.opacity)}"><span class="field-value" id="pet-opacity-value">${format(item.opacity)}%</span></div>
    <label class="toggle-line"><span>显示这个桌宠</span><input id="pet-visible" type="checkbox" ${item.visible ? 'checked' : ''}></label>`;
  const motion = `<div class="field"><label for="pet-speed">播放速度</label><input id="pet-speed" type="range" min="25" max="300" step="5" value="${format(item.speed)}"><span class="field-value" id="pet-speed-value">${item.speed.toFixed(2)}×</span></div><div class="field"><label for="pet-motion">运动路线</label><select id="pet-motion"><option value="fixed" ${item.motion === 'fixed' ? 'selected' : ''}>固定位置</option><option value="wander" ${item.motion === 'wander' ? 'selected' : ''}>自由漫步</option><option value="horizontal" ${item.motion === 'horizontal' ? 'selected' : ''}>左右往返</option><option value="vertical" ${item.motion === 'vertical' ? 'selected' : ''}>上下浮动</option><option value="orbit" ${item.motion === 'orbit' ? 'selected' : ''}>环绕</option><option value="figure8" ${item.motion === 'figure8' ? 'selected' : ''}>8 字形</option><option value="custom" ${item.motion === 'custom' ? 'selected' : ''}>自定义路径</option></select></div>
    ${item.motion !== 'fixed' ? `<div class="field"><label for="pet-motion-duration">一轮时长</label><input id="pet-motion-duration" type="range" min="4" max="120" value="${item.motionDuration}"><span class="field-value" id="pet-motion-duration-value">${item.motionDuration} 秒</span></div>` : ''}
    ${item.motion === 'custom' ? `<div class="field"><span class="group-label">路径点 · ${item.routePoints.length} 个</span><div class="route-actions"><button id="route-edit" class="secondary">${routeEditing ? '完成编辑' : '在预览中添加点'}</button><button id="route-clear" class="secondary">清空</button></div><p class="hint">点击预览添加点，拖动圆点调整。至少需要 2 个点。</p><div class="route-list">${item.routePoints.map((p, i) => `<div>点 ${i + 1} · ${Math.round(p.x * 100)}%, ${Math.round(p.y * 100)}% <button data-route-remove="${i}">×</button></div>`).join('')}</div></div>` : ''}
    <div class="field"><label for="pet-hover-style">靠近效果</label><select id="pet-hover-style"><option value="none" ${item.hoverStyle === 'none' ? 'selected' : ''}>关闭</option><option value="soft" ${item.hoverStyle === 'soft' ? 'selected' : ''}>轻微浮动与光晕</option><option value="sparkle" ${item.hoverStyle === 'sparkle' ? 'selected' : ''}>浮动与微光粒子</option><option value="magic" ${item.hoverStyle === 'magic' ? 'selected' : ''}>浮动与魔法粒子</option></select></div>`;
  root.innerHTML = `<h2>编辑桌宠</h2><p class="sub">视频默认循环播放，修改后自动保存。</p><div class="inspector-tabs"><button data-inspector-tab="basic" class="${inspectorTab === 'basic' ? 'active' : ''}">外观</button><button data-inspector-tab="motion" class="${inspectorTab === 'motion' ? 'active' : ''}">运动与互动</button></div>${inspectorTab === 'motion' ? motion : basic}<div class="inspector-actions"><button id="remove-pet">移除桌宠</button></div>`;
}
function renderSettings() {
  $('#setting-login').checked = state.settings.launchAtLogin;
  $('#setting-battery').checked = state.settings.pauseOnBattery;
  $('#setting-fullscreen').checked = state.settings.pauseOnFullscreen;
  $('#setting-mute').checked = state.settings.mute;
  const themeIcons = { dark: '☾', light: '☀', system: '◐' };
  const themeNames = { dark: '暗黑', light: '亮色', system: '跟随系统' };
  $('#theme-cycle').textContent = themeIcons[state.settings.theme];
  $('#theme-cycle').title = `外观主题：${themeNames[state.settings.theme]}（点击切换）`;
  document.documentElement.dataset.theme = state.settings.theme === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : state.settings.theme;
  $('#toggle-show').textContent = state.settings.showPets ? '隐藏桌宠' : '显示桌宠';
  $('#toggle-pause').textContent = playback.reasons.includes('manual') ? '继续' : '暂停';
  const pill = $('#status-pill');
  pill.textContent = !scene().pets.length && !scene().musicIds.length ? '未添加素材' : playback.paused ? '已暂停' : !state.settings.showPets && scene().pets.length ? '桌宠已隐藏' : '播放中';
  pill.classList.toggle('paused', playback.paused || !state.settings.showPets);
}
function render() {
  if (!state) return;
  if (!scene().pets.some(item => item.id === selectedPetId)) { selectedPetId = null; routeEditing = false; }
  renderSceneList();
  renderAssetList();
  renderDisplaySelect();
  renderStage();
  renderPetList();
  renderInspector();
  renderSettings();
  if (document.activeElement !== $('#scene-name')) $('#scene-name').value = scene().name;
  $('#delete-scene').disabled = state.scenes.length === 1;
}

$('#add-scene').addEventListener('click', async () => { selectedPetId = null; await window.deskPets.addScene(); });
$('#import-video').addEventListener('click', () => window.deskPets.importMedia('video'));
$('#import-image').addEventListener('click', () => window.deskPets.importMedia('image'));
$('#import-audio').addEventListener('click', () => window.deskPets.importMedia('audio'));
$('#scene-list').addEventListener('click', async event => { const button = event.target.closest('[data-scene]'); if (button) { selectedPetId = null; await window.deskPets.activateScene(button.dataset.scene); } });
$('#asset-list').addEventListener('click', async event => {
  const button = event.target.closest('[data-asset-action]');
  if (!button) return;
  const id = button.dataset.id;
  if (button.dataset.assetAction === 'add') { selectedPetId = await window.deskPets.addPet(id, selectedDisplayId); render(); }
  if (button.dataset.assetAction === 'wallpaper') await window.deskPets.setSceneWallpaper(id);
  if (button.dataset.assetAction === 'music') { await window.deskPets.addSceneMusic(id); selectedPetId = null; render(); }
  if (button.dataset.assetAction === 'remove') await window.deskPets.removeAsset(id);
});
$('#pet-list').addEventListener('click', event => { const button = event.target.closest('[data-pet]'); if (button) { selectedPetId = button.dataset.pet; inspectorTab = 'basic'; routeEditing = false; render(); } });
$('#preview-display').addEventListener('change', event => { selectedDisplayId = event.target.value; renderStage(); });
$('#stage').addEventListener('click', async event => {
  const item = pet();
  if (!routeEditing || item?.motion !== 'custom' || event.target.closest('.preview-pet, .route-point')) return;
  const bounds = $('#stage').getBoundingClientRect();
  const point = { x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)), y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)) };
  await window.deskPets.patchPet(item.id, { routePoints: [...item.routePoints, point] });
});
$('#scene-name').addEventListener('change', event => window.deskPets.renameScene(scene().id, event.target.value));
$('#delete-scene').addEventListener('click', () => { if (state.scenes.length > 1 && confirm(`删除场景“${scene().name}”？`)) window.deskPets.deleteScene(scene().id); });
$('#toggle-pause').addEventListener('click', () => window.deskPets.pause(!playback.reasons.includes('manual')));
$('#toggle-show').addEventListener('click', () => window.deskPets.updateSettings({ showPets: !state.settings.showPets }));
$('#show-scene-settings').addEventListener('click', () => { selectedPetId = null; routeEditing = false; render(); });
$('#theme-cycle').addEventListener('click', () => {
  const themes = ['dark', 'light', 'system'];
  window.deskPets.updateSettings({ theme: themes[(themes.indexOf(state.settings.theme) + 1) % themes.length] });
});
$('#open-settings').addEventListener('click', () => { $('#settings-backdrop').hidden = false; $('#close-settings').focus(); });
$('#close-settings').addEventListener('click', () => { $('#settings-backdrop').hidden = true; $('#open-settings').focus(); });
$('#settings-backdrop').addEventListener('click', event => { if (event.target.id === 'settings-backdrop') $('#close-settings').click(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('#settings-backdrop').hidden) $('#close-settings').click(); });
for (const [id, key] of [['setting-login', 'launchAtLogin'], ['setting-battery', 'pauseOnBattery'], ['setting-fullscreen', 'pauseOnFullscreen'], ['setting-mute', 'mute']]) {
  $(`#${id}`).addEventListener('change', event => window.deskPets.updateSettings({ [key]: event.target.checked }));
}
window.deskPets.onTheme(theme => { document.documentElement.dataset.theme = theme; });
$('#inspector-content').addEventListener('click', async event => {
  const tab = event.target.closest('[data-inspector-tab]');
  if (tab) { inspectorTab = tab.dataset.inspectorTab; if (inspectorTab !== 'motion') routeEditing = false; renderInspector(); renderRoute(); return; }
  const layer = event.target.closest('[data-layer]');
  if (layer && pet()) await window.deskPets.patchPet(selectedPetId, { layer: layer.dataset.layer });
  if (event.target.id === 'remove-pet' && pet()) { await window.deskPets.removePet(selectedPetId); selectedPetId = null; render(); }
  if (event.target.id === 'route-edit') { routeEditing = !routeEditing; renderInspector(); renderRoute(); }
  if (event.target.id === 'route-clear' && pet()) await window.deskPets.patchPet(selectedPetId, { routePoints: [] });
  const musicRemove = event.target.closest('[data-music-remove]');
  if (musicRemove) await window.deskPets.removeSceneMusic(musicRemove.dataset.musicRemove);
  const routeRemove = event.target.closest('[data-route-remove]');
  if (routeRemove && pet()) await window.deskPets.patchPet(selectedPetId, { routePoints: pet().routePoints.filter((_, index) => index !== Number(routeRemove.dataset.routeRemove)) });
});
$('#inspector-content').addEventListener('input', event => {
  if (event.target.id === 'pet-width') $('#pet-width-value').textContent = `屏幕宽度的 ${event.target.value}%`;
  if (event.target.id === 'pet-speed') $('#pet-speed-value').textContent = `${(Number(event.target.value) / 100).toFixed(2)}×`;
  if (event.target.id === 'pet-opacity') $('#pet-opacity-value').textContent = `${event.target.value}%`;
  if (event.target.id === 'pet-motion-duration') $('#pet-motion-duration-value').textContent = `${event.target.value} 秒`;
  if (event.target.id === 'scene-music-volume') $('#scene-music-volume-value').textContent = `${event.target.value}%`;
});
$('#inspector-content').addEventListener('change', async event => {
  const target = event.target;
  if (target.id === 'wallpaper-select') return window.deskPets.setSceneWallpaper(target.value || null);
  if (target.id === 'scene-music-volume') return window.deskPets.setSceneMusicVolume(Number(target.value) / 100);
  if (!pet()) return;
  if (target.id === 'pet-name') return window.deskPets.patchPet(selectedPetId, { name: target.value });
  if (target.id === 'pet-monitor') return window.deskPets.patchPet(selectedPetId, { monitorId: target.value });
  if (target.id === 'pet-width') return window.deskPets.patchPet(selectedPetId, { width: Number(target.value) / 100 });
  if (target.id === 'pet-speed') return window.deskPets.patchPet(selectedPetId, { speed: Number(target.value) / 100 });
  if (target.id === 'pet-opacity') return window.deskPets.patchPet(selectedPetId, { opacity: Number(target.value) / 100 });
  if (target.id === 'pet-visible') return window.deskPets.patchPet(selectedPetId, { visible: target.checked });
  if (target.id === 'pet-motion') { routeEditing = false; return window.deskPets.patchPet(selectedPetId, { motion: target.value }); }
  if (target.id === 'pet-motion-duration') return window.deskPets.patchPet(selectedPetId, { motionDuration: Number(target.value) });
  if (target.id === 'pet-hover-style') return window.deskPets.patchPet(selectedPetId, { hoverStyle: target.value });
});

window.deskPets.onState(next => { state = next; render(); });
window.deskPets.onDisplays(next => { displays = next; render(); });
window.deskPets.onPlayback(next => { playback = next; if (state) { renderSettings(); for (const video of document.querySelectorAll('.preview-pet video')) next.paused ? video.pause() : video.play().catch(() => {}); } });
window.deskPets.onNotice(item => showNotice(item.message, item.type));
Promise.all([window.deskPets.getState(), window.deskPets.getDisplays()]).then(([next, nextDisplays]) => { state = next; displays = nextDisplays; render(); });
