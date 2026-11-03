// Time Fix:TwinPose 直出 .hrb → 只調 TIME,對準影片排程。
// 判定全在引擎(core/timefix.py);這裡只管 UI、實測紀錄與版本。
import { state, set } from './store.js';
import { timeFix, engineReady } from './bridge.js';
import { seek } from './video.js';
import { editedMotionText, keyframesEdited } from './files.js';

const $ = id => document.getElementById(id);
const histKey = () => 'tf_hist2::' + (state.files.motion?.name || '');   // v2 紀錄格式:trim_s

export function initTimefix() {
  setInterval(() => {
    const ok = !!state.files.motion && engineReady();
    $('tfBtn').disabled = !ok;
    $('tfRefine').disabled = !(ok && state.timefix && state.tfAuto);
  }, 400);
  $('tfTimer').onclick = () => {
    set({ tfTimer: !state.tfTimer });
    $('tfTimer').querySelector('.tg').classList.toggle('on', state.tfTimer);
    if (state.timefix) run(state.timefix.trim_s, false);   // 同一版,只換計時器
  };
  $('tfBtn').onclick = () => {
    if (+$('tfMeasured').value) return refine();          // 填了實測卻按 Fix → 照樣採用
    loadHistory(); run(currentGain(), true);
  };
  $('tfRefine').onclick = refine;
  $('tfAuto').onclick = () => {
    set({ tfAuto: !state.tfAuto });
    $('tfAuto').querySelector('.tg').classList.toggle('on', state.tfAuto);
    if (state.timefix) run(state.tfAuto ? currentGain() : 0, false); else label();
  };
  $('tfListDl').onclick = downloadList;
  $('tfManualBtn').onclick = () => {
    const v = parseFloat($('tfManual').value); if (Number.isNaN(v)) return;
    $('tfManual').value = '';
    run(-v, true);                                   // 介面:負 = 加長;引擎 trim:正 = 縮短
  };
  $('tfManual').addEventListener('keydown', e => { if (e.key === 'Enter') $('tfManualBtn').click(); });
  $('tfReset').onclick = () => {
    if (!state.kfOriginal) return;
    import('./timeline.js').then(m => { state.kfOriginal.forEach((t, i) => m.moveKeyframe(i, t)); rerunTimefix(); });
  };
  $('tfMeasured').addEventListener('keydown', e => { if (e.key === 'Enter') refine(); });
  $('tfMeasured').addEventListener('input', label);
  // 換檔或切到 Time Fix 分頁:載入該檔紀錄,有紀錄就直接重出目前這一版
  let lastKey = null;
  setInterval(() => {
    if (state.tab !== 'timefix' || !state.files.motion || !engineReady()) return;
    const k = histKey(); if (k === lastKey) return;
    lastKey = k; set({ timefix: null }); loadHistory();
    if (state.tfHistory.length) run(currentGain(), true); else { $('tfLog').innerHTML = ''; label(); }
  }, 300);
  $('tfClear').onclick = () => { set({ tfHistory: [] }); saveHistory(); run(null, true); };
}

function loadHistory() {
  try { set({ tfHistory: JSON.parse(localStorage.getItem(histKey()) || '[]') }); } catch { set({ tfHistory: [] }); }
}
function saveHistory() {
  try { localStorage.setItem(histKey(), JSON.stringify(state.tfHistory)); } catch {}
}
const TOL = 0.003;
const within = h => h.measured_s != null && state.timefix &&
  Math.abs(h.measured_s - state.timefix.schedule_s) / state.timefix.schedule_s <= TOL;
function bestDone() {                                   // 已達 ±0.3% 的版本中誤差最小者
  const sched = state.timefix?.schedule_s ?? state.tfSched;
  if (!sched) return null;
  const ok = state.tfHistory.filter(h => h.measured_s != null && Math.abs(h.measured_s - sched) / sched <= TOL);
  return ok.sort((a, b) => Math.abs(a.measured_s - sched) - Math.abs(b.measured_s - sched))[0] || null;
}
function currentGain() {
  const h = state.tfHistory.at(-1);
  if (h && h.measured_s == null) return h.trim_s;       // 還沒跑的版本 → 重出同一版
  const done = bestDone();
  if (done) return done.trim_s;                         // 已對準 → 重出最好的那一版
  return null;                                          // 否則依實測算下一版
}
function label() {
  const n = state.tfHistory.length;
  const typed = +$('tfMeasured').value;
  const last = state.tfHistory.at(-1);
  $('tfBtn').textContent = !state.tfAuto ? (state.timefix ? 'Recompute' : 'Fix Timing')
    : typed ? 'Use $T[1] → next version'
    : !n ? 'Fix Timing'
    : bestDone() && last?.measured_s != null ? `Regenerate v${bestDone().v} (on target)`
    : last?.measured_s == null ? `Regenerate v${last.v}` : 'Make next version';
}

