#!/usr/bin/env python3
"""黃金樣本守門:解壓「實際部署給瀏覽器」的 engine zip,以 worker 膠水等效路徑
跑 examples/0904 輸入,指令行必須與實測收斂的 FINAL4 逐行一致。
任何引擎或膠水改動若使網站產碼偏離實機驗證結果,CI 即擋下。"""
import sys, tempfile, zipfile, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
EX = ROOT / 'examples' / '0904'

def write_adapted(src, dst, fps=30.0, engine_dir=None):
    """與 worker 膠水同路徑:呼叫引擎自帶的 adapt_metrics.adapt"""
    sys.path.insert(0, str(engine_dir / 'calibration'))
    import adapt_metrics
    adapt_metrics.adapt(pathlib.Path(src), pathlib.Path(dst), fps)

def main():
    tmp = pathlib.Path(tempfile.mkdtemp())
    zipfile.ZipFile(ROOT / 'engine' / 'texturizer_engine.zip').extractall(tmp)
    sys.path.insert(0, str(tmp))
    from core import Config, load_metrics, load_motion, run
    from core.config import RobotParams
    write_adapted(EX / 'SmoothedMetrics_0904demo_trimmed.csv', tmp / 'm.csv', engine_dir=tmp)
    res = run(load_motion(str(EX / '0904_final_turnfix.json')), load_metrics(str(tmp / 'm.csv')),
              Config(), RobotParams.load('MEASURED_AUTO100'))
    cmd = lambda txt: [l for l in txt.splitlines() if l.startswith(('PTP', 'E6AXIS'))]
    got, gold = cmd(res.hrs), cmd((EX / 'golden_FINAL4.hrb').read_text())
    if got != gold:
        for i, (a, b) in enumerate(zip(got, gold)):
            if a != b: print(f'第 {i} 行不同:\n  got  {a}\n  gold {b}'); break
        print(f'FAIL: {len(got)} vs {len(gold)} 行'); sys.exit(1)
    assert res.hrs.endswith('\n'), '檔尾必須換行(HRSS Err01-02-11)'
    print(f'golden OK — {len(got)} 行指令與 FINAL4 逐行一致;引擎 zip 可部署')

if __name__ == '__main__':
    main()
