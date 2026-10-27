# TwinPose Texturizer — 規格與執行計畫書

版本 1.0 · 2026-09-02 · Created by Michi Wang · 林峰正實驗室 Computational Choreography Lab

---

## 一、產品定位

TwinPose Texturizer 是 TwinPose 的姊妹工具,負責舞蹈轉譯管線的後半段:TwinPose 從影片擷取「形」(關節角度),Texturizer 把「質」(Energy / Torque / Jerk 指標)與「時」(逐段準時的排程)編進 HIWIN 手臂程式。它以網頁形式部署於 GitHub Pages,所有運算在使用者瀏覽器內完成,檔案不上傳。

一句話描述:**看著舞蹈影片,在時間軸上編輯機械手臂的質感,匯出可直接載入 HRSS 的 .hrb。**

真正的手臂動態驗證交給 HRSS 離線模擬器——本工具不做手臂動畫,以「舞蹈影片 + 預測時間軸」作為編輯時的對照基準。這個分工是刻意的:Texturizer 管「編」(20ms 迭代),HRSS 管「驗」(最終確認)。

## 二、核心架構決策

**決策 1:Pyodide 單一真相源。** 轉譯引擎(texturizer Python 套件)已含全部實測校正常數(PTP_TIME 175% 天花板、CONT 轉角節省 0.3108×100/Acc、66ms FINE 開銷、檔尾換行等)與 41 項回歸測試,實測時序精度 0.17%。網站透過 Pyodide(Python→WASM)直接載入同一份套件執行,**不以 JavaScript 重寫任何判定邏輯**。校正參數更新一次,CLI 與網站同步生效。效能實測基準:84 關鍵幀全管線重算 <50ms,滑桿即時回饋可行。

**決策 2:純靜態、零後端。** GitHub Pages 託管;影片、.hrb、CSV 全部經瀏覽器 File API 讀取,在本機記憶體處理。隱私聲明直接寫在介面上(「Files stay in your browser — nothing is uploaded」)。

**決策 3:v1 吃現有 CSV,影片→指標留給 v2。** 第一版接受實驗室現有分析管線輸出的 SmoothedMetrics CSV;瀏覽器內 MediaPipe 姿態估計 + 白皮書指標計算(EnergyFlow、TransitionTorque、Jerk、AngularIntensity)是 v2 的獨立里程碑,不阻擋 v1 上線。

## 三、功能規格

### 3.1 三步驟工作流(頂列分頁:Keyframes / Metrics / Texture)

三個分頁共用同一組已載入資產與同一條時間軸,只是顯示與可操作的內容不同。

**Step 1 — Keyframes(切點規劃)**

輸入指標 CSV(自動偵測欄位並換算 fps),執行 `plan_keyframes` 演算法:ω 波谷必切、Torque 尖峰必切、其間按累積角位移等量插點、停頓段 max-dt 保底、最小間距 0.35s。輸出切點清單(秒數、30fps 幀號、原因 valley/hit/infill/hold)。

介面提供**核銷清單模式**:右欄列出全部切點,每列含大字幀號與勾選框;點擊任一列,影片自動 seek 至該幀供確認姿勢;已勾選者變綠。此模式直接對應 TwinPose 手動擷取的工作流,防止「滑一格」類錯誤(0904 實案教訓)。三顆規劃參數(disp-step 密度、max-dt 保底、budget 上限)以滑桿暴露。可下載 plan.csv。

**Step 2 — Metrics(指標對照)**

影片與時間軸雙向同步:播放時播放頭跟隨,點擊/拖曳時間軸則影片 seek。三條指標曲線(ω、Torque、Jerk)與影片縮圖膠卷同框顯示,Zoom 滑桿調整水平尺度(1×–8×,縮放中心跟隨播放頭)。本步驟為純觀察模式,供編舞者理解「數據長什麼樣」。

**Step 3 — Texture(質感編輯)**

載入 TwinPose 匯出的動作檔(.hrb 或 .json)後,時間軸 Keyframes 軌顯示所有關鍵幀。按 **Apply Texture** 執行完整管線(align → valleys → classify → texture → budget),之後:

