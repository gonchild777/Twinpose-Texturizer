import { state, set, on, emit } from './store.js';
import { wireFileInputs, mark } from './files.js';
import { initVideo, loadVideoFile } from './video.js';
import { initTimeline } from './timeline.js';
import { initEngine, engineReady, applyTexture } from './bridge.js';
import { initPlan } from './plan.js';

initVideo();
initTimeline();
initEngine();
initPlan();
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
    // 有編輯過 → 傳編輯後的 motionDoc;否則傳原檔
    const motionText = state.motionDoc ? JSON.stringify(state.motionDoc) : await state.files.motion.text();
    const tex = await applyTexture({ motionText, motionExt: state.motionExt,
                                     metricsFile: state.files.metrics,
                                     gains: { ...state.gains, acc_overrides: state.accOverrides } });
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
// 分頁(M7 前先共用同一畫面)
document.querySelectorAll('.step').forEach(b => b.onclick = () => {
  document.querySelectorAll('.step').forEach(x => x.classList.remove('on'));
  b.classList.add('on');
  const tab = b.dataset.tab;
  document.getElementById('planPanel').classList.toggle('on', tab === 'keyframes');
  document.getElementById('texturePanel').classList.toggle('on', tab === 'texture');
  set({ tab });
});

// ---- 影片/時間軸 分隔桿拖曳(記憶高度) ----
{
  const div = document.getElementById('divider');
  const saved = localStorage.getItem('tlh');
  if (saved) document.documentElement.style.setProperty('--tlh', saved + 'px');
  let startY = 0, startH = 0;
  div.addEventListener('pointerdown', e => {
    startY = e.clientY; startH = document.querySelector('.tlwrap').clientHeight;
    div.classList.add('drag'); div.setPointerCapture(e.pointerId);
  });
  div.addEventListener('pointermove', e => {
    if (!div.classList.contains('drag')) return;
    const h = Math.min(Math.max(startH + (startY - e.clientY), 120), innerHeight - 260);
    document.documentElement.style.setProperty('--tlh', h + 'px');
    localStorage.setItem('tlh', h);
  });
  div.addEventListener('pointerup', () => div.classList.remove('drag'));
}


// ==== M4:Acc 點擊覆寫(浮動輸入框)====
on('accClick', ({ seg, x, y }) => {
  const old = document.getElementById('accInput'); old?.remove();
  const cur = state.accOverrides[seg] ?? segAcc(seg) ?? 60;
  const inp = Object.assign(document.createElement('input'), {
    id: 'accInput', type: 'number', min: 10, max: 100, value: cur });
  Object.assign(inp.style, { position: 'fixed', left: x - 28 + 'px', top: y - 34 + 'px',
    width: '56px', padding: '4px', background: '#2E2E2E', color: '#fff',
    border: '1px solid #4CAF50', borderRadius: '5px', fontSize: '14px', zIndex: 60 });
  document.body.appendChild(inp); inp.focus(); inp.select();
  const commit = ok => {
    if (ok) {
      const v = Math.min(Math.max(+inp.value || cur, 10), 100);
      pushUndo({ type: 'acc', seg, old: state.accOverrides[seg], val: v });
      state.accOverrides[seg] = v;
      set({ accOverrides: { ...state.accOverrides } });
      if (state.texture) runApply();
    }
    inp.remove();
  };
  inp.onkeydown = e => { if (e.key === 'Enter') commit(true); if (e.key === 'Escape') commit(false); };
  inp.onblur = () => commit(false);
});
function segAcc(seg) {
  const t = state.keyframes?.[seg]?.time;
  return state.texture?.timeline.find(p => Math.abs(p.t - t) < 0.002)?.acc;
}

// ==== M4:拖關鍵幀後自動重算 + undo ====
let kfDragStart = null;
on('kfDragStart', d => kfDragStart = d);
on('kfMoved', i => {
  const oldT = kfDragStart?.i === i ? kfDragStart.t : undefined;
  if (oldT !== undefined && oldT !== state.keyframes[i].time)
    pushUndo({ type: 'kf', i, oldT, newT: state.keyframes[i].time });
  kfDragStart = null;
  if (state.texture) debounceApply();
});
let applyTimer;
function debounceApply() { clearTimeout(applyTimer); applyTimer = setTimeout(runApply, 350); }

