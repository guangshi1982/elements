import { ELEMENTS } from "./elements.js";

/* ========= DOM & 基本変数 ========= */
const $=s=>document.querySelector(s);
const title=$("#title"),game=$("#game"),canvas=$("#field"),ctx=canvas.getContext("2d");
const input=$("#userInput"),timeIn=$("#timeInput"),lifeIn=$("#lifeInput");
const modeLab=$("#modeLabel"),timerEl=$("#timer"),scoreEl=$("#score"),livesEl=$("#lives"),toast=$("#toast");

let mode="A",level=1,score=0,lives=Infinity,infinite=true;
let remain=60,elems=[],bullets=[],explosions=[],spawnT=0,run=false,prev=0,toastT;
const spawnInt=1200,fallV=70,bulletV=500;

/* ========= レベルごとの重み ========= */
function w(num){
  if(level==1) return num<=36?1:0;
  if(level==2) return num<=36?1:num<=86?2:0;
  return num<=36?1:num<=86?2:4;
}

/* ========= ユーティリティ ========= */
const r=(a,b)=>Math.random()*(b-a)+a, d=(x1,y1,x2,y2)=>Math.hypot(x1-x2,y1-y2);
const hint = d => `No.${d.num} / ${d.sym} / ${d.en} / ${d.ja}`;
const desc=m=>({A:"記号→名前",B:"記号→番号",C:"名前→記号",D:"名前→番号",E:"番号→名前",F:"番号→記号"}[m]);

/* ========= スタート ========= */
$("#startBtn").onclick=()=>{
  mode=$("input[name='mode']:checked").value;
  level=parseInt($("input[name='level']:checked").value);
  remain=parseInt(timeIn.value)||60;
  const v=parseInt(lifeIn.value);infinite=!v;lives=infinite?Infinity:v||1;updateLives();

  score=0;scoreEl.textContent="Score 0";
  modeLab.textContent=`MODE ${mode} (${desc(mode)})`;
  title.style.display="none";game.style.display="flex";
  elems=[];bullets=[];explosions=[];spawnT=0;run=true;prev=performance.now();
  requestAnimationFrame(loop);
  input.value="";input.focus();
};

$("#stopBtn").onclick=()=>end("中断");
input.addEventListener("keydown",e=>{if(e.key==="Enter")e.preventDefault();});
input.addEventListener("keyup",e=>{if(e.key!=="Enter")return;
  const raw=input.value.trim();input.value="";if(!raw)return;
  const t=raw.toLowerCase();const i=elems.findIndex(el=>check(el.data,t));if(i!==-1)shoot(elems[i]);
});

/* ========= ループ ========= */
function loop(t){const dt=(t-prev)/1000;prev=t;if(run){upd(dt);draw();requestAnimationFrame(loop);}}

/* ========= 更新 ========= */
function upd(dt){
  remain-=dt;if(remain<=0){end("時間切れ");return;}timerEl.textContent=`${Math.ceil(remain)}s`;
  spawnT+=dt*1000;if(spawnT>=spawnInt){spawn();spawnT=0;}
  elems.forEach(e=>e.y+=fallV*dt);
  elems=elems.filter(e=>{if(e.y>canvas.height-40){lifeLost();return false;}return true;});

  const rm=new Set();
  bullets.forEach(b=>{b.x+=b.vx*dt;b.y+=b.vy*dt;
    if(d(b.x,b.y,b.tx,b.ty)<10){rm.add(b);hit(b.target);}});
  bullets=bullets.filter(b=>!rm.has(b)&&b.y>-30);

  explosions.forEach(ex=>{ex.life-=dt;ex.r+=120*dt;ex.a=Math.max(0,ex.life/ex.maxLife);});
  explosions=explosions.filter(ex=>ex.life>0);
}

function hit(tar){
  const hW=(canvas.height-tar.y)/canvas.height;
  const add=Math.round(100+200*hW);
  score+=add;scoreEl.textContent=`Score ${score}`;
  explosions.push({x:tar.x,y:tar.y,r:15,a:1,maxLife:.3,life:.3});
  showToast(tar.data);elems.splice(elems.indexOf(tar),1);
}

/* ========= 描画 ========= */
function draw(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.font="24px sans-serif";ctx.textAlign="center";ctx.fillStyle="#fff";
  elems.forEach(e=>{
    ctx.fillText(e.display,e.x,e.y);
    if(e.y>canvas.height/2){
      ctx.font="16px sans-serif";ctx.fillStyle="#8cf";
      const h=hint(e.data),w=ctx.measureText(h).width+10,m=15;
      let hx=e.x+m,al="left";if(hx+w>canvas.width){hx=e.x-m;al="right";}if(hx<0){hx=e.x+m;al="left";}
      ctx.textAlign=al;ctx.fillText(h,hx,e.y+4);
      ctx.font="24px sans-serif";ctx.textAlign="center";ctx.fillStyle="#fff";
    }
  });
  ctx.fillStyle="#f66";bullets.forEach(b=>{ctx.beginPath();ctx.arc(b.x,b.y,4,0,Math.PI*2);ctx.fill();});
  explosions.forEach(ex=>{ctx.globalAlpha=ex.a;ctx.fillStyle="orange";
    ctx.beginPath();ctx.arc(ex.x,ex.y,ex.r,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;});
}

/* ========= 元素生成 ========= */
function spawn(){
  const pool=[],wt=[];
  ELEMENTS.forEach(d=>{const k=w(d.num);if(k){pool.push(d);wt.push(k);}});
  let r=Math.random()*wt.reduce((a,b)=>a+b,0);
  for(let i=0;i<pool.length;i++){if((r-=wt[i])<=0){addFalling(pool[i]);return;}}
}
function addFalling(d){
  let disp;
  switch(mode){
    case "A":disp=d.sym;break;
    case "B":disp=d.sym;break;
    case "C":disp=Math.random()<.5?d.ja:d.en;break;
    case "D":disp=Math.random()<.5?d.ja:d.en;break;
    case "E":case "F":disp=""+d.num;break;
  }
  elems.push({data:d,display:disp,x:r(40,canvas.width-40),y:-20});
}

/* ========= 弾 ========= */
function shoot(t){
  const sx=canvas.width/2,sy=canvas.height-30,dx=t.x-sx,dy=t.y-sy,l=Math.hypot(dx,dy);
  bullets.push({x:sx,y:sy,vx:dx/l*bulletV,vy:dy/l*bulletV,tx:t.x,ty:t.y,target:t});
}

/* ========= 入力判定 ========= */
function check(d,txt){
  switch(mode){
    case "A":return [d.en.toLowerCase(),d.ja].includes(txt);
    case "B":return (""+d.num)===txt;
    case "C":return d.sym.toLowerCase()===txt;
    case "D":return (""+d.num)===txt;
    case "E":return [d.ja,d.en.toLowerCase()].includes(txt);
    case "F":return d.sym.toLowerCase()===txt;
  }
}
/* ========= Lives / End ========= */
function updateLives(){livesEl.textContent=infinite?"∞":"♥".repeat(lives);}
function lifeLost(){if(infinite)return;if(--lives<=0)end("ライフ0");else updateLives();}
function end(r){run=false;setTimeout(()=>alert(`Game Over (${r})\nScore: ${score}`),20);title.style.display="flex";game.style.display="none";}

/* ========= Toast ========= */
function showToast(d){
  toast.innerHTML = `
    <strong>No.${d.num}  ${d.sym}</strong><br>
    ${d.en} / ${d.ja}<br>
    <em style="color:#ccc">${d.fact}</em>`;
  toast.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(()=>toast.classList.remove("show"), 4000);
}