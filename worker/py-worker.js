// Pyodide worker:載入 texturizer 引擎(單一真相源),執行完整管線
importScripts('https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.js');
let pyodide = null;

const GLUE = `
import json, sys
sys.path.insert(0, '/engine')
from core import Config, load_metrics, load_motion, run
from core.config import RobotParams

def apply_texture(motion_path, metrics_csv_text, gains, robot):
    # 原始 SmoothedMetrics → 引擎格式(對映同 adapt_metrics.py)
    import csv, io
    rows = list(csv.DictReader(io.StringIO(metrics_csv_text)))
    with open('/tmp/m.csv', 'w', newline='') as f:
        w = csv.writer(f); w.writerow(['time_s','omega_total','energy','torque','jerk'])
        for r in rows:
            w.writerow([float(r['frameIndex'])/30.0,
                        float(r['LeftAngularIntensity'])+float(r['RightAngularIntensity']),
                        float(r.get('EnergyFlow',0)), float(r['TransitionTorque']), float(r.get('Jerk',0))])
    cfg = Config()
    cfg.style.torque_gain = gains['torque']
    cfg.style.jerk_gain = gains['jerk']
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
  await pyodide.loadPackage(['pyyaml']);
  const zip = await (await fetch('../engine/texturizer_engine.zip')).arrayBuffer();
  pyodide.FS.mkdir('/engine');
  pyodide.unpackArchive(zip, 'zip', { extractDir: '/engine' });
  pyodide.runPython(GLUE);
  postMessage({ type: 'ready' });
}

onmessage = async e => {
  const { type, payload, id } = e.data;
  try {
    if (type === 'apply') {
      pyodide.FS.writeFile('/tmp/motion' + payload.motionExt, payload.motionText);
      const out = pyodide.runPython(
        `apply_texture('/tmp/motion${payload.motionExt}', ${JSON.stringify(payload.metricsText)}, ` +
        `${JSON.stringify(payload.gains)}, ${JSON.stringify(payload.robot)})`);
      postMessage({ type: 'result', id, payload: JSON.parse(out) });
    }
  } catch (err) {
    postMessage({ type: 'error', id, payload: String(err) });
  }
};
init().catch(err => postMessage({ type: 'error', payload: 'init: ' + err }));