function pushUndo(op) { state.undo.push(op); state.redo.length = 0; }
addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
  if (e.target.tagName === 'INPUT') return;
  e.preventDefault();
  const from = e.shiftKey ? state.redo : state.undo, to = e.shiftKey ? state.undo : state.redo;
  const op = from.pop(); if (!op) return;
  if (op.type === 'acc') {
    const cur = state.accOverrides[op.seg];
    to.push({ ...op, val: cur, old: op.val });
    if (op.old === undefined && !e.shiftKey) delete state.accOverrides[op.seg];
    else state.accOverrides[op.seg] = e.shiftKey ? op.val : op.old;
    set({ accOverrides: { ...state.accOverrides } });
  }
  if (op.type === 'kf' && op.oldT !== undefined) {
    to.push({ ...op, oldT: state.keyframes[op.i].time, newT: op.oldT });
    import('./timeline.js').then(m => m.moveKeyframe(op.i, e.shiftKey ? op.newT : op.oldT));
  }
  if (state.texture) debounceApply();
});

// ==== M6:.twtx 專案存檔 + Local Save 自動儲存 ====
const TWTX = 1;
function snapshot() {
  return { schema: TWTX, savedAt: new Date().toISOString(),
    fileNames: { video: state.files.video?.name, motion: state.files.motion?.name, metrics: state.files.metrics?.name },
    gains: state.gains, tab: state.tab, accOverrides: state.accOverrides,
    kfTimes: state.keyframes?.map(k => k.time) ?? null,
    tlh: localStorage.getItem('tlh') };
}
function restore(sn) {
  if (!sn || sn.schema !== TWTX) return;
  ['gTorque','gJerk','gSens'].forEach((id, j) => {
    const v = [sn.gains.torque * 100, sn.gains.jerk * 100, sn.gains.sensitivity][j];
    document.getElementById(id).value = v;
    document.getElementById(['vTorque','vJerk','vSens'][j]).textContent = j < 2 ? (v/100).toFixed(1) : v;
  });
  set({ gains: sn.gains, accOverrides: sn.accOverrides || {} });
  if (sn.tlh) document.documentElement.style.setProperty('--tlh', sn.tlh + 'px');
  pendingKfTimes = sn.kfTimes;   // 等 motion 載入後套用
  document.getElementById('savedAt').textContent = 'restored · load files to continue';
}
let pendingKfTimes = null;
on('change', p => {
  if ('motionDoc' in p && pendingKfTimes && state.keyframes?.length === pendingKfTimes.length) {
    import('./timeline.js').then(m => pendingKfTimes.forEach((t, i) => m.moveKeyframe(i, t)));
    pendingKfTimes = null;
  }
});
document.getElementById('exportBtn').onclick = () => {
  const blob = new Blob([JSON.stringify(snapshot(), null, 2)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'),
    { href: URL.createObjectURL(blob), download: (state.files.motion?.name?.replace(/\.\w+$/, '') || 'project') + '.twtx' });
  a.click(); URL.revokeObjectURL(a.href);
};
document.getElementById('importBtn').onclick = () => {
  const inp = Object.assign(document.createElement('input'), { type: 'file', accept: '.twtx' });
  inp.onchange = async () => restore(JSON.parse(await inp.files[0].text()));
  inp.click();
};
// Local Save:每次變更 debounce 寫入;開站還原(檔案除外)
let saveTimer;
on('change', () => {
  if (!document.querySelector('#localSave .tg').classList.contains('on')) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    localStorage.setItem('twtx_auto', JSON.stringify(snapshot()));
    document.getElementById('savedAt').textContent =
      'saved ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, 600);
});
try { const auto = localStorage.getItem('twtx_auto'); if (auto) restore(JSON.parse(auto)); } catch {}
