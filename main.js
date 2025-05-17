/* ================= main.js =================
   Element Shoot 6 モード版
   - elements.js から ELEMENTS（1〜118）をインポート
   - レベル 1〜3（重み付き出現）
   - モード A〜F（記号/名前/番号 相互変換）
   - ヒット高さでスコア重み
   - ヒット & ミスをログし、ゲーム終了時に右側パネルへ一覧表示
   ========================================= */

import { ELEMENTS } from "./elements.js";

/* ---------- DOM ショートカット ---------- */
const $      = sel => document.querySelector(sel);
const title  = $("#title");
const game   = $("#game");
const canvas = $("#field");
const ctx    = canvas.getContext("2d");

const modeLab = $("#modeLabel");
const timerEl = $("#timer");
const scoreEl = $("#score");
const livesEl = $("#lives");
const toast   = $("#toast");

const input   = $("#userInput");
const timeIn  = $("#timeInput");
const lifeIn  = $("#lifeInput");

/* ---------- 状態変数 ---------- */
let mode   = "A";          // 選択モード
let level  = 1;            // レベル (1‥3)
let score  = 0;            // 現在スコア
let lives  = Infinity;     // 残機
let infinite = true;       // ライフ無限か
let remain = 60;           // 残り秒数

let elems      = [];       // 画面に落下中の元素
let bullets    = [];       // 発射された弾
let explosions = [];       // 爆発エフェクト
let hits   = [];           // 命中した元素データ
let misses = [];           // 取り逃がした元素データ

let spawnT = 0;            // 出現タイマー
let run    = false;        // ループ稼働フラグ
let prev   = 0;            // 前フレーム時刻
let toastT;                // Toast タイマー ID

/* 定数 */
const SPAWN_INTERVAL = 1200;  // 元素生成間隔 (ms)
const FALL_V         =   70;  // 落下速度 (px/s)
const BULLET_V       = 900;   // px/s  ★ 約 1.8 倍に高速化

/* ---------- ユーティリティ ---------- */
const rand = (a,b)=>Math.random()*(b-a)+a;
const dist = (x1,y1,x2,y2)=>Math.hypot(x1-x2,y1-y2);
const hintStr = d => `No.${d.num} / ${d.sym} / ${d.en} / ${d.ja}`;  // ヒント文字列
const desc = m => ({
  A:"記号→名前",
  B:"記号→番号",
  C:"名前→記号",
  D:"名前→番号",
  E:"番号→名前",
  F:"番号→記号"
}[m]);

/* ---------- レベルごとの重み関数 ---------- */
function weight(num){
  if(level===1) return num<=36 ? 1 : 0;
  if(level===2) return num<=36 ? 1 : (num<=86 ? 2 : 0);
  /* level 3 */ return num<=36 ? 1 : (num<=86 ? 2 : 4);
}

/* ---------- HUD 表示 ---------- */
function updateLives(){
  livesEl.textContent = infinite ? "∞" : "♥".repeat(lives);
}
function showToast(d){
  toast.innerHTML =
    `<strong>No.${d.num}  ${d.sym}</strong><br>`+
    `${d.en} / ${d.ja}<br>`+
    `<em style="color:#ccc">${d.fact}</em>`;
  toast.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(()=>toast.classList.remove("show"), 4000);
}

/* ---------- ゲーム開始 ---------- */
$("#startBtn").onclick = () => {
  mode  = $("input[name='mode']:checked").value;
  level = parseInt($("input[name='level']:checked").value);

  remain = parseInt(timeIn.value) || 60;

  const lifeVal = parseInt(lifeIn.value);
  infinite = !lifeVal;
  lives    = infinite ? Infinity : (lifeVal || 1);
  updateLives();

  score = 0; scoreEl.textContent = "Score 0";
  hits = []; misses = [];

  modeLab.textContent = `MODE ${mode} (${desc(mode)})`;

  title.style.display = "none";
  game .style.display = "flex";

  /* 配列初期化 */
  elems=[]; bullets=[]; explosions=[];
  spawnT = 0; run = true; prev = performance.now();

  requestAnimationFrame(loop);

  input.value=""; input.focus();
};