- 關鍵幀以三色標示判定結果:紅 = FINE=1,2(頓)、橘 = FINE=0(逗號)、藍 = CONT(流)。FINE 1 與 2 的區別保留於 tooltip 與匯出碼中,不佔用顏色維度。
- Acc 軌以純色實心條顯示每段力度(30–100%),點擊條可直接改數值(覆寫該段的自動判定,覆寫段加小圓點標記,可一鍵還原)。
- 超出手臂能力的段落在 Keyframes 軌以紅框標示,右欄錯誤清單同步列出(時刻、限制軸、需要/可用時間),點擊跳轉。**使用者可水平拖曳關鍵幀改時間**(吸附至影格),每次拖動即時重算,目標是把錯誤數歸零;Code Editor 在錯誤 >0 時仍可預覽下載,但附警告條。
- 右欄三顆增益滑桿:torque gain(力度對比,繞 Acc 中點展開)、jerk gain(頓感門檻鬆緊)、sensitivity(句點靈敏度)。拖動即重算,對應 CLI 同名旗標。

### 3.2 Code Editor(匯出預覽)

頂列綠色主按鈕開啟。內容:統計列(指令數、錨點/流段、預測實跑時間、Acc 範圍)、警告條(若仍有超標段)、**完整生成碼預覽**(FINE 行與 CONT 行以語意色標示、可捲動)、Back / Download .hrb。下載檔案保證檔尾換行(引擎既有守則,Err01-02-11 教訓)。

### 3.3 專案存檔

- **Local Save**(頂列開關):開啟時每次編輯自動存入瀏覽器(IndexedDB;影片以檔名+雜湊記錄參照,重開時提示重新拖入)。
- **Export / Import**:專案匯出為 `.twtx`(JSON:資產參照與雜湊、關鍵幀時間修改、Acc 覆寫、增益設定、機型、UI 狀態),供備份與換機。命名與行為沿用 TwinPose 的 Local Save / Import / Export 語彙。

### 3.4 機型選擇

右欄摺疊列,預設收起顯示當前機型(Hiwin 1476 · calibrated)。選擇其他機型(1621 / 710 / 1869)載入對應 robot_params;未實測校正的機型以規格估算並顯示「not calibrated — spec estimate」警告。參數檔與引擎同源。

## 四、UI 規格(定稿 = 視覺稿 v6)

### 4.1 版面

```
┌ 頂列:Logo | Keyframes Metrics Texture | LocalSave Import Export saved | Code Editor ┐
├──────────────────────────────────────┬──────────────┤
│ 影片(黑底)                          │ 右欄(炭灰)  │
│ ⏮ Play ⏭(置中)+ 快捷鍵提示        │  ▶Robot(摺疊)│
│ 時間軸(與影片同寬):                │  資產插槽 ×3  │
│   尺標/膠卷/Keyframes/Acc/ω/Torque/Jerk│  增益滑桿 ×3  │
│ Zoom ────  0s—78.04s   Created by MW │  Apply Texture│
│                                      │  錯誤清單     │
└──────────────────────────────────────┴──圖例─────────┘
```

軌道順序固定:編輯對象(Keyframes、Acc)在上,參考曲線在下。視窗縮放時時間軸自動重繪。

### 4.2 設計 tokens

| Token | 值 | 用途 |
|---|---|---|
| 底色 | #000 / 面板 #464646 | 左黑右灰,承襲 TwinPose |
| 主色 | #4CAF50(hover #3E9142) | 主按鈕、播放頭、開關、滑桿、✓ |
| CONT | #3D6BFF | 流(承 TwinPose keyframe 藍) |
| FINE=0 | #E8A33D | 逗號 |
| FINE=1,2 | #E5484D | 頓(同時是錯誤紅的家族色) |
| 按鈕 | 黑區:#262626 圓角 10px;灰區:#5A5A5A 圓角 6px | 兩種,不再增生 |
| 字體 | Helvetica/Arial;等寬僅用於程式碼 | 素顏工程風 |

全部純色不透明;曲線僅實線無面積填色。

### 4.3 互動與快捷鍵

space 播放/暫停;← → 逐格;[ ] 跳前/後一個關鍵幀;拖曳菱形改時間(吸附影格);點時間軸 seek;滾輪+modifier 縮放;Ctrl/Cmd+Z 復原(關鍵幀移動與 Acc 覆寫均入 undo 堆疊)。

## 五、資料格式