async function run(trim, recordVersion) {
  const btn = $('tfBtn'); btn.textContent = 'Fixing…';
  try {
    const f = state.files.motion;
    const r = await timeFix({
      motionText: editedMotionText(),
      motionExt: f.name.endsWith('.json') ? '.json' : '.hrb',
      timer: state.tfTimer,
      auto: state.tfAuto,                    // 關閉 → 只修 66ms
      trim,                                  // null → 依實測算下一版;第一版 0
      history: state.tfHistory.filter(h => h.measured_s != null),
    });
    $('tfMsg').classList.toggle('show', !!r.error);
    $('tfMsg').textContent = r.error || '';
    if (r.error) { set({ timefix: null }); $('codeBtn').disabled = true; label(); return; }
    set({ tfSched: r.schedule_s });
    if (recordVersion && state.tfAuto) {
      const h = state.tfHistory, last = h.at(-1);
      const existing = h.find(x => Math.abs(x.trim_s - r.trim_s) < 5e-4);
      if (existing) r.version = existing.v;                 // 同 trim = 同一版,不重複記
      else if (!last || last.measured_s != null) { h.push({ v: Math.max(0, ...h.map(x => x.v)) + 1, trim_s: r.trim_s, measured_s: null }); r.version = h.at(-1).v; }
      else { last.trim_s = r.trim_s; r.version = last.v; }
      saveHistory();
    }
    set({ timefix: r });
    render();
    $('codeBtn').disabled = false;
  } catch (e) {
    $('tfFixed').textContent = 'error';
    console.error(e);
  }
  label();
}

function refine() {
  let ms = +$('tfMeasured').value;
  let last = state.tfHistory.at(-1);
  if (!ms || !last || !state.timefix) return;
  if (ms < 1000) ms *= 1000;                             // 輸入的是秒(193.422)→ 換成 ms
  const off = (ms / 1000 - state.timefix.schedule_s) / state.timefix.schedule_s;
  if (Math.abs(off) > 0.10) {                            // 打錯或量錯檔案:不採用
    $('tfMsg').classList.add('show');
    $('tfMsg').textContent = `${(ms / 1000).toFixed(3)} s is ${(off * 100).toFixed(1)}% off this file's schedule ` +
      `(${state.timefix.schedule_s.toFixed(2)} s), so it wasn't used. Check that $T[1] came from this file's run and is in ms.`;
    return;
  }
  $('tfMsg').classList.remove('show');
  if (last.measured_s != null) {                        // 同一版再跑一次 → 另記一筆,不覆蓋
    last = { v: last.v, trim_s: last.trim_s, measured_s: null, rerun: true };
    state.tfHistory.push(last);
  }
  last.measured_s = ms / 1000;
  $('tfMeasured').value = '';
  saveHistory();
  const err = (last.measured_s - state.timefix.schedule_s) / state.timefix.schedule_s;
  if (Math.abs(err) <= TOL) { render(); label(); return; }   // 已在 ±0.3%,不再出新版
  run(null, true);
}

// 跟不上的動作清單 → CSV(帶 BOM,Excel 直接開;欄位對應 TwinPose 裡要改的地方)
function downloadList() {
  const r = state.timefix; if (!r) return;
  const head = ['point', 'from_s', 'to_s', 'to_frame_30fps', 'axis', 'axis_move_deg',
                'twinpose_interval_ms', 'needs_at_least_ms', 'add_ms'];
  const rows = r.saturated.map(x => [`P${x.p}`, x.from_t.toFixed(2), x.t.toFixed(2), Math.round(x.t * 30),
    x.axis, x.delta_deg, x.orig_ms, x.need_orig_ms, x.need_orig_ms - x.orig_ms]);
  const note = ['# Moves the arm cannot make in time. Fix in TwinPose: move the keyframe at to_s later by add_ms,',
                '# or make the move smaller (axis_move_deg). Then export again and re-check in Time Fix.'];
  const csv = '\uFEFF' + [...note, head.join(','), ...rows.map(r => r.join(','))].join('\n') + '\n';
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
    download: (state.files.motion?.name || 'motion').replace(/\.(json|hrb)$/, '') + '_over_limit.csv' });
  a.click(); URL.revokeObjectURL(a.href);
}

let rerunTimer;
export function rerunTimefix() {
  if (!state.timefix && !state.files.motion) return;
  clearTimeout(rerunTimer);
  rerunTimer = setTimeout(() => run(state.tfAuto ? currentGain() : 0, false), 350);
}

