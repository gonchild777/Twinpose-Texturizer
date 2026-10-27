// 檔案載入與解析。原則:引擎判定(valley/texture/budget)一律走 Pyodide;
// 這裡的解析只做「顯示」—— 曲線繪圖與關鍵幀上軌。
import { state, set } from './store.js';

// SmoothedMetrics CSV → 顯示用序列(對映與 adapt_metrics.py 相同,見 docs/FINE_CONT_邏輯.md)
export function parseMetricsCsv(text, fps = 30) {
  const lines = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  const head = lines[0].split(',');
  const col = n => head.indexOf(n);
  const iL = col('LeftAngularIntensity'), iR = col('RightAngularIntensity');
  const iT = col('TransitionTorque'), iJ = col('Jerk'), iF = col('frameIndex');
  if (iL < 0 || iT < 0) throw new Error('欄位不符:需要 SmoothedMetrics 格式');
  const t = [], omega = [], torque = [], jerk = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(',');
    if (c.length < head.length) continue;
    t.push((iF >= 0 ? +c[iF] : i - 1) / fps);
    omega.push((+c[iL]) + (+c[iR]));
    torque.push(+c[iT]);
    jerk.push(iJ >= 0 ? +c[iJ] : 0);
  }
  return { t, omega, torque, jerk };
}

// TwinPose 動作檔:.json(有絕對 time)或 .hrb(以 TIME 累加重建 —— 僅供顯示)
export function parseMotion(name, text) {
  if (name.endsWith('.json')) {
    const doc = JSON.parse(text);
    return (doc.jointsData || [])
      .filter(k => k.group !== 'wait')
      .map(k => ({ time: +k.time, angles: k.angles }));
  }
  const kfs = []; let t = 0, pend = null;
  for (const line of text.split(/\r?\n/)) {
    const ax = line.match(/^E6AXIS P\d+=\{(.+)\}/);
    if (ax) {
      const angles = {};
      for (const p of ax[1].split(',')) { const [k, v] = p.trim().split(/\s+/); angles['J' + k.slice(1)] = +v; }
      pend = angles; continue;
    }
    const tm = line.match(/^PTP_TIME .*TIME=(\d+)/);
    if (tm && pend) { t += +tm[1] / 1000; kfs.push({ time: +t.toFixed(3), angles: pend }); pend = null; }
    else if (/^PTP /.test(line) && pend) { kfs.push({ time: 0, angles: pend }); pend = null; }
  }
  return kfs;
}

export function wireFileInputs(onVideo) {
  const bind = (id, fn) => document.getElementById(id).addEventListener('change', e => {
    const f = e.target.files[0]; if (f) fn(f);
  });
  bind('fVideo', onVideo);
  bind('fMotion', async f => {
    const text = await f.text();
    const kfs = parseMotion(f.name, text);
    const doc = f.name.endsWith('.json') ? JSON.parse(text) : null;
    set({ keyframes: kfs, texture: null, motionDoc: doc, accOverrides: {}, undo: [], redo: [],
          motionExt: f.name.endsWith('.json') ? '.json' : '.hrb',
          duration: Math.max(state.duration, kfs.at(-1)?.time || 0),
          files: { ...state.files, motion: f } });
    mark('Motion', f.name);
  });
  bind('fMetrics', async f => {
    const m = parseMetricsCsv(await f.text(), state.fps);
    set({ metrics: m, duration: Math.max(state.duration, m.t.at(-1) || 0),
          files: { ...state.files, metrics: f } });
    mark('Metrics', f.name);
  });
}
export function mark(kind, name) {
  document.getElementById('n' + kind).textContent = name;
  document.getElementById('n' + kind).classList.add('loaded');
  document.getElementById('ok' + kind).classList.add('show');
}
