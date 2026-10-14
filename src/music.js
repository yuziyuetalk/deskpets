const player = document.getElementById('player');
let state;
let playback = { paused: false };
let tracks = [];
let signature = '';
let index = 0;
let failed = new Set();

function loadCurrent() {
  if (!tracks.length || failed.size >= tracks.length) {
    player.pause();
    player.removeAttribute('src');
    player.load();
    return;
  }
  player.src = tracks[index].url;
  player.loop = tracks.length === 1;
  if (!playback.paused) player.play().catch(error => console.error('Music playback:', error));
}

function nextTrack() {
  if (!tracks.length) return;
  index = (index + 1) % tracks.length;
  loadCurrent();
}

player.addEventListener('ended', nextTrack);
player.addEventListener('error', () => {
  if (!tracks.length || !player.src) return;
  console.error(`Music file cannot be played: ${tracks[index].name}`);
  failed.add(tracks[index].id);
  if (failed.size >= tracks.length) loadCurrent();
  else {
    do { index = (index + 1) % tracks.length; } while (failed.has(tracks[index].id));
    loadCurrent();
  }
});

function render() {
  if (!state) return;
  const scene = state.scenes.find(item => item.id === state.activeSceneId);
  const assets = new Map(state.assets.filter(item => item.kind === 'audio' && item.exists && item.status === 'ready').map(item => [item.id, item]));
  tracks = (scene?.musicIds || []).map(id => assets.get(id)).filter(Boolean);
  player.volume = scene?.musicVolume ?? 0.7;
  const nextSignature = `${scene?.id}|${tracks.map(item => item.id).join('|')}`;
  if (nextSignature !== signature) {
    signature = nextSignature;
    index = 0;
    failed = new Set();
    loadCurrent();
  } else if (playback.paused) player.pause();
  else if (tracks.length && player.paused) player.play().catch(error => console.error('Music playback:', error));
}

window.deskPets.onState(next => { state = next; render(); });
window.deskPets.onPlayback(next => { playback = next; render(); });
window.deskPets.getState().then(next => { state = next; render(); });