/* ---------- 停止ボタン ---------- */
$("#stopBtn").onclick = () => endGame("中断");

/* ---------- 入力（IME 対応） ---------- */
input.addEventListener("keydown", e => {
  if(e.key==="Enter") e.preventDefault();   // 既定動作抑止
});
input.addEventListener("keyup", e => {
  if(e.key!=="Enter") return;
  const raw = input.value.trim(); input.value="";
  if(!raw) return;
  const txt = raw.toLowerCase();            // 比較用
  const idx = elems.findIndex(el => matchInput(el.data, txt));
  if(idx !== -1) fireBullet(elems[idx]);
});

/* 入力判定 */
function matchInput(d,txt){
  switch(mode){
    case "A": return [d.en.toLowerCase(), d.ja].includes(txt);   // 記号→名前
    case "B": return (""+d.num) === txt;                         // 記号→番号
    case "C": return d.sym.toLowerCase() === txt;                // 名前→記号
    case "D": return (""+d.num) === txt;                         // 名前→番号
    case "E": return [d.ja, d.en.toLowerCase()].includes(txt);   // 番号→名前
    case "F": return d.sym.toLowerCase() === txt;                // 番号→記号
  }
}

/* ---------- メインループ ---------- */
function loop(t){
  const dt = (t - prev) / 1000;
  prev = t;
  if(run){
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }
}

/* ---------- 更新処理 ---------- */
function update(dt){
  /* タイマー */
  remain -= dt;
  if(remain <= 0){ endGame("時間切れ"); return; }
  timerEl.textContent = `${Math.ceil(remain)}s`;

  /* 元素生成 */
  spawnT += dt * 1000;
  if(spawnT >= SPAWN_INTERVAL){
    spawnElement();
    spawnT = 0;
  }

  /* 落下移動 */
  elems.forEach(e => e.y += FALL_V * dt);

  /* 画面外判定 → ミス */
  elems = elems.filter(e=>{
    if(e.y > canvas.height - 40){
      misses.push(e.data);
      lifeLost();
      return false;
    }
    return true;
  });

  /* 弾移動 & 命中判定 */
  const remove = new Set();
  bullets.forEach(b=>{
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if(dist(b.x,b.y,b.tx,b.ty) < 10){
      remove.add(b);
      hitElement(b.target);
    }
  });
  bullets = bullets.filter(b=> !remove.has(b) && b.y > -30);

  /* 爆発アニメーション更新 */
  explosions.forEach(ex=>{
    ex.life -= dt;
    ex.r    += 120 * dt;
    ex.a     = Math.max(0, ex.life / ex.maxLife);
  });
  explosions = explosions.filter(ex=> ex.life > 0);
}

/* ---------- 描画 ---------- */
function draw(){
  ctx.clearRect(0,0,canvas.width,canvas.height);

  /* 落下元素 */
  ctx.font="24px sans-serif"; ctx.textAlign="center"; ctx.fillStyle="#fff";
  elems.forEach(e=>{
    ctx.fillText(e.display, e.x, e.y);

    /* 画面下半分に来たらヒント表示 */
    /* ===== ヒントを元素のすぐ下に表示（左右はみ出し防止） ===== */
    if (e.y > canvas.height / 2) {
      const h = hintStr(e.data);                 // No. / sym / en / ja

      ctx.font = "16px sans-serif";
      ctx.fillStyle = "#8cf";
      ctx.textAlign = "left";

      const tw = ctx.measureText(h).width;
      const marginY = 22;                        // 元素との縦間隔
      let hx = e.x - tw / 2;                     // 中央揃え
      let hy = e.y + marginY;                    // 基本は下に出す

      /* ─── 左右クランプ ─── */
      if (hx < 0) hx = 0;
      if (hx + tw > canvas.width) hx = canvas.width - tw;

      /* ─── 下端を超えるなら上側に表示 ─── */
      if (hy + 14 > canvas.height) {             // 14px ≒ フォント高さ
        hy = e.y - marginY;
        /* 上側に出した場合も左右再クランプ */
        if (hy < 14) hy = 14;                    // 画面トップに被らないよう
      }

      ctx.fillText(h, hx, hy);

      /* 描画設定を元へ戻す */
      ctx.font = "24px sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "#fff";
    }
  });

  /* 弾 */
  ctx.fillStyle="#f66";
  bullets.forEach(b=>{
    ctx.beginPath(); ctx.arc(b.x,b.y,4,0,Math.PI*2); ctx.fill();
  });

  /* 爆発 */
  explosions.forEach(ex=>{
    ctx.globalAlpha = ex.a;
    ctx.fillStyle = "orange";
    ctx.beginPath();
    ctx.arc(ex.x, ex.y, ex.r, 0, Math.PI*2);
    ctx.fill();
    ctx.globalAlpha = 1;
  });
}

