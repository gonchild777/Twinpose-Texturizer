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

## 質感漸變(Texture ramp)
右欄 Texturizer 面板開啟 **Texture ramp**,設 start/end(可按 ◀ playhead 取當前播放頭),
選 plain → texture 或反向。區間前後分別為「全無質感」(每點 FINE=1 / Acc 100,
即 0904 對照組定義)與「完整質感」;區間內 Acc 連續漸變、最流暢的段落最先解鎖 CONT、
錨點過半後採用質感分級。時序由 budget 帳本結清,總長不變。
CLI:`--ramp 10:25` / `--ramp-out 50:70`。

## 標準工作流程(無質感 / 有質感 / 漸變 三個檔案同長 = 影片)
1. TwinPose 匯出 .hrb(或 .json)。**三個檔案都從這一份原始檔出發,不串接。**
2. Time Fix:Fix Timing → 看「Moves the arm can't make」(或下載 .csv)→ 回 TwinPose 修 → 重新匯出,
   直到清單清空。Time Fix 與 Texturizer 用同一套校正下限(k_floor 0.88),兩邊紅框一致。
3. 無質感:Time Fix 輸出。有質感:Texturizer 輸出。漸變:Texturizer + Texture ramp。
   三者進場後都有 `WAIT FOR $DI[8] == TRUE`(沿用原始檔的那一行)與可選的 $T[1] 計時器,錄影與計時起點相同。
4. 任一輸出先跑一次、把 $T[1] 填進該分頁的 Calibrate,下一版自動修到 ±0.3%。
   總長由帳本閉合保證 = 排程;欠時先由錨點吸收,吸收不完的從所有寬裕段按比例扣回。

## Time Fix(TwinPose 直出 .hrb → 對準影片長度)
TwinPose 直接下載的 .hrb 把每段 TIME 寫成關鍵幀間隔,但 HRSS 每段 FINE=1 會多 66ms,
快速大動作還會被拖長 —— dance0719(3:14)直出實跑 3:29。
Time Fix 分頁:Motion 放 TwinPose 的 .hrb(或 .json)→ **Fix Timing** → Code Editor 下載。
只改 TIME 數字(角度、FINE、Acc、WAIT FOR $DI 等其他行原樣保留),可選插入 $T[1] 計時器。
**手動調整**:關掉 Auto-repay,清單列出每個跟不上的動作還差幾 ms(點一下跳過去);
在時間軸上把紅框那段結尾的關鍵幀往後拖,那段就多出時間、下一段變短,總長不變。
關鍵幀編輯 Texturizer 與 Time Fix 共用,Ctrl+Z 可復原,Reset keyframe edits 一鍵還原。
**回 TwinPose 修**:Download list (.csv) 列出每個跟不上的動作:起訖秒數、30fps 幀號、主導軸與角度、
TwinPose 裡目前間隔、最少要給多少(已含 66ms)、要加幾 ms。改完重新匯出再檢查;最後仍需過一次 Time Fix 補 66ms。
**最準的用法是閉環**:跑一次 → 把 $T[1] 填進 Calibrate → 自動出下一版,通常 1–2 次到 ±0.3%。
預設參數由 dance0719 五次實測校正(直出 208.719 → v4 193.422,目標 194.0)。
實測回授調的是「整首再縮短/加長幾秒」(correction,可正可負):偏長會再扣、偏短會加回;
紅框已在 TwinPose 修好(沒有欠時)時一樣有效。實測輸入 ms 或秒皆可;偏離排程 >10% 視為打錯不採用。
CLI:`python calibration/twinpose_timefix.py in.hrb -o out.hrb --timer [--measured TRIM:SEC ...]`

## 黃金樣本變更(2026-11-03)
統一下限 + 帳本閉合後,0904 有 11 行 TIME 重分配(總長不變,飽和段 8→3)。
實測 77.906s 的舊版留在 `examples/0904/golden_FINAL4_measured_77906.hrb`;新版尚待實機複測。

## 操作備忘
- Texturizer 分頁:拖曳菱形改時間(僅 .json 動作檔可編輯;.hrb 為唯讀顯示)
- 點 Acc 力度條 → 輸入數值 Enter(覆寫鍵 = 原始關鍵幀索引,引擎端補償時序)
- 改 worker/py-worker.js 後請將 js/bridge.js 的 `?v=` 加一,避開瀏覽器快取
- 黃金樣本:`python tools/golden_check.py`(需 pyyaml numpy)
