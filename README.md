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
- [x] M0 骨架 + 部署
- [x] M1 影片/時間軸雙向同步、縮放、膠卷
- [x] M2(顯示)CSV 曲線、Motion 關鍵幀上軌
- [ ] M2(引擎)Pyodide 首次實測 ← 目前重點
- [ ] M3 質感迴圈 · M4 編輯 · M5 匯出 · M6 專案 · M7 切點規劃頁