/* ---------- 元素生成 ---------- */
function spawnElement(){
  const pool=[], weights=[];
  ELEMENTS.forEach(d=>{
    const w = weight(d.num);
    if(w){ pool.push(d); weights.push(w); }
  });
  let r = Math.random() * weights.reduce((a,b)=>a+b,0);
  for(let i=0;i<pool.length;i++){
    if((r -= weights[i]) <= 0){
      addFalling(pool[i]);
      return;
    }
  }
}
function addFalling(d){
  let disp;
  switch(mode){
    case "A": disp = d.sym; break;                       // 記号→名前
    case "B": disp = d.sym; break;                       // 記号→番号
    case "C": disp = Math.random()<.5 ? d.ja : d.en; break; // 名前→記号
    case "D": disp = Math.random()<.5 ? d.ja : d.en; break; // 名前→番号
    case "E": case "F": disp = ""+d.num; break;          // 番号起点
  }
  elems.push({data:d, display:disp, x:rand(40,canvas.width-40), y:-20});
}

/* ---------- 弾発射 ---------- */
function fireBullet(target){
  const sx = canvas.width/2, sy = canvas.height - 30;
  const dx = target.x - sx,  dy = target.y - sy;
  const len = Math.hypot(dx,dy);
  bullets.push({
    x:sx, y:sy,
    vx:dx/len*BULLET_V,
    vy:dy/len*BULLET_V,
    tx:target.x, ty:target.y,
    target
  });
}

/* ---------- 命中処理 ---------- */
function hitElement(tar){
  /* 高さ比でスコア 100〜300 */
  const hRate = (canvas.height - tar.y) / canvas.height;
  const add = Math.round(100 + 200 * hRate);
  score += add;
  scoreEl.textContent = `Score ${score}`;

  /* 爆発エフェクト */
  explosions.push({x:tar.x, y:tar.y, r:15, a:1, maxLife:.3, life:.3});
  showToast(tar.data);

  /* ログ & 配列除去 */
  hits.push(tar.data);
  elems.splice(elems.indexOf(tar),1);
}

/* ---------- ライフ ---------- */
function lifeLost(){
  if(infinite) return;
  if(--lives <= 0) endGame("ライフ0");
  else updateLives();
}

/* ---------- ゲーム終了 ---------- */
function endGame(reason){
  run = false;

  /* 結果パネルを Toast に表示 */
  const mkRow = d => `<tr><td>${d.num}</td><td>${d.sym}</td><td>${d.en}</td><td>${d.ja}</td></tr>`;
  const mkTbl = arr=>arr.map(mkRow).join("");
  toast.innerHTML = `
    <h3 style="margin:.2rem 0;color:#f8c53a">RESULT</h3>
    <p>理由: ${reason} ／ Score: <strong>${score}</strong></p>
    <hr>
    <h4 style="margin:.3rem 0">Hit (${hits.length})</h4>
    <table>${mkTbl(hits)}</table>
    <h4 style="margin:.3rem 0">Miss (${misses.length})</h4>
    <table>${mkTbl(misses)}</table>`;
  toast.classList.add("show");
  clearTimeout(toastT);

  title.style.display="flex";
  game .style.display="none";

  /* 次ゲーム用にログを初期化 */
  hits=[]; misses=[];
}
   