| 檔案 | 方向 | 說明 |
|---|---|---|
| .mp4/.webm | 輸入 | 舞蹈影片,僅本機播放 |
| SmoothedMetrics CSV | 輸入 | 現行格式(frameIndex + 白皮書指標欄) |
| .hrb / .json | 輸入 | TwinPose 匯出動作(兩種皆支援,沿用引擎 parser) |
| plan.csv | 輸出 | 切點清單(time_s, frame, reason) |
| .hrb | 輸出 | 成品(含檔尾換行;命名 `{專案}_textured.hrb`) |
| .twtx | 輸出/輸入 | 專案檔(JSON schema v1,含 schema 版號供未來遷移) |

## 六、技術棧與 repo 結構

前端:Vite + TypeScript(不引框架,DOM 直寫——介面元件量小,時間軸本就是自繪 canvas/SVG);時間軸用單一 `<canvas>` 繪製(84+ 關鍵幀與四條曲線在 canvas 上拖曳效能最穩)。引擎:Pyodide 0.26+,texturizer 打包為 wheel 隨站台發佈,Web Worker 中載入避免阻塞 UI。

```
repo/
├─ texturizer/        # Python 引擎(現有,單一真相源)
├─ site/              # 前端(Vite)
│  ├─ src/{timeline, video, bridge(pyodide), store, ui}/
│  └─ public/
├─ .github/workflows/deploy.yml   # build wheel → vite build → Pages
└─ docs/              # 本規格書、FINE_CONT 邏輯等
```

CI 同時跑 pytest(引擎)與前端 e2e 冒煙(Playwright:載入範例三檔 → Apply → 預覽碼與 FINAL4 逐行一致)——**用 0904 實測收斂的成品當黃金樣本**,任何改動若使網站產碼偏離即擋下。

## 七、執行計畫

| 里程碑 | 內容 | 驗收條件 | 估時 |
|---|---|---|---|
| M0 骨架 | repo、CI/Pages 部署、v6 版面靜態實作 | 網址可開,版面同視覺稿 | 2–3 天 |
| M1 播放同步 | 影片載入、時間軸 canvas、雙向 seek、縮放、膠卷縮圖 | 拖時間軸影片跟動,60fps 順暢 | 3–4 天 |
| M2 引擎接入 | Pyodide worker、CSV/HRB 解析、曲線與關鍵幀真資料上軌 | 載入 0904 三檔,曲線與切點正確顯示 | 3–4 天 |
| M3 質感迴圈 | Apply Texture、三色標示、增益滑桿即時重算、錯誤清單 | 拖 jerk gain 菱形變色 <100ms | 3 天 |
| M4 編輯 | 拖關鍵幀改時、Acc 點擊覆寫、undo/redo | 0904 兩個紅段可拖到歸零 | 3–4 天 |
| M5 匯出 | Code Editor 預覽、下載 .hrb、黃金樣本 e2e | 產碼與 FINAL4 逐行一致;HRSS 實載通過 | 2 天 |
| M6 專案 | Local Save 自動存、.twtx Export/Import、機型切換 | 重開瀏覽器狀態還原 | 2–3 天 |
| M7 Step1 | 切點規劃頁、核銷清單模式、plan.csv 下載 | 以 sample3 完整版(149 點)走完擷取流程 | 3 天 |

合計約 4–5 週(單人兼職節奏)。M0–M5 為 **v1.0 可發佈線**;M6–M7 為 v1.1。每個里程碑結束即部署,實驗室成員全程可試用回饋。

**v2 藍圖**(依序):瀏覽器內 MediaPipe → 白皮書指標計算(影片直出 CSV,Step 1 免外部分析);FINE=2 實機定格感參數化;多臂 Sync 指標;`limit_turns` 轉折收攏整合為錯誤修復的一鍵選項。

## 八、風險與對策

**Pyodide 首次載入體積**(~10MB):載入畫面顯示進度 + Service Worker 快取,第二次起秒開。**大影片記憶體**:以 `<video>` 原生解碼、縮圖用 OffscreenCanvas 節流抽取,不整段解入記憶體。**引擎/網站版本漂移**:wheel 版號顯示於介面角落,黃金樣本 e2e 強制對齊。**未校正機型誤用**:非 1476 機型全程顯示警告帶,匯出碼首行註記 `; WARNING: spec-estimated timing`。**HRSS 語法回歸**(韌體更新):黃金樣本實載檢查納入每次上銀更新後的例行程序(沿用 test 系列)。