// 顯示用:trim 正 = 縮短 → 以「−0.58 s」表示;第一版顯示 base
const corr = t => Math.abs(t) < 5e-4 ? 'base' : `${t > 0 ? '−' : '+'}${Math.abs(t).toFixed(2)} s`;   // 引擎 trim>0 = 縮短 → 顯示「−」

const pct = (x, base) => `${x >= base ? '+' : ''}${((x - base) / base * 100).toFixed(2)}%`;

function render() {
  const r = state.timefix; if (!r) return;
  $('tfSched').textContent = r.schedule_s.toFixed(2) + ' s';
  $('tfRaw').textContent = `≈ ${r.raw_pred_s.toFixed(1)} s (${pct(r.raw_pred_s, r.schedule_s)})`;
  $('tfRaw').className = Math.abs(r.raw_pred_s - r.schedule_s) / r.schedule_s > 0.01 ? 'bad' : '';
  $('tfFixed').textContent = `≈ ${r.fixed_pred_s.toFixed(1)} s`;
  const short = r.saturated.reduce((a, x) => a + Math.max(x.floor_ms - x.time_ms, 0), 0) / 1000;
  $('tfSat').textContent = state.tfAuto ? `${r.saturated.length} · repaid ${r.repaid_s.toFixed(2)} s`
                                        : `${r.saturated.length} · short ${short.toFixed(2)} s`;
  $('tfSat').className = !state.tfAuto && r.saturated.length ? 'bad' : r.saturated.length ? '' : 'ok';

  // 實測紀錄
  const rows = state.tfHistory.map((h, i) => {
    const curV = r.version ?? state.tfHistory.at(-1)?.v;
    const cur = i === state.tfHistory.map(x => x.v).lastIndexOf(curV);   // 目前 Code Editor 裡的那一版
    const m = h.measured_s;
    const cls = m == null ? '' : Math.abs(m - r.schedule_s) / r.schedule_s <= 0.003 ? 'ok' : 'bad';
    return `<tr class="${cur ? 'cur' : ''}"><td>v${h.v}${h.rerun ? ' re-run' : ''}</td><td class="num">${corr(h.trim_s)}</td>` +
      `<td class="num">${m == null ? (cur ? 'run this one' : '—') : m.toFixed(3) + ' s'}</td>` +
      `<td class="num ${cls}">${m == null ? '' : pct(m, r.schedule_s) + (cls === 'ok' ? ' ✓' : '')}</td></tr>`;
  });
  $('tfLog').innerHTML = rows.join('');
  $('tfClear').style.display = state.tfHistory.some(h => h.measured_s != null) ? '' : 'none';

  // 跟不上的動作(點擊跳轉)
  $('tfSatTitle').style.display = r.saturated.length ? '' : 'none';
  $('tfSatHint').style.display = r.saturated.length ? '' : 'none';
  $('tfReset').style.display = keyframesEdited() ? '' : 'none';
  $('tfListDl').style.display = r.saturated.length ? '' : 'none';
  $('tfSatList').innerHTML = r.saturated.slice(0, 40).map(s =>
    `<div class="err" data-t="${s.t}"><span class="dot"></span><span class="t">${s.t.toFixed(2)}s</span>` +
    `<span>P${s.p}: ${s.axis} ${s.delta_deg > 0 ? '+' : ''}${s.delta_deg}°, needs +${Math.max(s.floor_ms - s.time_ms, 1)} ms</span></div>`).join('');
  $('tfSatList').querySelectorAll('.err').forEach(el => el.onclick = () => seek(+el.dataset.t));
}

// Code Editor 用的資料
export function timefixSheet() {
  const r = state.timefix; if (!r) return null;
  const v = r.version || state.tfHistory.at(-1)?.v || 1;
  return {
    name: (state.files.motion?.name || 'motion').replace(/\.(json|hrb)$/, '') +
          (state.tfAuto ? `_timefix_v${v}` : '_timefix_manual') + (keyframesEdited() ? '_edited' : '') + '.hrb',
    stats: `<span>schedule <b>${r.schedule_s.toFixed(2)} s</b></span>` +
           `<span>as exported <b>≈ ${r.raw_pred_s.toFixed(1)} s</b></span>` +
           `<span>this version <b>≈ ${r.fixed_pred_s.toFixed(1)} s</b></span>` +
           `<span><b>${r.segments}</b> moves</span><span>correction <b>${corr(r.trim_s)}</b></span>`,
    warn: 'Run times are model estimates. Confirm with $T[1] and enter it under Calibrate.',
    hrb: r.hrb,
  };
}
