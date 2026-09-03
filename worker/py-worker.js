// Pyodide worker:載入 texturizer 引擎(單一真相源),執行完整管線
importScripts('https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.js');
let pyodide = null;

const GLUE = `
import json, sys
sys.path.insert(0, '/engine')
from core import Config, load_metrics, load_motion, run
from core.config import RobotParams

def _write_adapted(metrics_csv_text, fps=30.0):
    # 單一真相源:直接呼叫 calibration/adapt_metrics.adapt,不重寫轉換邏輯
    sys.path.insert(0, '/engine/calibration')
    from pathlib import Path
    import adapt_metrics
    Path('/tmp/raw.csv').write_text(metrics_csv_text, encoding='utf-8')
    adapt_metrics.adapt(Path('/tmp/raw.csv'), Path('/tmp/m.csv'), fps)

def plan_keyframes(metrics_csv_text, params):
    sys.path.insert(0, '/engine/calibration')
    import plan_keyframes as pk
    _write_adapted(metrics_csv_text)
    t, w, tq = pk.load('/tmp/m.csv')
    keys = pk.plan(t, w, tq, params['min_dt'], params['max_dt'],
                   params['disp_step'], params.get('budget'))
    return json.dumps([{'t': round(x, 3), 'frame': round(x * 30), 'reason': k} for x, k in keys])

def _plan_json(js):
    p = json.loads(js)
    return plan_keyframes(p['metricsText'], p['params'])

def _apply_json(js):
    p = json.loads(js)
    return apply_texture(p['motionPath'], p['metricsText'], p['gains'], p['robot'])

def apply_texture(motion_path, metrics_csv_text, gains, robot):
    _write_adapted(metrics_csv_text)
    cfg = Config()
    cfg.style.torque_gain = gains['torque']
    cfg.style.jerk_gain = gains['jerk']
    cfg.style.acc_overrides = {int(k): int(v) for k, v in (gains.get('acc_overrides') or {}).items()}
    cfg.valley.sensitivity = gains['sensitivity']
    res = run(load_motion(motion_path), load_metrics('/tmp/m.csv'), cfg, RobotParams.load(robot))
    r = res.report
    return json.dumps({
        'timeline': r.timeline,
        'warnings': r.warnings,
        'saturated': r.saturated_segments,
        'stats': {'anchors': r.anchors, 'pass': r.pass_points, 'hybrid': getattr(r, 'hybrid_anchors', 0)},
        'hrb': res.hrs,
    })
`;

async function init() {
  pyodide = await loadPyodide();
  await pyodide.loadPackage(['pyyaml', 'numpy']);
  const zip = await (await fetch('../engine/texturizer_engine.zip')).arrayBuffer();
  pyodide.FS.mkdir('/engine');
  pyodide.unpackArchive(zip, 'zip', { extractDir: '/engine' });
  pyodide.runPython(GLUE);
  postMessage({ type: 'ready' });
}

onmessage = async e => {
  const { type, payload, id } = e.data;
  try {
    if (type === 'plan') {
      pyodide.globals.set('__payload', JSON.stringify(payload));
      const out = pyodide.runPython('_plan_json(__payload)');
      postMessage({ type: 'result', id, payload: JSON.parse(out) });
    }
    if (type === 'apply') {
      pyodide.FS.writeFile('/tmp/motion' + payload.motionExt, payload.motionText);
      pyodide.globals.set('__payload', JSON.stringify({ ...payload, motionPath: '/tmp/motion' + payload.motionExt }));
      const out = pyodide.runPython('_apply_json(__payload)');
      postMessage({ type: 'result', id, payload: JSON.parse(out) });
    }
  } catch (err) {
    postMessage({ type: 'error', id, payload: String(err) });
  }
};
init().catch(err => postMessage({ type: 'error', payload: 'init: ' + err }));
