// 時間軸:單一 canvas 自繪。軌序 = 尺標/膠卷/Keyframes/Acc/ω/Torque/Jerk
import { state, set, on } from './store.js';
import { seek, video } from './video.js';

const ROWS = [['', 20], ['film', 34], ['Keyframes', 44], ['Acc', 46], ['ω', 40], ['Torque', 36], ['Jerk', 36]];
const COLORS = { FINE2: '#E5484D', FINE1: '#E5484D', FINE0: '#E8A33D', CONT: '#3D6BFF', plain: '#8E8E8E' };
const cv = document.getElementById('tlCanvas');
const lanesEl = document.getElementById('lanes');
const ctx = cv.getContext('2d');
let ofs = {}, H = 0, thumbs = [];   // thumbs: {t, bmp}

export function initTimeline() {
  document.getElementById('laneHead').innerHTML =
    ROWS.map(r => `<div style="height:${r[1]}px">${r[0] === 'film' ? '' : r[0]}</div>`).join('');
  let y = 0; for (const [n, h] of ROWS) { ofs[n || 'ruler'] = [y, h]; y += h; } H = y;

  const zoomEl = document.getElementById('zoomSlider');
  zoomEl.addEventListener('input', () => setZoom(zoomEl.value / 100));
  lanesEl.addEventListener('wheel', e => {
    if (!state.duration) return;
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) setZoom(state.zoom * (e.deltaY < 0 ? 1.15 : 0.87), pxToT(e.offsetX));
    else set({ pan: clampPan(state.pan + e.deltaY * viewSpan() / 800) });
  }, { passive: false });

  let dragging = false;
  lanesEl.addEventListener('pointerdown', e => { dragging = true; seek(pxToT(e.offsetX)); });
  lanesEl.addEventListener('pointermove', e => { if (dragging) seek(pxToT(e.offsetX)); });
  addEventListener('pointerup', () => dragging = false);

  on('change', draw);
  new ResizeObserver(() => { fitCanvas(); draw(); }).observe(lanesEl);
  fitCanvas(); draw();
  on('change', p => { if ('files' in p && state.files.video) captureThumbs(); });
}
function fitCanvas() {
  const dpr = devicePixelRatio || 1;
  cv.width = lanesEl.clientWidth * dpr; cv.height = H * dpr;
  cv.style.width = lanesEl.clientWidth + 'px'; cv.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
const viewSpan = () => (state.duration || 1) / state.zoom;
const clampPan = p => Math.min(Math.max(p, 0), Math.max((state.duration || 0) - viewSpan(), 0));
const tToPx = t => (t - state.pan) / viewSpan() * lanesEl.clientWidth;
const pxToT = x => state.pan + x / lanesEl.clientWidth * viewSpan();
function setZoom(z, anchorT = state.time) {
  z = Math.min(Math.max(z, 1), 8);
  const frac = (anchorT - state.pan) / viewSpan();
  const span = (state.duration || 1) / z;
  set({ zoom: z, pan: clampPan(anchorT - frac * span) });
  document.getElementById('zoomSlider').value = z * 100;
}

async function captureThumbs() {
  // 影片縮圖膠卷:離線 seek 抽 24 格(不干擾主播放器 —— 用複本)
  thumbs = [];
  const v = document.createElement('video');
  v.src = video.src; v.muted = true;
  await new Promise(r => v.addEventListener('loadedmetadata', r, { once: true }));
  const n = 24, [ , fh ] = ofs['film'];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n * v.duration;
    v.currentTime = t;
    await new Promise(r => v.addEventListener('seeked', r, { once: true }));
    const w = Math.round(fh * v.videoWidth / v.videoHeight);
    const c = new OffscreenCanvas(w, fh - 4);
    c.getContext('2d').drawImage(v, 0, 0, w, fh - 4);
    thumbs.push({ t, bmp: c.transferToImageBitmap() });
    draw();
  }
}

