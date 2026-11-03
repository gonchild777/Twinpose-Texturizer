// Time Fix:TwinPose 直出 .hrb → 只調 TIME,對準影片排程。
// 判定全在引擎(core/timefix.py);這裡只管 UI、實測紀錄與版本。
import { state, set } from './store.js';
import { timeFix, engineReady } from './bridge.js';
import { seek } from './video.js';

const $ = id => document.getElementById(id);
const histKey = () => 'tf_hist::' + (state.files.motion?.name || '');

export function initTimefix() {
  setInterval(() => {
    const ok = !!state.files.motion && engineReady();
    $('tfBtn').disabled = !ok;
    $('tfRefine').disabled = !(ok && state.timefix);
  }, 400);
  $('tfTimer').onclick = () => {
    set({ tfTimer: !state.tfTimer });
    $('tfTimer').querySelector('.tg').classList.toggle('on', state.tfTimer);
    if (state.timefix) run(state.timefix.gain, false);   // 同一版,只換計時器
  };
  $('tfBtn').onclick = () => { loadHistory(); run(lastUnmeasuredGain(), true); };
  $('tfRefine').onclick = refine;
  $('tfMeasured').addEventListener('keydown', e => { if (e.key === 'Enter') refine(); });
  $('tfClear').onclick = () => { set({ tfHistory: [] }); saveHistory(); run(null, true); };
}

function loadHistory() {
  try { set({ tfHistory: JSON.parse(localStorage.getItem(histKey()) || '[]') }); } catch { set({ tfHistory: [] }); }
}
function saveHistory() {
  try { localStorage.setItem(histKey(), JSON.stringify(state.tfHistory)); } catch {}
}
function lastUnmeasuredGain() {
  const h = state.tfHistory.at(-1);
  return h && h.measured_s == null ? h.gain : null;     // 有未實測的版本 → 重出同一版
}

async function run(gain, recordVersion) {
  const btn = $('tfBtn'); btn.textContent = 'Fixing…';
  try {
    const f = state.files.motion;
    const r = await timeFix({
      motionText: await f.text(),
      motionExt: f.name.endsWith('.json') ? '.json' : '.hrb',
      timer: state.tfTimer,
      gain,                                  // null → 預設或依實測修正
      history: state.tfHistory.filter(h => h.measured_s != null),
    });
    if (recordVersion) {
      const h = state.tfHistory, last = h.at(-1);
      if (!last || last.measured_s != null) h.push({ v: Math.max(0, ...h.map(x => x.v)) + 1, gain: r.gain, measured_s: null });
      else last.gain = r.gain;
      saveHistory();
    }
    set({ timefix: r });
    render();
    $('codeBtn').disabled = false;
  } catch (e) {
    $('tfFixed').textContent = 'error';
    console.error(e);
  }
  btn.textContent = 'Fix Timing';
}

function refine() {
  const ms = +$('tfMeasured').value;
  let last = state.tfHistory.at(-1);
  if (!ms || !last || !state.timefix) return;
  if (last.measured_s != null) {                        // 同一版再跑一次 → 另記一筆,不覆蓋
    last = { v: last.v, gain: last.gain, measured_s: null, rerun: true };
    state.tfHistory.push(last);
  }
  last.measured_s = ms / 1000;
  $('tfMeasured').value = '';
  saveHistory();
  const err = (last.measured_s - state.timefix.schedule_s) / state.timefix.schedule_s;
  if (Math.abs(err) <= 0.003) { render(); return; }     // 已在 ±0.3%,不再出新版
  run(null, true);
}

const pct = (x, base) => `${x >= base ? '+' : ''}${((x - base) / base * 100).toFixed(2)}%`;

function render() {
  const r = state.timefix; if (!r) return;
  $('tfSched').textContent = r.schedule_s.toFixed(2) + ' s';
  $('tfRaw').textContent = `≈ ${r.raw_pred_s.toFixed(1)} s (${pct(r.raw_pred_s, r.schedule_s)})`;
  $('tfRaw').className = Math.abs(r.raw_pred_s - r.schedule_s) / r.schedule_s > 0.01 ? 'bad' : '';
  $('tfFixed').textContent = `≈ ${r.fixed_pred_s.toFixed(1)} s`;
  $('tfSat').textContent = `${r.saturated.length} · repaid ${r.repaid_s.toFixed(2)} s`;

  // 實測紀錄
  const rows = state.tfHistory.map((h, i) => {
    const cur = i === state.tfHistory.length - 1;
    const m = h.measured_s;
    const cls = m == null ? '' : Math.abs(m - r.schedule_s) / r.schedule_s <= 0.003 ? 'ok' : 'bad';
    return `<tr class="${cur ? 'cur' : ''}"><td>v${h.v}${h.rerun ? ' re-run' : ''}</td><td class="num">gain ${h.gain.toFixed(3)}</td>` +
      `<td class="num">${m == null ? (cur ? 'run this one' : '—') : m.toFixed(3) + ' s'}</td>` +
      `<td class="num ${cls}">${m == null ? '' : pct(m, r.schedule_s)}</td></tr>`;
  });
  $('tfLog').innerHTML = rows.join('');
  $('tfClear').style.display = state.tfHistory.some(h => h.measured_s != null) ? '' : 'none';

  // 跟不上的動作(點擊跳轉)
  $('tfSatTitle').style.display = r.saturated.length ? '' : 'none';
  $('tfSatList').innerHTML = r.saturated.slice(0, 12).map(s =>
    `<div class="err" data-t="${s.t}"><span class="dot"></span><span class="t">${s.t.toFixed(2)}s</span>` +
    `<span>P${s.p}: given ${(s.time_ms / 1000).toFixed(2)}s, needs ~${(s.floor_ms / 1000).toFixed(2)}s</span></div>`).join('');
  $('tfSatList').querySelectorAll('.err').forEach(el => el.onclick = () => seek(+el.dataset.t));
}

// Code Editor 用的資料
export function timefixSheet() {
  const r = state.timefix; if (!r) return null;
  const v = state.tfHistory.at(-1)?.v || 1;
  return {
    name: (state.files.motion?.name || 'motion').replace(/\.(json|hrb)$/, '') + `_timefix_v${v}.hrb`,
    stats: `<span>schedule <b>${r.schedule_s.toFixed(2)} s</b></span>` +
           `<span>as exported <b>≈ ${r.raw_pred_s.toFixed(1)} s</b></span>` +
           `<span>this version <b>≈ ${r.fixed_pred_s.toFixed(1)} s</b></span>` +
           `<span><b>${r.segments}</b> moves</span><span>gain <b>${r.gain.toFixed(3)}</b></span>`,
    warn: 'Run times are model estimates. Confirm with $T[1] and enter it under Calibrate.',
    hrb: r.hrb,
  };
}
