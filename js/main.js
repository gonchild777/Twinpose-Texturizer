import { state, set, on } from './store.js';
import { wireFileInputs, mark } from './files.js';
import { initVideo, loadVideoFile } from './video.js';
import { initTimeline } from './timeline.js';
import { initEngine, engineReady, applyTexture } from './bridge.js';

initVideo();
initTimeline();
initEngine();
wireFileInputs(f => { loadVideoFile(f); mark('Video', f.name); });

// ---- 增益滑桿 ----
const g = (id, out, fmt) => {
  const el = document.getElementById(id), o = document.getElementById(out);
  el.addEventListener('input', () => { o.textContent = fmt(el.value); syncGains(); });
};
g('gTorque', 'vTorque', v => (v / 100).toFixed(1));
g('gJerk', 'vJerk', v => (v / 100).toFixed(1));
g('gSens', 'vSens', v => v);
function syncGains() {
  set({ gains: {
    torque: +document.getElementById('gTorque').value / 100,
    jerk: +document.getElementById('gJerk').value / 100,
    sensitivity: +document.getElementById('gSens').value,
  }});
  if (state.texture) runApply();          // 已套用過 → 拖滑桿即時重算
}

// ---- Apply ----
const applyBtn = document.getElementById('applyBtn');
// 檔案齊 + 引擎就緒 → 解鎖(引擎載入為非同步,用輪詢最簡)
setInterval(() => { applyBtn.disabled = !(state.files.motion && state.files.metrics && engineReady()); }, 400);
applyBtn.onclick = runApply;
let busy = false;
async function runApply() {
  if (busy) return; busy = true;
  applyBtn.textContent = 'Computing…';
  try {
    const tex = await applyTexture({ motionFile: state.files.motion, metricsFile: state.files.metrics, gains: state.gains });
    set({ texture: tex });
    renderErrors(tex);
    document.getElementById('codeBtn').disabled = false;
  } catch (e) {
    document.getElementById('engineStatus').textContent = 'engine error: ' + e;
  }
  applyBtn.textContent = 'Apply Texture'; busy = false;
}

// ---- 錯誤清單 ----
function renderErrors(tex) {
  const box = document.getElementById('errBox'), n = document.getElementById('errN'), list = document.getElementById('errList');
  const sats = tex.saturated || [];
  box.classList.add('show');
  n.textContent = sats.length; n.classList.toggle('zero', !sats.length);
  list.innerHTML = sats.slice(0, 8).map(s =>
    `<div class="err" data-t="${s.time}"><span class="dot"></span><span class="t">${s.time}s</span>` +
    `<span>needs ${(s.clamped_ms/1000).toFixed(2)}s, has ${(s.wanted_ms/1000).toFixed(2)}s</span></div>`).join('');
  list.querySelectorAll('.err').forEach(el => el.onclick = () =>
    import('./video.js').then(m => m.seek(+el.dataset.t)));
}

// ---- Code Editor ----
const modal = document.getElementById('modal');
document.getElementById('codeBtn').onclick = () => { fillSheet(); modal.classList.add('open'); };
document.getElementById('backBtn').onclick = () => modal.classList.remove('open');
function fillSheet() {
  const tex = state.texture; if (!tex) return;
  const name = (state.files.motion?.name || 'motion').replace(/\.(json|hrb)$/, '') + '_textured.hrb';
  document.getElementById('sheetTitle').textContent = 'Code Editor — ' + name;
  const st = tex.stats;
  document.getElementById('stats').innerHTML =
    `<span><b>${tex.timeline.length}</b> points</span><span><b>${st.anchors}</b> anchors</span>` +
    `<span><b>${st.pass}</b> flow</span><span>warnings <b>${tex.warnings.length}</b></span>`;
  const wl = document.getElementById('warnline');
  const sat = (tex.saturated || []).length;
  wl.classList.toggle('show', sat > 0);
  wl.textContent = sat ? `${sat} segments still exceed arm limits — contrast will flatten there.` : '';
  document.getElementById('codeView').innerHTML = highlight(tex.hrb);
  document.getElementById('dlBtn').onclick = () => {
    const blob = new Blob([tex.hrb], { type: 'text/plain' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
    a.click(); URL.revokeObjectURL(a.href);
  };
}
function highlight(src) {
  const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;');
  return src.split('\n').map(l => {
    const e = esc(l);
    if (l.startsWith(';')) return `<span class="c">${e}</span>`;
    if (l.startsWith('E6AXIS')) return `<span class="ax">${e}</span>`;
    if (/ CONT /.test(l)) return `<span class="cont">${e}</span>`;
    if (/FINE=\d/.test(l)) return `<span class="fine">${e}</span>`;
    return e;
  }).join('\n');
}

// ---- Local Save(M6 先佔位:狀態指示)----
document.getElementById('localSave').onclick = function () {
  this.querySelector('.tg').classList.toggle('on');
};
document.getElementById('importBtn').onclick = () => alert('.twtx import — M6');
document.getElementById('exportBtn').onclick = () => alert('.twtx export — M6');
// 分頁(M7 前先共用同一畫面)
document.querySelectorAll('.step').forEach(b => b.onclick = () => {
  document.querySelectorAll('.step').forEach(x => x.classList.remove('on'));
  b.classList.add('on');
});
