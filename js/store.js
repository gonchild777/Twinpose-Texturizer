// 全域狀態 + 極簡 pub/sub —— 單一資料流:改狀態 → emit → 各模組重繪
export const state = {
  duration: 0,          // 秒(影片或資料推得)
  time: 0,              // 播放頭
  fps: 30,
  zoom: 1, pan: 0,      // 時間軸視窗:pan = 視窗左緣秒數
  metrics: null,        // {t[], omega[], torque[], jerk[]}
  keyframes: null,      // [{time, angles}]
  texture: null,        // 引擎回傳:{timeline:[{t,role,smooth,acc,time_ms,vel,sat}], warnings, hrb, stats}
  files: { video: null, motion: null, metrics: null },   // 檔名
  gains: { torque: 1.0, jerk: 1.0, sensitivity: 45 },
  plan: null,           // 切點規劃 [{t, frame, reason}]
  motionDoc: null,      // TwinPose JSON 全文件(編輯關鍵幀時間時同步改這裡)
  motionExt: '.json',
  motionRaw: '',        // 動作檔原文(.hrb 編輯時以此為底,只替換 TIME)
  kfOriginal: null,     // 載入時的關鍵幀時間(Reset edits 用)
  accOverrides: {},     // {原始關鍵幀索引: Acc%}
  ramp: { on: false, mode: 'in', start: 0, end: 0 },   // 質感漸變區間
  undo: [], redo: [],
  tab: 'texture',
  timefix: null,        // Time Fix 結果(引擎 fix_timing)
  tfHistory: [],        // [{v, gain, measured_s}] 依版本順序
  tfTimer: true,
  tfSched: null,
  tfAuto: true,
  texOut: { trigger: true, timer: true },   // Texturizer 輸出選項
  texTrim: 0,            // Texturizer 實測回授(秒,+縮短)
  texHistory: [],        // [{v, trim_s, measured_s}]         // Time Fix:自動從寬裕段補回欠時        // 目前檔案的排程長度(s)
};
const subs = {};
export function on(ev, fn){ (subs[ev] ||= []).push(fn); }
export function emit(ev, data){ for (const fn of subs[ev] || []) fn(data); }
export function set(patch){ Object.assign(state, patch); emit('change', patch); }
