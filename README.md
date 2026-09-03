# TwinPose Texturizer

看著舞蹈影片,在時間軸上編輯機械手臂的質感,匯出可直接載入 HRSS 的 .hrb。
TwinPose 的姊妹工具 · Created by Michi Wang · 林峰正實驗室

**所有運算在瀏覽器內完成,檔案不上傳。**

## 本機執行
```bash
python3 -m http.server 8080        # repo 根目錄
# 開 http://localhost:8080
```

## 部署(GitHub Pages)
1. push 到 GitHub
2. Settings → Pages → Source: **GitHub Actions**
3. `.github/workflows/deploy.yml` 會在每次 push 自動部署

## 試用資料
`examples/0904/`:影片請自備(0904demo_少一分鐘.mp4),Motion 與 Metrics 已附。

## 架構
- 前端:原生 ES modules(無建置步驟),時間軸單一 canvas 自繪
- 引擎:`engine/texturizer_engine.zip` = Python texturizer 套件原封打包,
  由 Pyodide 在 Web Worker 載入執行 —— 判定邏輯**單一真相源**,
  與 CLI 共用同一套實測校正常數(時序精度 0.17% 實測)
- 規格書:`docs/SPEC.md`;判定邏輯:`docs/FINE_CONT_邏輯.md`

## 里程碑狀態
- [x] M0 骨架 + GitHub Pages 部署
- [x] M1 影片/時間軸雙向同步、縮放、膠卷、可拖分隔桿
- [x] M2 Pyodide 載入引擎(實機驗證 engine: ready ✓)、CSV 曲線、關鍵幀上軌
- [x] M3 Apply Texture、三色標示、增益滑桿即時重算、錯誤清單
- [x] M4 拖關鍵幀改時(吸附影格、夾鄰居)、Acc 點擊覆寫、Ctrl+Z / Ctrl+Shift+Z
- [x] M5 黃金樣本守門 `tools/golden_check.py` + CI(每次 push 驗證 engine zip 產碼 = FINAL4)
- [x] M6 Local Save 自動儲存/開站還原、.twtx Export/Import
- [x] M7 Keyframe Planner 切點規劃頁:Plan、核銷清單(點列跳幀、勾選核銷)、plan.csv

## 操作備忘
- Texturizer 分頁:拖曳菱形改時間(僅 .json 動作檔可編輯;.hrb 為唯讀顯示)
- 點 Acc 力度條 → 輸入數值 Enter(覆寫鍵 = 原始關鍵幀索引,引擎端補償時序)
- 改 worker/py-worker.js 後請將 js/bridge.js 的 `?v=` 加一,避開瀏覽器快取
- 黃金樣本:`python tools/golden_check.py`(需 pyyaml numpy)
