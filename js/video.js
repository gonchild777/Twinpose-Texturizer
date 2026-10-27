import { state, set } from './store.js';
const video = document.getElementById('video');
const ph = document.getElementById('videoPh');
const box = document.getElementById('videobox');
const vtime = document.getElementById('vtime');
const playBtn = document.getElementById('playBtn');

export function loadVideoFile(f) {
  video.src = URL.createObjectURL(f);
  video.style.display = ''; ph.style.display = 'none';
  video.addEventListener('loadedmetadata', () => {
    set({ duration: Math.max(state.duration, video.duration), files: { ...state.files, video: f } });
  }, { once: true });
}
export function seek(t) {
  t = Math.min(Math.max(t, 0), state.duration || 0);
  if (Math.abs(video.currentTime - t) > 0.001) video.currentTime = t;
  set({ time: t });
}
export function initVideo() {
  video.addEventListener('timeupdate', () => set({ time: video.currentTime }));
  // 播放中用 rAF 提高播放頭更新率
  let raf;
  const tick = () => { if (!video.paused) { set({ time: video.currentTime }); raf = requestAnimationFrame(tick); } };
  video.addEventListener('play', () => { playBtn.textContent = 'Pause'; tick(); });
  video.addEventListener('pause', () => { playBtn.textContent = 'Play'; cancelAnimationFrame(raf); });
  playBtn.onclick = () => video.paused ? video.play() : video.pause();
  video.onclick = () => playBtn.onclick();

  const fr = 1 / state.fps;
  document.getElementById('prevKf').onclick = () => jumpKf(-1);
  document.getElementById('nextKf').onclick = () => jumpKf(1);
  addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Space') { e.preventDefault(); playBtn.onclick(); }
    if (e.key === 'ArrowLeft') seek(state.time - fr);
    if (e.key === 'ArrowRight') seek(state.time + fr);
    if (e.key === '[') jumpKf(-1);
    if (e.key === ']') jumpKf(1);
  });
  // 拖放載入
  box.addEventListener('dragover', e => { e.preventDefault(); box.classList.add('drag'); });
  box.addEventListener('dragleave', () => box.classList.remove('drag'));
  box.addEventListener('drop', e => {
    e.preventDefault(); box.classList.remove('drag');
    const f = e.dataTransfer.files[0]; if (f && f.type.startsWith('video')) { loadVideoFile(f); import('./files.js').then(m => m.mark('Video', f.name)); }
  });
  ph.onclick = () => document.getElementById('fVideo').click();
  setInterval(() => {
    const f = t => `${Math.floor(t/60)}:${(t%60).toFixed(2).padStart(5,'0')}`;
    vtime.textContent = state.duration ? `${f(state.time)} / ${f(state.duration)} · frame ${Math.round(state.time*state.fps)}` : '';
  }, 60);
}
function jumpKf(dir) {
  const ks = state.keyframes; if (!ks?.length) return;
  const t = state.time + (dir > 0 ? 0.001 : -0.001);
  const next = dir > 0 ? ks.find(k => k.time > t) : [...ks].reverse().find(k => k.time < t);
  if (next) seek(next.time);
}
export { video };
