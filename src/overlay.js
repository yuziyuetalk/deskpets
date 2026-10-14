const query = new URLSearchParams(location.search);
const displayId = query.get('display'), layer = query.get('layer');
const root = document.getElementById('pets');
let state, displays = [], playback = { paused: false }, cursor = { x: -1e5, y: -1e5 };
const items = new Map();
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const asset = id => state.assets.find(a => a.id === id && a.kind === 'video' && a.exists && a.status === 'ready');
const displayFor = pet => displays.find(d => d.id === pet.monitorId) || displays.find(d => d.primary) || displays[0];

function createPet(pet) {
  const box = document.createElement('div');
  box.className = 'pet';
  const video = document.createElement('video');
  video.autoplay = true; video.playsInline = true; video.preload = 'auto'; video.disablePictureInPicture = true;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { alpha: true });
  const particles = document.createElement('div');
  particles.className = 'particles';
  box.append(video, canvas, particles); root.append(box);
  const r = { box, video, canvas, context, particles, pet, signature: '', started: performance.now(), wanderFrom: { x: 0, y: 0 }, wanderTo: { x: 0, y: 0 }, hovered: false, lastParticle: 0 };
  const drawFrame = () => {
    if (!box.isConnected) return;
    if (video.videoWidth && video.videoHeight) {
      const targetWidth = Math.min(video.videoWidth, Math.max(64, Math.ceil(box.clientWidth * devicePixelRatio)));
      const targetHeight = Math.max(1, Math.round(targetWidth * video.videoHeight / video.videoWidth));
      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth; canvas.height = targetHeight;
      }
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
    }
    if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(drawFrame);
  };
  if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(drawFrame);
  else r.drawTimer = setInterval(drawFrame, 33);
  video.addEventListener('error', () => { box.style.display = 'none'; });
  items.set(pet.id, r);
  return r;
}
function updatePet(r, pet) {
  r.pet = pet;
  const playable = asset(pet.assetIds[0]);
  r.box.style.display = playable ? '' : 'none';
  if (!playable) return;
  r.box.style.left = `${pet.x * 100}%`;
  r.box.style.top = `${pet.y * 100}%`;
  r.box.style.width = `${pet.width * 100}%`;
  r.box.style.opacity = String(pet.opacity);
  r.video.playbackRate = pet.speed;
  r.video.muted = state.settings.mute;
  r.video.loop = true;
  const signature = playable.url;
  if (signature !== r.signature) { r.signature = signature; r.video.src = playable.url; }
  if (playback.paused || !state.settings.showPets) r.video.pause();
  else if (r.video.paused) r.video.play().catch(() => {});
}
function render() {
  if (!state || !displays.length) return;
  const scene = state.scenes.find(s => s.id === state.activeSceneId);
  if (!scene) return;
  const visible = new Set();
  for (const pet of scene.pets) {
    if (!pet.visible || pet.layer !== layer || displayFor(pet)?.id !== displayId || !pet.assetIds.some(asset)) continue;
    visible.add(pet.id);
    updatePet(items.get(pet.id) || createPet(pet), pet);
  }
  for (const [id, r] of items) if (!visible.has(id)) {
    r.video.pause(); r.video.removeAttribute('src'); r.video.load(); r.box.remove(); if (r.drawTimer) clearInterval(r.drawTimer); items.delete(id);
  }
}
function route(r, elapsed) {
  const pet = r.pet, phase = (elapsed / (pet.motionDuration * 1000)) % 1, theta = phase * Math.PI * 2;
  switch (pet.motion) {
    case 'horizontal': return { x: Math.sin(theta) * .12, y: 0 };
    case 'vertical': return { x: 0, y: Math.sin(theta) * .1 };
    case 'orbit': return { x: (Math.cos(theta) - 1) * .09, y: Math.sin(theta) * .08 };
    case 'figure8': return { x: Math.sin(theta) * .14, y: Math.sin(theta * 2) * .07 };
    case 'custom': {
      if (pet.routePoints.length < 2) break;
      const segment = phase * pet.routePoints.length, index = Math.floor(segment);
      const a = pet.routePoints[index], b = pet.routePoints[(index + 1) % pet.routePoints.length];
      const f = segment % 1, smooth = f * f * (3 - 2 * f);
      return { x: a.x + (b.x - a.x) * smooth - pet.x, y: a.y + (b.y - a.y) * smooth - pet.y };
    }
    case 'wander': {
      const cycle = Math.floor(elapsed / (pet.motionDuration * 1000));
      if (r.wanderCycle !== cycle) {
        r.wanderCycle = cycle; r.wanderFrom = r.wanderTo;
        r.wanderTo = { x: (Math.random() - .5) * .2, y: (Math.random() - .5) * .14 };
      }
      const f = phase * phase * (3 - 2 * phase);
      return { x: r.wanderFrom.x + (r.wanderTo.x - r.wanderFrom.x) * f, y: r.wanderFrom.y + (r.wanderTo.y - r.wanderFrom.y) * f };
    }
  }
  return { x: 0, y: 0 };
}
function particles(r, count) {
  if (!['sparkle', 'magic'].includes(r.pet.hoverStyle)) return;
  while (r.particles.childElementCount > 28) r.particles.firstChild.remove();
  for (let i = 0; i < count; i++) {
    const dot = document.createElement('i');
    dot.className = `particle ${r.pet.hoverStyle}`;
    dot.style.left = `${15 + Math.random() * 70}%`;
    dot.style.top = `${15 + Math.random() * 65}%`;
    dot.style.setProperty('--dx', `${(Math.random() - .5) * 95}px`);
    dot.style.setProperty('--dy', `${-35 - Math.random() * 75}px`);
    dot.style.setProperty('--delay', `${Math.random() * .2}s`);
    r.particles.append(dot);
    dot.addEventListener('animationend', () => dot.remove(), { once: true });
  }
}
let lastFrame = 0;
function tick(now) {
  requestAnimationFrame(tick);
  if (now - lastFrame < 32 || !state || playback.paused || !state.settings.showPets) return;
  lastFrame = now;
  const display = displays.find(d => d.id === displayId);
  if (!display) return;
  const localX = cursor.x - display.bounds.x, localY = cursor.y - display.bounds.y;
  for (const r of items.values()) {
    const pet = r.pet, offset = route(r, now - r.started);
    const x = clamp(pet.x + offset.x, 0, Math.max(0, 1 - pet.width));
    const y = clamp(pet.y + offset.y, 0, Math.max(0, 1 - r.box.offsetHeight / innerHeight));
    r.box.style.transform = pet.motion === 'fixed' ? '' : `translate(${(x - pet.x) * innerWidth}px,${(y - pet.y) * innerHeight}px)`;
    const bounds = r.box.getBoundingClientRect();
    const dx = Math.max(bounds.left - localX, 0, localX - bounds.right);
    const dy = Math.max(bounds.top - localY, 0, localY - bounds.bottom);
    const near = pet.hoverStyle !== 'none' && Math.hypot(dx, dy) < 90;
    if (near !== r.hovered) {
      r.hovered = near; r.box.classList.toggle('hovered', near);
      if (near) particles(r, pet.hoverStyle === 'magic' ? 12 : 7);
    }
    if (near && now - r.lastParticle > (pet.hoverStyle === 'magic' ? 160 : 280)) {
      r.lastParticle = now; particles(r, 2);
    }
  }
}
window.deskPets.onState(next => { state = next; render(); });
window.deskPets.onDisplays(next => { displays = next; render(); });
window.deskPets.onPlayback(next => { playback = next; render(); });
window.deskPets.onCursor(point => { cursor = point; });
Promise.all([window.deskPets.getState(), window.deskPets.getDisplays()]).then(([s, d]) => { state = s; displays = d; render(); requestAnimationFrame(tick); });
