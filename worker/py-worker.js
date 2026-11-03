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

def _timefix_json(js):
    from core.timefix import fix_timing, next_trim, json_to_hrb, AlreadyTimedError
    from dataclasses import asdict
    p = json.loads(js)
    try:
        text = p['motionText']
        if p.get('motionExt') == '.json':
            text = json_to_hrb(json.loads(text))
        timer = bool(p.get('timer'))
        if not p.get('auto', True):                       # 手動模式:只修 66ms
            return json.dumps(asdict(fix_timing(text, gain=0, timer=timer)))
        trim = p.get('trim')
        if trim is None:
            hist = [h for h in (p.get('history') or []) if h.get('measured_s') is not None]
            trim = next_trim(hist, fix_timing(text).schedule_s) if hist else 0.0
        return json.dumps(asdict(fix_timing(text, timer=timer, trim_s=trim)))
    except AlreadyTimedError as e:
        return json.dumps({'error': str(e)})

def _next_trim_json(js):
    from core.timefix import next_trim
    p = json.loads(js)
    return json.dumps({'trim': next_trim(p['history'], p['schedule_s'])})

def _apply_json(js):
    from core.io_twinpose import AlreadyTimedInput
    p = json.loads(js)
    try:
        return apply_texture(p['motionPath'], p['metricsText'], p['gains'], p['robot'])
    except AlreadyTimedInput as e:
        return json.dumps({'error': str(e)})

def apply_texture(motion_path, metrics_csv_text, gains, robot):
    _write_adapted(metrics_csv_text)
    cfg = Config()
    cfg.style.torque_gain = gains['torque']
    cfg.style.jerk_gain = gains['jerk']
    cfg.style.acc_overrides = {int(k): int(v) for k, v in (gains.get('acc_overrides') or {}).items()}
    cfg.style.ramp = gains.get('ramp') or None
    cfg.valley.sensitivity = gains['sensitivity']
    cfg.style.trim_s = float(gains.get('trim') or 0.0)
    from core.io_twinpose import find_trigger
    out = gains.get('output') or {}
    trigger = None
    if out.get('trigger', True):
        trigger = find_trigger(motion_path) or 'WAIT FOR $DI[8] == TRUE'
    rp = RobotParams.load(robot)
    frames = load_motion(motion_path)
    schedule = frames[-1].time - frames[0].time
    res = run(frames, load_metrics('/tmp/m.csv'), cfg, rp, trigger=trigger, timer=bool(out.get('timer')))
    r = res.report
    est = 0.0
    for f in res.frames:
        if f.time_ms is None or f.role.value == 'wait':
            continue
        est += f.time_ms / 1000.0 + rp.fine_cmd_offset
        if f.smooth.value == 'CONT':
            est -= rp.cont_saving_base * 100.0 / max(f.acc, 1)
    return json.dumps({
        'timeline': r.timeline,
        'warnings': r.warnings,
        'saturated': r.saturated_segments,
        'stats': {'anchors': r.anchors, 'pass': r.pass_points, 'hybrid': getattr(r, 'hybrid_anchors', 0)},
        'schedule_s': round(schedule, 3), 'pred_s': round(est, 2),
        'trim_s': cfg.style.trim_s, 'trim_applied_s': getattr(r, 'trim_applied_s', 0.0),
        'trigger': trigger,
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
    if (type === 'timefix') {
      pyodide.globals.set('__payload', JSON.stringify(payload));
      const out = pyodide.runPython('_timefix_json(__payload)');
      postMessage({ type: 'result', id, payload: JSON.parse(out) });
    }
    if (type === 'next_trim') {
      pyodide.globals.set('__payload', JSON.stringify(payload));
      postMessage({ type: 'result', id, payload: JSON.parse(pyodide.runPython('_next_trim_json(__payload)')) });
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
