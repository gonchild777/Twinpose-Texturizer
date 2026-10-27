// Step 1 — Keyframes 切點規劃頁:呼叫引擎 plan_keyframes,核銷清單 + plan.csv 下載
import { state, set } from './store.js';
import { planKeyframes, engineReady } from './bridge.js';
import { seek } from './video.js';

const $ = id => document.getElementById(id);
const REASON_ORDER = { valley: 0, hit: 1, hold: 2, infill: 3, start: 4, end: 4 };

export function initPlan() {
  const bind = (id, out, fmt) => $(id).addEventListener('input', () => $(out).textContent = fmt($(id).value));
  bind('pDisp', 'pvDisp', v => v);
  bind('pMax', 'pvMax', v => (v / 100).toFixed(1) + 's');
  bind('pBudget', 'pvBudget', v => +v ? v : '—');
  setInterval(() => { $('planBtn').disabled = !(state.files.metrics && engineReady()); }, 400);
  $('planBtn').onclick = runPlan;
  $('planDl').onclick = download;
}

async function runPlan() {
  const btn = $('planBtn'); btn.textContent = 'Planning…';
  try {
    const plan = await planKeyframes(state.files.metrics, {
      min_dt: 0.35,
      max_dt: +$('pMax').value / 100,
      disp_step: +$('pDisp').value,
      budget: +$('pBudget').value || null,
    });
    set({ plan });
    render(plan);
  } catch (e) { $('planSum').textContent = 'error: ' + e; }
  btn.textContent = 'Plan Keyframes';
}

function checkedKey() { return 'plan_done_' + (state.files.metrics?.name || ''); }

function render(plan) {
  const counts = {};
  for (const p of plan) counts[p.reason] = (counts[p.reason] || 0) + 1;
  $('planSum').textContent =
    `${plan.length} cuts (uniform 0.5s = ${Math.round(state.duration / 0.5) + 1}) · ` +
    Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(' · ');
  const done = new Set(JSON.parse(localStorage.getItem(checkedKey()) || '[]'));
  $('planList').innerHTML = plan.map((p, i) =>
    `<div class="krow ${done.has(i) ? 'done' : ''}" data-i="${i}" data-t="${p.t}">
       <input type="checkbox" ${done.has(i) ? 'checked' : ''}>
       <span class="fr">#${p.frame}</span><span>${p.t.toFixed(2)}s</span>
       <span class="rs ${p.reason}">${p.reason}</span></div>`).join('');
  $('planList').querySelectorAll('.krow').forEach(row => {
    const cb = row.querySelector('input');
    row.onclick = e => {
      if (e.target === cb) {                      // 勾選 = 核銷(擷取完成)
        row.classList.toggle('done', cb.checked);
        cb.checked ? done.add(+row.dataset.i) : done.delete(+row.dataset.i);
        localStorage.setItem(checkedKey(), JSON.stringify([...done]));
      } else seek(+row.dataset.t);                // 點列 = 影片跳到該幀確認姿勢
    };
  });
  $('planDl').style.display = '';
}

function download() {
  const rows = [['time_s', 'frame@30fps', 'reason'],
    ...state.plan.map(p => [p.t, p.frame, p.reason])];
  const blob = new Blob(['\uFEFF' + rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' });
  const a = Object.assign(document.createElement('a'),
    { href: URL.createObjectURL(blob), download: (state.files.metrics.name.replace(/\.csv$/, '')) + '_keyframe_plan.csv' });
  a.click(); URL.revokeObjectURL(a.href);
}
