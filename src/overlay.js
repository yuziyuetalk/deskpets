const query = new URLSearchParams(location.search);
const displayId = query.get('display'), layer = query.get('layer');
const petLayer = layer === 'fullscreen-desktop' ? 'desktop' : layer;
const root = document.getElementById('pets');
let state, displays = [], playback = { paused: false }, cursor = { x: -1e5, y: -1e5 };
const items = new Map();
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const SKIP_FRAMES = 1;
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
  const r = { box, video, canvas, context, particles, pet, signature: '', started: performance.now(), wanderFrom: { x: pet.x, y: pet.y }, wanderTo: { x: pet.x, y: pet.y }, followX: pet.x, followY: pet.y, hovered: false, lastParticle: 0, frameCount: 0 };
  const paintFrame = () => {
    if (video.videoWidth && video.videoHeight) {
      const targetWidth = Math.min(video.videoWidth, Math.max(64, Math.ceil(box.clientWidth * devicePixelRatio)));
      const targetHeight = Math.max(1, Math.round(targetWidth * video.videoHeight / video.videoWidth));
      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth; canvas.height = targetHeight;
      }
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
    }
  };
  const drawFrame = () => {
    if (!box.isConnected) return;
    r.frameCount++;
    if (r.frameCount > SKIP_FRAMES) paintFrame();
    if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(drawFrame);
  };
  video.addEventListener('ended', () => {
    r.frameCount = 0;
    video.currentTime = 0;
    if (!playback.paused && state.settings.showPets) video.play().catch(() => {});
  });
  if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(drawFrame);
  else r.drawTimer = setInterval(drawFrame, 33);
  video.addEventListener('error', () => { box.style.display = 'none'; });
  items.set(pet.id, r);
  return r;
}
function updatePet(r, pet) {
  if (r.pet.motion !== pet.motion || r.pet.x !== pet.x || r.pet.y !== pet.y) {
    r.wanderCycle = undefined;
    r.wanderFrom = { x: pet.x, y: pet.y };
    r.wanderTo = { x: pet.x, y: pet.y };
    r.followX = pet.x;
    r.followY = pet.y;
    r.followAt = undefined;
    r.started = performance.now();
  }
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
  r.video.loop = false;
  const signature = playable.url;
  if (signature !== r.signature) { r.signature = signature; r.frameCount = 0; r.video.src = playable.url; }
  if (playback.paused || !state.settings.showPets) r.video.pause();
  else if (r.video.paused) r.video.play().catch(() => {});
}
function render() {
  if (!state || !displays.length) return;
  const scene = state.scenes.find(s => s.id === state.activeSceneId);
  if (!scene) return;
  const visible = new Set();
  for (const pet of scene.pets) {
    if (!pet.visible || pet.layer !== petLayer || displayFor(pet)?.id !== displayId || !pet.assetIds.some(asset)) continue;
    visible.add(pet.id);
    updatePet(items.get(pet.id) || createPet(pet), pet);
  }
  for (const [id, r] of items) if (!visible.has(id)) {
    r.video.pause(); r.video.removeAttribute('src'); r.video.load(); r.box.remove(); if (r.drawTimer) clearInterval(r.drawTimer); items.delete(id);
  }
}
function route(r, elapsed, localX, localY) {
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
        r.wanderFrom = r.wanderTo;
        r.wanderTo = { x: Math.random() * Math.max(0, 1 - pet.width), y: Math.random() * Math.max(0, 1 - r.box.offsetHeight / innerHeight) };
        r.wanderCycle = cycle;
      }
      const f = phase * phase * (3 - 2 * phase);
      return { x: r.wanderFrom.x + (r.wanderTo.x - r.wanderFrom.x) * f - pet.x, y: r.wanderFrom.y + (r.wanderTo.y - r.wanderFrom.y) * f - pet.y };
    }
    case 'follow': {
      if (localX < 0 || localX > innerWidth || localY < 0 || localY > innerHeight) return { x: r.followX - pet.x, y: r.followY - pet.y };
      const width = pet.width * innerWidth, height = r.box.offsetHeight;
      const maxX = Math.max(0, innerWidth - width), maxY = Math.max(0, innerHeight - height);
      const currentX = clamp(r.followX * innerWidth, 0, maxX), currentY = clamp(r.followY * innerHeight, 0, maxY);
      const angle = Math.atan2(currentY + height / 2 - localY, currentX + width / 2 - localX);
      const radius = Math.hypot(width, height) / 2 + 80;
      let goalX = currentX, goalY = currentY, bestDistance = Infinity, bestClearance = -1;
      for (let index = 0; index < 16; index++) {
        const direction = angle + index * Math.PI / 8;
        const x = clamp(localX + Math.cos(direction) * radius - width / 2, 0, maxX);
        const y = clamp(localY + Math.sin(direction) * radius - height / 2, 0, maxY);
        const clearance = Math.hypot(Math.max(x - localX, 0, localX - x - width), Math.max(y - localY, 0, localY - y - height));
        const distance = Math.hypot(x - currentX, y - currentY);
        if ((clearance >= 70 && (bestClearance < 70 || distance < bestDistance)) || (bestClearance < 70 && clearance > bestClearance)) {
          goalX = x; goalY = y; bestDistance = distance; bestClearance = clearance;
        }
      }
      const delta = Math.min(0.1, Math.max(0, (elapsed - (r.followAt ?? elapsed)) / 1000));
      r.followAt = elapsed;
      const distance = Math.hypot(goalX - currentX, goalY - currentY);
      const step = Math.min(distance, 24 * delta, distance * (1 - Math.exp(-delta / 4)));
      r.followX = (currentX + (distance ? (goalX - currentX) / distance * step : 0)) / innerWidth;
      r.followY = (currentY + (distance ? (goalY - currentY) / distance * step : 0)) / innerHeight;
      return { x: r.followX - pet.x, y: r.followY - pet.y };
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
    const pet = r.pet, offset = route(r, now - r.started, localX, localY);
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
