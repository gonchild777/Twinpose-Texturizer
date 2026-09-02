# FINE / CONT 判定邏輯 —— 從 CSV 曲線到每一行指令

> texturizer 引擎文件 · 對應 `core/valleys.py`、`core/classify.py`、`core/texture.py`
> 所有門檻在 `params/config.yaml`,增益旋鈕 `--torque-gain` / `--jerk-gain`

## 總覽:一行指令的四個參數,來自四個獨立資料源

```
PTP_TIME P23  FINE=1  TIME=907 msec  Acc=56% ...
   │            │        │             │
   │            │        │             └─ TransitionTorque 欄(第二層之外:力度)
   │            │        └─ 關鍵幀原始間隔(排程,不歸質感層管)
   │            └─ 第二層:dwell + Jerk → FINE 幾號
   └─ 第一層:ω 波谷 → 錨點(FINE)或經過點(CONT)
```

---

## 第一層:這一行是 FINE 還是 CONT?

**資料源:ω 曲線 = `LeftAngularIntensity + RightAngularIntensity`(全身角速度總和)**

物理直覺:ω 掉到谷底的瞬間 = 舞者幾乎不動 = **動作的句點**。
該「到位」的是句點;句點之間的軌跡該「流過去」。

### 步驟

1. **找波谷**(`valleys.py`)
   在 ω 曲線上找局部極小值,兩個過濾條件:
   - 能量低於 `valley.sensitivity` 分位數(預設 45)——排除高能量中的小抖動
   - 相鄰波谷至少隔 `valley.min_gap_s`(0.25s)——近距合併取更低者

2. **對位**(`classify.py`)
   每個波谷找最近的關鍵幀:

   ```
   |關鍵幀時刻 − 波谷時刻| ≤ snap_tolerance_s(0.15s)?
     ├─ 是 → 該關鍵幀升為錨點(ANCHOR)→ 輸出 FINE=n
     └─ 否 → 維持經過點(PASS)      → 輸出 CONT
   ```

### 設計呼應

`plan_keyframes.py` 切點規劃器把 ω 波谷列為「必切」(reason=valley)——
**規劃時的 valley 點,就是轉譯時的 FINE 行**。兩個工具共用同一判準,
所以照規劃擷取的舞,錨點自然對齊,不靠運氣。

---

## 第二層:FINE 幾號?(0=逗號、1=句號、2=硬定格)

**資料源:dwell(ω 在低檔停留多久)+ `Jerk` 欄的尖峰**

- `dwell` 定義:以波谷為中心,ω 連續低於 `omega_low_percentile`(15 分位)的時間長度
- `jerk_hi` 定義:全曲 Jerk 的 `jerk_percentile`(75 分位)門檻

### 判定表(`texture.py::_fine_level`)

| 條件 | 判定 | 舞蹈語意 |
|---|---|---|
| dwell ≥ **0.15s** 且 jerk 尖峰 ≥ jerk_hi | **FINE=2** | 硬定格:停得久、煞得急 |
| dwell ≥ **0.06s** | **FINE=1** | 句號:確實停一下 |
| 其餘(只是路過谷底) | **FINE=0** | 逗號:最短停頓即走 |

### 增益旋鈕

`--jerk-gain g` 把兩個 dwell 門檻與 jerk 門檻同除以 g:

- g > 1 → 門檻放寬 → **更容易升級成頓**(FINE=1/2 變多)
- g < 1 → 更嚴 → 更流

範例:`--jerk-gain 1.5` 讓 0.10s 的短停(原本 FINE=1)有機會升 FINE=2。

---

## 第二層之外:Acc(力度)—— 與 FINE/CONT 正交

**資料源:`TransitionTorque` 欄**

該段 torque 在全曲分佈的位置(`acc_map.low_pct`~`high_pct` 分位)
線性映射到 Acc `min`~`max`(預設 30~100%):

- torque 高 → Acc 100:猛、發力
- torque 低 → Acc 30:柔、綿

`--torque-gain g` 把 Acc 繞分佈中點展開/壓縮:g>1 對比更狠,g<1 更平均。

> 注意:Acc 同時影響 CONT 的轉角時間節省(≈311ms × 100/Acc),
> 引擎會自動補償——調 torque-gain 不會破壞對時。

---

## 實例:0904(78s,84 關鍵幀)

| 統計 | 值 | 解讀 |
|---|---|---|
| 錨點(FINE 行) | 26 | 26 個句讀時刻 |
| 經過點(CONT 行) | 58 | 其餘流過 |
| FINE=1 | 5 | 五個明確句號 |
| FINE=2 | 0 | 引擎認為本舞無硬定格 |
| Acc 範圍 | 30–100% | 力度全域展開 |

「FINE=2 = 0」是否正確,是**編舞判斷**——若影片中某秒確實該硬定格,
即為調 `--jerk-gain` 或個別門檻的依據(把該秒數回報即可)。

---

## 調校流程(給編舞者)

1. 看影片,標出「該頓沒頓 / 頓過頭」的秒數
2. 對照 report timeline 中該秒的判定(anchor? FINE 幾號?)
3. 系統性偏差 → 轉 `--jerk-gain`;個別點 → 調 config 門檻或補切關鍵幀
4. 重跑轉譯(<1s),模擬器複驗

每輪迭代只動質感層,時序(TIME)與形(角度)完全不受影響。
