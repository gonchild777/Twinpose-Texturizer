// 主執行緒 ↔ Pyodide worker
let worker = null, ready = false, seq = 0;
const pending = new Map();
const statusEl = () => document.getElementById('engineStatus');

export function initEngine() {
  worker = new Worker('worker/py-worker.js');
  worker.onmessage = e => {
    const { type, id, payload } = e.data;
    if (type === 'ready') { ready = true; statusEl().textContent = 'engine: ready ✓ (texturizer wheel loaded)'; }
    if (type === 'result') pending.get(id)?.resolve(payload), pending.delete(id);
    if (type === 'error') {
      if (id != null) pending.get(id)?.reject(payload), pending.delete(id);
      else statusEl().textContent = 'engine: failed — ' + payload;
    }
  };
  statusEl().textContent = 'engine: loading Pyodide (~10MB, first time only)…';
}
export const engineReady = () => ready;
export function applyTexture({ motionFile, metricsFile, gains, robot = 'MEASURED_AUTO100' }) {
  return new Promise(async (resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    worker.postMessage({ type: 'apply', id, payload: {
      motionText: await motionFile.text(),
      motionExt: motionFile.name.endsWith('.json') ? '.json' : '.hrb',
      metricsText: await metricsFile.text(),
      gains, robot,
    }});
  });
}