export function draw() {
  const W = lanesEl.clientWidth;
  ctx.clearRect(0, 0, W, H);
  // 直欄格線 + 尺標(刻度隨縮放選擇 1/2/5/10s)
  const span = viewSpan();
  const step = span > 60 ? 10 : span > 25 ? 5 : span > 10 ? 2 : 1;
  ctx.font = '10px Helvetica'; ctx.fillStyle = '#8E8E8E';
  for (let t = Math.ceil(state.pan / step) * step; t <= state.pan + span; t += step) {
    const x = tToPx(t);
    ctx.strokeStyle = '#555'; line(x, 12, x, 20);
    ctx.strokeStyle = '#191919'; line(x, 20, x, H);
    ctx.fillText(t + 's', x + 4, 13);
  }
  for (const k in ofs) { const yy = ofs[k][0] + ofs[k][1]; ctx.strokeStyle = '#222'; line(0, yy, W, yy); }
  // 膠卷
  const [fy, fh] = ofs['film'];
  ctx.fillStyle = '#161616'; ctx.fillRect(0, fy + 2, W, fh - 4);
  for (const th of thumbs) {
    const x = tToPx(th.t) - th.bmp.width / 2;
    if (x + th.bmp.width > 0 && x < W) ctx.drawImage(th.bmp, x, fy + 2);
  }
  // 指標曲線
  if (state.metrics) {
    plot('ω', state.metrics.omega, '#7A96FF');
    plot('Torque', state.metrics.torque, '#E8A33D');
    plot('Jerk', state.metrics.jerk, '#F07178');
  }
  // Keyframes + Acc
  const tex = indexTexture();
  if (state.keyframes) {
    const [ky0, kh] = ofs['Keyframes'], ky = ky0 + kh / 2;
    const [ay, ah] = ofs['Acc'];
    const ks = state.keyframes;
    for (let i = 0; i < ks.length; i++) {
      const t = ks[i].time, x = tToPx(t);
      const info = tex?.get(round3(t));
      const col = info ? COLORS[info.smooth] || COLORS.plain : COLORS.plain;
      if (x > -20 && x < W + 20) {
        if (info?.sat) { ctx.strokeStyle = '#E5484D'; ctx.lineWidth = 1.5; ctx.strokeRect(x - 8, ky0 + 2, 16, kh - 4); }
        ctx.strokeStyle = col; ctx.lineWidth = 2; line(x, ky0 + 4, x, ky0 + kh - 4);
        ctx.save(); ctx.translate(x, ky); ctx.rotate(Math.PI / 4);
        ctx.fillStyle = col; ctx.fillRect(-4.5, -4.5, 9, 9); ctx.restore();
      }
      if (info && i < ks.length - 1) {
        const x1 = tToPx(ks[i + 1].time);
        const hh = (info.acc || 0) / 100 * (ah - 10);
        ctx.fillStyle = col;
        if (x1 > 0 && x < W) ctx.fillRect(x + 1.5, ay + ah - 4 - hh, Math.max(x1 - x - 3, 2), hh);
      }
    }
  }
  // 播放頭
  const px = tToPx(state.time);
  ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 2; line(px, 0, px, H);
  document.getElementById('rangeLabel').textContent =
    state.duration ? `${state.pan.toFixed(1)}s — ${(state.pan + span).toFixed(1)}s` : '—';
}
function plot(lane, ys, color) {
  const [y0, h] = ofs[lane], ts = state.metrics.t, W = lanesEl.clientWidth;
  let max = 0; for (const v of ys) if (v > max) max = v;
  ctx.strokeStyle = color; ctx.lineWidth = 1.4; ctx.beginPath();
  let started = false;
  for (let i = 0; i < ts.length; i++) {
    const x = tToPx(ts[i]);
    if (x < -2 || x > W + 2) { started = false; continue; }
    const y = y0 + h - 3 - (ys[i] / (max || 1)) * (h - 8);
    started ? ctx.lineTo(x, y) : (ctx.moveTo(x, y), started = true);
  }
  ctx.stroke();
}
function indexTexture() {
  if (!state.texture) return null;
  const m = new Map();
  for (const p of state.texture.timeline) if (p.role !== 'wait') m.set(round3(p.t), p);
  return m;
}
const round3 = t => Math.round(t * 1000) / 1000;
function line(a, b, c, d) { ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke(); }
