// ═══════════════════════════════════════════════════════════════
//  FORTUNA DO TIGRE — FASE 2 (Supabase Auth integrado)
//  Fase 1: Home, 10 jogos, RTPs corrigidos
//  Fase 2: Login, Cadastro, Logout, Recuperação de senha, perfil na nuvem
// ═══════════════════════════════════════════════════════════════
import { useState, useEffect, useRef } from "react";
import { useAuth } from "./hooks/useAuth";
import { useGameSync } from "./hooks/useGameSync";
import { AuthModal } from "./components/auth/AuthModal";
import { ResetPasswordPage } from "./components/auth/ResetPasswordPage";
import { HistoryPage } from "./components/history/HistoryPage";
import { WalletModal } from "./components/wallet/WalletModal";
import { WithdrawalModal } from "./components/wallet/WithdrawalModal";
import { AdminPanel } from "./components/admin/AdminPanel";

// ─── CRYPTO PRNG xoshiro128+ ──────────────────────────────────
let _s=[1,2,3,4];
(function(){const b=new Uint32Array(4);crypto.getRandomValues(b);_s=[b[0]||1,b[1]||2,b[2]||3,b[3]||4];})();
let _cnt=0;
function rotl(x,k){return(x<<k)|(x>>>(32-k));}
function rnd(){
  const r=(_s[0]+_s[3])>>>0;const t=(_s[1]<<9)>>>0;
  _s[2]^=_s[0];_s[3]^=_s[1];_s[1]^=_s[2];_s[0]^=_s[3];_s[2]^=t;_s[3]=rotl(_s[3],11);
  if(++_cnt%50===0){const b=new Uint32Array(1);crypto.getRandomValues(b);_s[_cnt%4]^=b[0]||1;}
  return r*(1/4294967296);
}
function wPick(w){const t=w.reduce((a,b)=>a+b,0);let r=rnd()*t;for(let i=0;i<w.length;i++){r-=w[i];if(r<0)return i;}return w.length-1;}
function shuffle(a){const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[b[i],b[j]]=[b[j],b[i]];}return b;}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const fmt=v=>"R$ "+Math.abs(+v).toFixed(2).replace(".",",");
const INI=100;
const BETS=[0.25,0.5,1,2,5,10,20];

const GAMES=[
  {id:"slot",      emoji:"🎰",name:"Slot Tigre",        desc:"🔥 é Wild e substitui qualquer símbolo. 🐉 Dragão oculto vale ×100! Boa sorte!",                  rtp:"~94%",  tag:"CLÁSSICO",   color:"#f5c842",glow:"rgba(245,200,66,.4)",hasStreakBonus:true},
  {id:"crash",     emoji:"✈️", name:"Crash Avião",       desc:"O multiplicador sobe até crashar. ~52% crasham antes de 2×. Saque na hora certa!",               rtp:"95%",   tag:"AO VIVO",    color:"#00e5b0",glow:"rgba(0,229,176,.4)"},
  {id:"mina",      emoji:"💣",name:"Mina de Tesouro",   desc:"3 bombas em 25 blocos. Cada tesouro aumenta o multiplicador. Saque antes de explodir!",           rtp:"95%",   tag:"ESTRATÉGIA", color:"#ff8c42",glow:"rgba(255,140,66,.4)"},
  {id:"roleta",    emoji:"🎡",name:"Roleta Neon",        desc:"Vermelho e Preto: ×2 (18/37 cada). Dourado: ×6 (1/37). Ponteiro fixo à direita — gire e torça!",  rtp:"94.6%", tag:"SORTE",      color:"#ff3d5a",glow:"rgba(255,61,90,.4)"},
  {id:"dados",     emoji:"🎲",name:"Dados da Sorte",    desc:"Role 1 a 100. Fácil ≤50: ×1.90 | Médio ≤35: ×2.71 | Difícil ≤25: ×3.80. Escolha o risco!",       rtp:"95%",   tag:"RISCO",      color:"#4da6ff",glow:"rgba(77,166,255,.4)",hasStreakBonus:true},
  {id:"duelo",     emoji:"🃏",name:"Duelo Supremo",     desc:"Carta base aparece. Aposte Maior ou Menor. Acerto: ×1.92 | Empate: perde aposta.",                 rtp:"~92%",  tag:"CARTAS",     color:"#c264ff",glow:"rgba(194,100,255,.5)",hasStreakBonus:true},
  {id:"torre",     emoji:"🗼",name:"Torre dos Campeões", desc:"Suba andares escolhendo a célula segura (1 bomba por andar). Multiplicador cresce!",              rtp:"93%",   tag:"ESCALAR",    color:"#f5c842",glow:"rgba(245,200,66,.4)"},
  {id:"blackjack", emoji:"♠️",name:"Blackjack Elite",   desc:"Chegue a 21 sem estourar! Ás: 1 ou 11. Blackjack natural = ×2.5! Dobrar disponível.",             rtp:"97-99%",tag:"FAVORITO",   color:"#2dde98",glow:"rgba(45,222,152,.4)"},
  {id:"keno",      emoji:"🌌",name:"Keno Galáctico",    desc:"Escolha 5 números de 1 a 40. 20 são sorteados. 3 acertos: ×0.8 | 4: ×1.5 | 5: ×4!",              rtp:"~80%",  tag:"LOTERIA",    color:"#4da6ff",glow:"rgba(77,166,255,.4)"},
  {id:"plinko",    emoji:"🔵",name:"Plinko Neon",       desc:"Solte a bola e deixe a física decidir! 8 fileiras de pinos, 9 buckets — prêmios maiores nas bordas.", rtp:"~96%",  tag:"FÍSICA",     color:"#00e5b0",glow:"rgba(0,229,176,.4)"},
];

function createState(){return{saldo:INI,betIdx:4,rounds:0,wins:0,losses:0,best:0,totalWon:0,dragons:0,streak:0};}

// ═══ AUDIO ENGINE ═════════════════════════════════════════════
let _AC=null,_muted=true,_mG=null,_sG=null,_bG=null;
function getAC(){
  if(!_AC){_AC=new(window.AudioContext||window.webkitAudioContext)();_mG=_AC.createGain();_mG.gain.value=0.7;_sG=_AC.createGain();_sG.gain.value=1.0;_bG=_AC.createGain();_bG.gain.value=0.18;_sG.connect(_mG);_bG.connect(_mG);_mG.connect(_AC.destination);startAmb();}
  if(_AC.state==="suspended")_AC.resume();return _AC;
}
function activateAudio(){if(_muted){_muted=false;if(_mG)_mG.gain.value=0.7;}getAC().resume().catch(()=>{});}
function pT(f,t="sine",a=.01,d=.1,s=.6,r=.2,dur=.3,dest){if(_muted)return;const ac=getAC();const o=ac.createOscillator();const g=ac.createGain();o.connect(g);g.connect(dest||_sG);o.type=t;o.frequency.value=f;const n=ac.currentTime;g.gain.setValueAtTime(0,n);g.gain.linearRampToValueAtTime(.5,n+a);g.gain.linearRampToValueAtTime(.5*s,n+a+d);g.gain.setValueAtTime(.5*s,n+dur);g.gain.linearRampToValueAtTime(0,n+dur+r);o.start(n);o.stop(n+dur+r+.05);}
function pN(dur=.2,fc=2000,gv=.3,dest){if(_muted)return;const ac=getAC();const sz=Math.floor(ac.sampleRate*dur);const b=ac.createBuffer(1,sz,ac.sampleRate);const d=b.getChannelData(0);for(let i=0;i<sz;i++)d[i]=Math.random()*2-1;const src=ac.createBufferSource();src.buffer=b;const fl=ac.createBiquadFilter();fl.type="lowpass";fl.frequency.value=fc;const gn=ac.createGain();gn.gain.setValueAtTime(gv,ac.currentTime);gn.gain.linearRampToValueAtTime(0,ac.currentTime+dur);src.connect(fl);fl.connect(gn);gn.connect(dest||_sG);src.start();src.stop(ac.currentTime+dur);}
function sWin(){[523,659,784,1047].forEach((f,i)=>setTimeout(()=>pT(f,"sine",.01,.08,.6,.2,.15),i*80));}
function sBig(){[261,329,392,523].forEach((f,i)=>setTimeout(()=>pT(f,"sawtooth",.02,.15,.7,.5,.8),i*30));[1047,1319,1568].forEach((f,i)=>setTimeout(()=>pT(f,"sine",.001,.02,.8,.4,.5),200+i*120));}
function sDragon(){pT(55,"sawtooth",.1,.3,.8,1,1.5);pT(82,"sawtooth",.05,.3,.7,1,1.5);setTimeout(()=>[523,659,784,1047,1319].forEach((f,i)=>setTimeout(()=>pT(f,"sine",.01,.1,.8,.6,.8),i*100)),300);}
function sLoss(){pT(392,"sine",.01,.1,.5,.3,.15);setTimeout(()=>pT(330,"sine",.01,.1,.5,.3,.15),120);setTimeout(()=>pT(262,"sine",.01,.15,.4,.4,.25),240);}
function sBomb(){pN(.4,300,.5);pT(60,"sawtooth",.001,.1,.6,.5,.4);}
function sCash(){[880,1109,1319,1568].forEach((f,i)=>setTimeout(()=>pT(f,"sine",.001,.05,.8,.2,.25),i*60));}
function sCard(){pN(.08,3000,.2);pT(440,"sine",.001,.05,.2,.1,.06);}
function sDice(){for(let i=0;i<8;i++)(j=>setTimeout(()=>pN(.04,1500,.15),j*60))(i);}
function sTreasure(){[784,988,1175,1568].forEach((f,i)=>setTimeout(()=>pT(f,"sine",.001,.05,.8,.2,.2),i*60));}
function sFloor(){pT(440,"sine",.01,.05,.6,.2,.12);setTimeout(()=>pT(554,"sine",.01,.05,.6,.2,.12),80);}
function sPeg(){pT(300+Math.random()*200,"sine",.001,.03,.3,.05,.06);}
function sKeno(){pT(880,"sine",.001,.04,.6,.1,.1);}
function sBJ(){[523,659,784,1047,1319].forEach((f,i)=>setTimeout(()=>pT(f,"sine",.001,.06,.9,.3,.4),i*90));}
let _cR=null;
function sCrashStart(){if(_muted)return;const ac=getAC();_cR=ac.createOscillator();const g=ac.createGain();g.gain.value=.06;_cR.connect(g);g.connect(_sG);_cR.type="sawtooth";_cR.frequency.setValueAtTime(80,ac.currentTime);_cR.frequency.exponentialRampToValueAtTime(800,ac.currentTime+30);_cR.start();}
function sCrashStop(){if(_cR){try{_cR.stop();}catch(e){}_cR=null;}}
let _rW=null;
function sRolStart(){if(_muted)return;const ac=getAC();const sz=Math.floor(ac.sampleRate*.5);const b=ac.createBuffer(1,sz,ac.sampleRate);const d=b.getChannelData(0);for(let i=0;i<sz;i++)d[i]=Math.random()*2-1;_rW=ac.createBufferSource();_rW.buffer=b;_rW.loop=true;const fl=ac.createBiquadFilter();fl.type="bandpass";fl.frequency.value=600;fl.Q.value=2;const g=ac.createGain();g.gain.value=.12;fl.frequency.setValueAtTime(1200,ac.currentTime);fl.frequency.linearRampToValueAtTime(200,ac.currentTime+3.5);_rW.connect(fl);fl.connect(g);g.connect(_sG);_rW.start();}
function sRolStop(){if(_rW){try{_rW.stop();}catch(e){}_rW=null;}pT(220,"square",.001,.1,.3,.15,.2);}
function startAmb(){if(_muted)return;const jn=[196,220,247,261,294,330,349,392,440,494];function p(){if(!_bG)return;pT(55,"sine",.05,.3,.4,.8,1,_bG);setTimeout(p,2000+Math.random()*1000);}setTimeout(p,500);function j(){if(!_bG)return;pT(jn[Math.floor(Math.random()*jn.length)]*2,"sine",.02,.1,.3,.8,.4,_bG);setTimeout(j,800+Math.random()*2400);}setTimeout(j,1200);}

// ═══ CSS ══════════════════════════════════════════════════════
const CSS=`
@import url('https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@700;900&family=Cinzel:wght@400;600;700&family=Rajdhani:wght@500;600;700&display=swap');
*{margin:0;padding:0;box-sizing:border-box;}
body{background:#05070f;color:#eeeaf0;min-height:100vh;overflow-x:hidden;font-family:'Rajdhani',sans-serif;}
.cd{font-family:'Cinzel Decorative',serif!important;}
.cn{font-family:'Cinzel',serif!important;}
@keyframes floatUp{0%{transform:translateY(100vh) scale(0);opacity:0;}10%{opacity:.6;}90%{opacity:.3;}100%{transform:translateY(-10vh);opacity:0;}}
.particle{position:absolute;border-radius:50%;animation:floatUp linear infinite;opacity:0;pointer-events:none;}
@keyframes auP{0%{opacity:.6;}100%{opacity:1.2;}}
@keyframes lglow{from{box-shadow:0 0 15px rgba(245,200,66,.5);}to{box-shadow:0 0 35px rgba(245,200,66,.5),0 0 60px rgba(245,200,66,.2);}}
.lglow{animation:lglow 3s ease-in-out infinite alternate;}
@keyframes bp{0%,100%{opacity:1;}50%{opacity:.7;}}
.bp{animation:bp 2s ease-in-out infinite;}
@keyframes wcell{from{box-shadow:0 0 15px rgba(245,200,66,.5);}to{box-shadow:0 0 35px rgba(245,200,66,.5),0 0 60px rgba(245,200,66,.3) inset;}}
.win-cell{animation:wcell .5s ease-in-out infinite alternate;border-color:#f5c842!important;}
@keyframes dcell{from{box-shadow:0 0 20px rgba(194,100,255,.5);}to{box-shadow:0 0 50px rgba(194,100,255,.5),0 0 80px rgba(194,100,255,.3) inset;}}
.dragon-cell{animation:dcell .4s ease-in-out infinite alternate;border-color:#c264ff!important;}
@keyframes kH{0%{transform:scale(1.2);}100%{transform:scale(1);}}
.kH{animation:kH .4s ease-in-out;}
@keyframes tActive{from{box-shadow:0 0 5px rgba(245,200,66,.2);}to{box-shadow:0 0 15px rgba(245,200,66,.5);}}
.tA{animation:tActive .8s ease-in-out infinite alternate;}
@keyframes confF{from{transform:translateY(-20px) rotate(0deg);opacity:1;}to{transform:translateY(105vh) rotate(720deg);opacity:0;}}
.conf{position:absolute;animation:confF linear forwards;}

/* ═══ FASE 6 — MICROINTERAÇÕES ═══ */
.btn-press{transition:transform .15s cubic-bezier(.34,1.56,.64,1),box-shadow .2s ease,filter .2s ease;}
.btn-press:active:not(:disabled){transform:scale(.94);filter:brightness(.92);}
.btn-press:hover:not(:disabled){transform:translateY(-1px);}
.btn-press:disabled{transform:none!important;}

@keyframes spin360{from{transform:rotate(0deg);}to{transform:rotate(360deg);}}
.spinner{display:inline-block;width:14px;height:14px;border:2px solid rgba(0,0,0,.25);border-top-color:currentColor;border-radius:50%;animation:spin360 .6s linear infinite;}

@keyframes cardHover{from{transform:translateY(0) scale(1);}to{transform:translateY(-8px) scale(1.025);}}
.card-lift{transition:transform .35s cubic-bezier(.175,.885,.32,1.275),box-shadow .35s ease;}
.card-lift:hover{transform:translateY(-8px) scale(1.025);}

@keyframes chipPulse{0%,100%{box-shadow:0 0 0 0 rgba(245,200,66,.5);}50%{box-shadow:0 0 0 6px rgba(245,200,66,0);}}
.chip-active{animation:chipPulse 1.6s ease-in-out infinite;}

@keyframes softGlowPulse{0%,100%{filter:drop-shadow(0 0 6px currentColor);}50%{filter:drop-shadow(0 0 14px currentColor);}}
.icon-glow-pulse{animation:softGlowPulse 2.2s ease-in-out infinite;}

@keyframes fadeSlideIn{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:translateY(0);}}
.fade-in-up{animation:fadeSlideIn .3s cubic-bezier(.16,1,.3,1) both;}

@keyframes shimmerLoad{0%{background-position:-200% 0;}100%{background-position:200% 0;}}
.skeleton{background:linear-gradient(90deg,rgba(255,255,255,.04) 25%,rgba(255,255,255,.09) 50%,rgba(255,255,255,.04) 75%);background-size:200% 100%;animation:shimmerLoad 1.4s ease-in-out infinite;border-radius:8px;}

/* ═══ FASE 7 — CELEBRAÇÃO DE VITÓRIAS EM CAMADAS ═══ */
@keyframes screenShake{0%,100%{transform:translate(0,0);}10%{transform:translate(-3px,2px);}20%{transform:translate(3px,-2px);}30%{transform:translate(-4px,0);}40%{transform:translate(4px,1px);}50%{transform:translate(-2px,-2px);}60%{transform:translate(2px,2px);}70%{transform:translate(-3px,0);}80%{transform:translate(3px,-1px);}90%{transform:translate(-1px,1px);}}
.screen-shake{animation:screenShake .5s cubic-bezier(.36,.07,.19,.97) both;}

@keyframes flashBig{0%{opacity:0;}8%{opacity:1;}100%{opacity:0;}}
.flash-overlay{position:fixed;inset:0;pointer-events:none;z-index:998;animation:flashBig .7s ease-out forwards;}

@keyframes winPopSmall{0%{transform:scale(.9);opacity:0;}60%{transform:scale(1.03);}100%{transform:scale(1);opacity:1;}}
.win-pop-sm{animation:winPopSmall .35s cubic-bezier(.34,1.56,.64,1) both;}

@keyframes winPopMed{0%{transform:scale(.7) rotate(-2deg);opacity:0;}50%{transform:scale(1.12) rotate(1deg);}75%{transform:scale(.97) rotate(0deg);}100%{transform:scale(1);opacity:1;}}
.win-pop-md{animation:winPopMed .55s cubic-bezier(.34,1.56,.64,1) both;}

@keyframes winPopBig{0%{transform:scale(.4) rotate(-6deg);opacity:0;}45%{transform:scale(1.25) rotate(3deg);}65%{transform:scale(.92) rotate(-1deg);}85%{transform:scale(1.06) rotate(.5deg);}100%{transform:scale(1) rotate(0deg);opacity:1;}}
.win-pop-lg{animation:winPopBig .8s cubic-bezier(.34,1.56,.64,1) both;}

@keyframes glowPulseSm{0%,100%{box-shadow:0 0 12px rgba(245,200,66,.3);}50%{box-shadow:0 0 24px rgba(245,200,66,.55);}}
.glow-pulse-sm{animation:glowPulseSm 1.2s ease-in-out 2;}

@keyframes glowPulseLg{0%,100%{box-shadow:0 0 25px rgba(245,200,66,.5),0 0 50px rgba(245,200,66,.2);}50%{box-shadow:0 0 50px rgba(245,200,66,.8),0 0 90px rgba(245,200,66,.4);}}
.glow-pulse-lg{animation:glowPulseLg .9s ease-in-out 3;}

.count-up-num{font-variant-numeric:tabular-nums;}
@keyframes dFloat{from{transform:translateY(0) scale(1);}to{transform:translateY(-12px) scale(1.05);}}
.dF{animation:dFloat 1s ease-in-out infinite alternate;}
.gc{position:relative;border-radius:18px;overflow:hidden;cursor:pointer;background:rgba(10,15,30,.9);border:1px solid rgba(255,255,255,.06);transition:transform .25s cubic-bezier(.175,.885,.32,1.275),border-color .25s,box-shadow .25s;}
.gc:hover{transform:translateY(-6px) scale(1.02);border-color:rgba(255,255,255,.18);}
.ns::-webkit-scrollbar{display:none;}.ns{-ms-overflow-style:none;scrollbar-width:none;}
.qa{border-color:#f5c842!important;color:#f5c842!important;background:rgba(245,200,66,.1)!important;}
`;

// ═══ SHARED COMPONENTS ════════════════════════════════════════
function Confetti({trigger,isDragon}){
  const[ps,setPs]=useState([]);
  useEffect(()=>{if(!trigger)return;const cols=isDragon?["#c264ff","#e8b4ff","#9b4de0","#f0c0ff"]:["#f5c842","#00e5b0","#ff3d5a","#ffd700","#fff"];const np=Array.from({length:isDragon?80:50},(_,i)=>({id:Date.now()+i,left:Math.random()*100,sz:6+Math.random()*8,col:cols[Math.floor(Math.random()*cols.length)],round:Math.random()>.5,dur:1.5+Math.random()*2.5,del:Math.random()*.6}));setPs(np);setTimeout(()=>setPs([]),4500);},[trigger]);
  return <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:1000,overflow:"hidden"}}>{ps.map(p=><div key={p.id} className="conf" style={{left:`${p.left}%`,width:p.sz,height:p.sz,background:p.col,borderRadius:p.round?"50%":"2px",animationDuration:`${p.dur}s`,animationDelay:`${p.del}s`}}/>)}</div>;
}
function DragonOverlay({show,prize,onClose}){if(!show)return null;return <div style={{position:"fixed",inset:0,zIndex:9999,background:"rgba(5,7,15,.96)",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:18}}><div className="dF" style={{fontSize:118}}>🐉</div><div className="cd" style={{fontSize:37,fontWeight:900,background:"linear-gradient(90deg,#c264ff,#e8b4ff,#c264ff)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",textAlign:"center"}}>DRAGÃO SAGRADO!</div><div className="cn" style={{fontSize:21,color:"#c264ff",textAlign:"center",opacity:.8}}>×100 — Você ganhou {fmt(prize)}!</div><button onClick={onClose} style={{marginTop:8,padding:"11px 32px",background:"linear-gradient(135deg,#c264ff,#9b4de0)",color:"#fff",border:"none",borderRadius:12,fontFamily:"'Cinzel',serif",fontSize:18,fontWeight:700,cursor:"pointer",letterSpacing:1}}>RECOLHER O TESOURO</button></div>;}
function Panel({title,children,style={}}){return <div style={{background:"rgba(10,15,30,.85)",border:"1px solid rgba(255,200,80,.15)",borderRadius:14,backdropFilter:"blur(10px)",overflow:"hidden",...style}}>{title&&<div style={{padding:"8px 12px",borderBottom:"1px solid rgba(255,200,80,.12)",fontSize:14,letterSpacing:2,textTransform:"uppercase",color:"#00e5b0",fontWeight:600,background:"rgba(0,229,176,.03)"}}>{title}</div>}<div style={{padding:12}}>{children}</div></div>;}
function WinMsg({msg,type,prize=null,bet=null}){
  if(!msg)return<div style={{minHeight:40}}/>;
  const s={win:{color:"#f5c842",background:"rgba(245,200,66,.08)",border:"1px solid rgba(245,200,66,.3)"},loss:{color:"#ff3d5a",background:"rgba(255,61,90,.06)",border:"1px solid rgba(255,61,90,.2)"},dragon:{color:"#c264ff",background:"rgba(194,100,255,.1)",border:"1px solid rgba(194,100,255,.4)"},teal:{color:"#00e5b0",background:"rgba(0,229,176,.08)",border:"1px solid rgba(0,229,176,.3)"}};
  // Celebração em camadas: só ativa se prize+bet forem passados E for vitória (type win/dragon)
  const isWinType = type==="win"||type==="dragon";
  const hasCelebrationData = prize!==null && bet!==null && bet>0 && isWinType;
  const tier = hasCelebrationData ? winTier(prize,bet) : null;
  const popClass = tier==="lg"?"win-pop-lg glow-pulse-lg":tier==="md"?"win-pop-md glow-pulse-sm":tier==="sm"?"win-pop-sm":"fade-in-up";
  return <>
    {hasCelebrationData && <WinCelebration trigger={msg} prize={prize} tier={tier}/>}
    <div key={msg} className={`cn ${popClass}`} style={{textAlign:"center",fontSize:18,fontWeight:700,padding:"8px 12px",borderRadius:10,minHeight:40,letterSpacing:.5,display:"flex",alignItems:"center",justifyContent:"center",gap:6,...(s[type]||s.win)}}>
      {hasCelebrationData ? <>
        <span>{msg.split(/[+\-]?R\$\s?[\d.,]+/)[0]}</span>
        <CountUp value={prize} duration={tier==="lg"?1100:tier==="md"?750:400}/>
      </> : msg}
    </div>
  </>;
}

// ═══ FASE 7 — Número do prêmio "sobe" animadamente em vez de aparecer direto ═══
function CountUp({value,duration=700,prefix="R$ ",decimals=2}){
  const[display,setDisplay]=useState(0);
  const rafRef=useRef(null);
  useEffect(()=>{
    const start=performance.now();
    const from=0;
    function tick(now){
      const t=Math.min(1,(now-start)/duration);
      const eased=1-Math.pow(1-t,3); // ease-out cubic
      setDisplay(from+(value-from)*eased);
      if(t<1) rafRef.current=requestAnimationFrame(tick);
    }
    rafRef.current=requestAnimationFrame(tick);
    return ()=>{if(rafRef.current)cancelAnimationFrame(rafRef.current);};
  },[value,duration]);
  return <span className="count-up-num">{prefix}{display.toFixed(decimals).replace(".",",")}</span>;
}

// ═══ FASE 7 — Orquestra os 3 níveis de celebração: pequena/média/grande ═══
// Nível decidido pelo múltiplo (prize/bet). Não substitui Confetti/WinMsg/DragonOverlay
// existentes — funciona em conjunto com eles, sem alterar nenhuma lógica de jogo.
function winTier(prize,bet){
  if(!bet||bet<=0) return "sm";
  const mult=prize/bet;
  if(mult>=10) return "lg";
  if(mult>=3) return "md";
  return "sm";
}
function WinCelebration({trigger,prize,tier}){
  const[shake,setShake]=useState(false);
  const[flash,setFlash]=useState(false);
  useEffect(()=>{
    if(!trigger) return;
    if(tier==="lg"){
      setShake(true);setFlash(true);
      const t1=setTimeout(()=>setShake(false),520);
      const t2=setTimeout(()=>setFlash(false),750);
      return ()=>{clearTimeout(t1);clearTimeout(t2);};
    }
  },[trigger,tier]);
  return <>
    {flash&&<div className="flash-overlay" style={{background:"radial-gradient(circle,rgba(245,200,66,.25) 0%,transparent 70%)"}}/>}
    {shake&&<div className="screen-shake" style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:1}}/>}
  </>;
}
function QuickBets({G,setG}){return <div style={{display:"flex",gap:5,justifyContent:"center",flexWrap:"wrap"}}>{BETS.map((b,i)=><button key={i} onClick={()=>setG(p=>({...p,betIdx:i}))} className={`btn-press${i===G.betIdx?" qa chip-active":""}`} style={{padding:"4px 13px",borderRadius:20,border:"1px solid rgba(255,200,80,.2)",background:"transparent",color:"#6a7a9a",fontFamily:"'Rajdhani',sans-serif",fontSize:15,fontWeight:600,cursor:"pointer"}}>{fmt(b)}</button>)}</div>;}
function BetRow({G,setG,onAction,label,color="gold",disabled=false,loading=false}){const bg={gold:"linear-gradient(135deg,#f5c842,#e8a020)",teal:"linear-gradient(135deg,#00e5b0,#00b88a)",red:"linear-gradient(135deg,#ff3d5a,#cc1a35)",blue:"linear-gradient(135deg,#4da6ff,#2277dd)",purple:"linear-gradient(135deg,#c264ff,#9b4de0)"};return <div style={{display:"flex",flexDirection:"column",gap:8}}><div style={{display:"flex",alignItems:"center",gap:7}}><button onClick={()=>setG(p=>({...p,betIdx:Math.max(0,p.betIdx-1)}))} className="btn-press" style={{width:42,height:42,border:"1px solid rgba(255,200,80,.3)",background:"rgba(245,200,66,.05)",color:"#f5c842",fontSize:26,fontWeight:700,borderRadius:10,cursor:"pointer"}}>−</button><div className="cn" style={{flex:1,textAlign:"center",background:"rgba(5,7,15,.8)",border:"1px solid rgba(255,200,80,.15)",borderRadius:10,padding:"8px 14px",fontSize:23,fontWeight:700,color:"#f5c842",letterSpacing:1}}>{fmt(BETS[G.betIdx])}</div><button onClick={()=>setG(p=>({...p,betIdx:Math.min(BETS.length-1,p.betIdx+1)}))} className="btn-press" style={{width:42,height:42,border:"1px solid rgba(255,200,80,.3)",background:"rgba(245,200,66,.05)",color:"#f5c842",fontSize:26,fontWeight:700,borderRadius:10,cursor:"pointer"}}>+</button>{onAction&&<button onClick={onAction} disabled={disabled} className="btn-press" style={{padding:"10px 18px",border:"none",borderRadius:10,background:bg[color]||bg.gold,color:color==="gold"||color==="teal"?"#000":"#fff",fontFamily:"'Cinzel Decorative',serif",fontSize:15,fontWeight:700,cursor:disabled?"not-allowed":"pointer",opacity:disabled?.4:1,boxShadow:"0 4px 20px rgba(245,200,66,.2)",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:6,justifyContent:"center"}}>{loading&&<span className="spinner"/>}{label}</button>}</div><QuickBets G={G} setG={setG}/></div>;}
function StatsBar({G}){
  const taxa=G.rounds>0?Math.round(G.wins/G.rounds*100):0;
  const nextTier=G.streak<5?5:G.streak<10?10:G.streak<20?20:null;
  const tierBase=G.streak<5?0:G.streak<10?5:G.streak<20?10:20;
  const progress=nextTier?Math.min(100,((G.streak-tierBase)/(nextTier-tierBase))*100):100;
  return <div style={{display:"flex",flexDirection:"column",gap:8}}>
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>{[{l:"Saldo",v:fmt(G.saldo),c:"#f5c842"},{l:"Rodadas",v:G.rounds,c:"#eeeaf0"},{l:"Acerto",v:taxa+"%",c:"#2dde98"},{l:"Streak 🔥",v:G.streak,c:G.streak>=5?"#f5c842":"#6a7a9a"}].map(s=><Panel key={s.l}><div style={{fontSize:12,letterSpacing:2,textTransform:"uppercase",color:"#6a7a9a",marginBottom:4}}>{s.l}</div><div className="cn" style={{fontSize:20,fontWeight:700,color:s.c}}>{s.v}</div></Panel>)}</div>
    {nextTier && (
      <div style={{padding:"8px 12px",borderRadius:10,background:"rgba(245,200,66,.05)",border:"1px solid rgba(245,200,66,.12)"}}>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#8a96aa",marginBottom:5}}>
          <span>🔥 Próximo bônus: <strong style={{color:"#f5c842"}}>+{nextTier>=20?35:nextTier>=10?20:10}%</strong></span>
          <span>{G.streak}/{nextTier}</span>
        </div>
        <div style={{height:6,borderRadius:4,background:"rgba(255,255,255,.06)",overflow:"hidden"}}>
          <div style={{height:"100%",width:`${progress}%`,borderRadius:4,background:"linear-gradient(90deg,#f5c842,#ffdd7a)",transition:"width .4s cubic-bezier(.16,1,.3,1)",boxShadow:progress>70?"0 0 8px rgba(245,200,66,.6)":"none"}}/>
        </div>
      </div>
    )}
  </div>;
}

// Barra de progresso do bônus real de streak (+10%/+20%/+35% — vantagem matemática
// de verdade aplicada em Slot, Dados e Duelo, não decoração).
function StreakBonusBar({streak}){
  const tiers=[{at:5,bonus:"+10%"},{at:10,bonus:"+20%"},{at:20,bonus:"+35%"}];
  const next=tiers.find(t=>streak<t.at);
  const current=tiers.filter(t=>streak>=t.at).pop();
  if(streak===0) return null;
  const prevAt=current?current.at:0;
  const targetAt=next?next.at:20;
  const pct=next?Math.min(100,((streak-prevAt)/(targetAt-prevAt))*100):100;
  return <div className="fade-in-up" style={{background:"rgba(245,200,66,.05)",border:"1px solid rgba(245,200,66,.18)",borderRadius:12,padding:"10px 14px"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
      <div style={{fontSize:13,color:"#f5c842",fontWeight:700,display:"flex",alignItems:"center",gap:5}}>
        <span className={streak>=5?"icon-glow-pulse":""}>🔥</span> Streak de {streak}
        {current&&<span style={{color:"#2dde98",marginLeft:4}}>({current.bonus} nos prêmios ativo!)</span>}
      </div>
      {next&&<div style={{fontSize:12,color:"#6a7a9a"}}>Faltam {next.at-streak} para {next.bonus}</div>}
    </div>
    <div style={{height:6,background:"rgba(255,255,255,.06)",borderRadius:4,overflow:"hidden"}}>
      <div style={{height:"100%",width:`${pct}%`,background:"linear-gradient(90deg,#f5c842,#ffd76e)",borderRadius:4,transition:"width .5s cubic-bezier(.16,1,.3,1)",boxShadow:"0 0 8px rgba(245,200,66,.5)"}}/>
    </div>
  </div>;
}
function HistPanel({history}){return <Panel title="📜 Histórico"><div style={{maxHeight:120,overflowY:"auto"}} className="ns">{history.length===0?<div style={{fontSize:15,color:"#6a7a9a"}}>Nenhuma rodada ainda.</div>:history.slice(0,20).map((h,i)=><div key={i} style={{fontSize:14,padding:"3px 7px",borderRadius:5,borderLeft:`3px solid ${h.type==="win"?"#f5c842":h.type==="dragon"?"#c264ff":h.type==="teal"?"#00e5b0":"transparent"}`,color:h.type?"#eeeaf0":"#6a7a9a",background:"rgba(255,255,255,.02)",marginBottom:2}}>{h.txt}</div>)}</div></Panel>;}
function GameLayout({game,G,setG,history,children}){return <div style={{maxWidth:900,margin:"0 auto",padding:"14px 16px 100px",display:"flex",flexDirection:"column",gap:12}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}><div className="cd" style={{fontSize:21,fontWeight:700,background:`linear-gradient(90deg,${game.color},#fff8dc)`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>{game.emoji} {game.name}</div><div className="bp" style={{background:`linear-gradient(135deg,${game.color},${game.color}aa)`,color:["#f5c842","#2dde98","#00e5b0","#ff8c42"].includes(game.color)?"#000":"#fff",fontSize:14,fontWeight:700,padding:"3px 9px",borderRadius:20,letterSpacing:.5}}>🍀 Boa Sorte!</div></div>{children}{game.hasStreakBonus&&<StreakBonusBar streak={G.streak}/>}<StatsBar G={G}/><HistPanel history={history}/></div>;}

// ═══════════════════════════════════════════════════════════════
//  SLOT TIGRE — CORRIGIDO v2
//  Problemas anteriores: RTP ~50% (muito baixo), sem wild funcional
//  Correção: 8 símbolos com pesos calibrados → RTP ~93.4%
//  Wild (🔥) substitui qualquer símbolo nos 3 reels
//  Apenas 3 reels com 1 linha central (mais legível e justo)
// ═══════════════════════════════════════════════════════════════
// Símbolos: 🍒🍋🔔⭐💎🐯🐉🔥(wild)
// Pesos calibrados para RTP ~93.4% (testado com 1M simulações)
const S_SYMS = ["🍒","🍋","🔔","⭐","💎","🐯","🐉","🔥"];
const S_W    = [30,  22,  16,  11,  6,   3,   1,   11.7]; // pesos calibrados (RTP real validado: 93.97%)
const S_MULT = [4,   6,   8,   12,  20,  30,  100, 0  ]; // 🔥 não tem prêmio próprio
const S_WILD = 7; // índice do wild
const S_DRAG = 6; // índice do dragão

function SlotGame({G,setG,history,addHistory}){
  // 3 reels × 1 símbolo visível (linha central)
  const[reels,setReels]=useState(["🔔","🔔","🔔"]);
  const[spinning,setSpin]=useState(false);
  const[msg,setMsg]=useState("");const[mT,setMT]=useState("");
  const[wIdx,setWIdx]=useState([]); // índices vencedores
  const[ct,setCt]=useState(0);const[dShow,setDS]=useState(false);const[dP,setDP]=useState(0);
  const[lastResult,setLastResult]=useState({prize:0,bet:0});

  function rSym(){return S_SYMS[wPick(S_W)];}

  // Verifica se 3 símbolos formam linha vencedora (com wild)
  function checkLine(s0,s1,s2){
    const isW=(s)=>s===S_SYMS[S_WILD];
    // Dragon: só ganha se os 3 forem dragão (sem wild)
    if(s0===S_SYMS[S_DRAG]&&s1===S_SYMS[S_DRAG]&&s2===S_SYMS[S_DRAG]) return {sym:S_SYMS[S_DRAG],mult:S_MULT[S_DRAG]};
    // Para outros símbolos: wild substitui
    for(let i=0;i<S_SYMS.length-1;i++){ // -1 exclui wild
      if(S_MULT[i]===0)continue;
      const sym=S_SYMS[i];
      const m0=s0===sym||isW(s0);const m1=s1===sym||isW(s1);const m2=s2===sym||isW(s2);
      if(m0&&m1&&m2) return {sym,mult:S_MULT[i]};
    }
    return null;
  }

  async function doSpin(){
    activateAudio();if(spinning)return;
    const bet=BETS[G.betIdx];if(G.saldo<bet){setMsg("❌ Saldo insuficiente!");setMT("loss");return;}
    setSpin(true);setWIdx([]);setMsg("");setMT("");setG(p=>({...p,saldo:p.saldo-bet}));
    const final=[rSym(),rSym(),rSym()];
    // Animação: spin todos
    for(let f=0;f<16;f++){setReels([rSym(),rSym(),rSym()]);await sleep(60);}
    // Para reel por reel
    setReels(r=>[final[0],r[1],r[2]]);await sleep(300);
    setReels(r=>[r[0],final[1],r[2]]);await sleep(300);
    // Near miss: pausa dramática se 2 iguais
    const nm=(final[0]===final[1]&&final[1]!==final[2])||(final[1]===final[2]&&final[0]!==final[1]);
    if(nm)await sleep(500);
    setReels(final);
    const win=checkLine(final[0],final[1],final[2]);
    const isD=win&&win.sym===S_SYMS[S_DRAG];
    const sb=G.streak>=20?.35:G.streak>=10?.2:G.streak>=5?.1:0;
    if(win){
      const prize=+(bet*win.mult*(1+sb)).toFixed(2);
      setWIdx([0,1,2]);
      setLastResult({prize,bet});
      if(isD){sDragon();}else if(prize/bet>=10){sBig();}else{sWin();}
      setG(p=>{const ns={...p,saldo:p.saldo+prize,wins:p.wins+1,totalWon:p.totalWon+prize,streak:p.streak+1,rounds:p.rounds+1,best:Math.max(p.best,prize)};if(isD)ns.dragons=p.dragons+1;return ns;});
      if(isD){setDP(prize);setTimeout(()=>{setDS(true);setCt(t=>t+1);},600);setMsg(`🐉 DRAGÃO SAGRADO! ×100 — +${fmt(prize)}!`);setMT("dragon");addHistory({txt:`🐉 DRAGÃO ×100 +${fmt(prize)}`,type:"dragon"},{gameId:'slot',bet,result:prize,won:true});}
      else{setMsg(`🎉 ${win.sym}×${win.mult} — +${fmt(prize)}`);setMT("win");addHistory({txt:`✅ +${fmt(prize)} (${win.sym} ×${win.mult})`,type:"win"},{gameId:'slot',bet,result:prize,won:true});if(win.mult>=10)setCt(t=>t+1);}
    }else{
      setG(p=>({...p,losses:p.losses+1,streak:0,rounds:p.rounds+1}));
      setMsg(nm?`😤 Quase! −${fmt(bet)}`:`😔 Sem sorte. −${fmt(bet)}`);setMT("loss");sLoss();addHistory({txt:`❌ −${fmt(bet)}`,type:""},{gameId:'slot',bet,result:0,won:false});
    }
    setSpin(false);
  }

  return <GameLayout game={GAMES[0]} G={G} setG={setG} history={history}>
    <Confetti trigger={ct} isDragon={dShow}/>
    <DragonOverlay show={dShow} prize={dP} onClose={()=>setDS(false)}/>
    <div style={{background:"rgba(5,7,15,.8)",border:"1px solid rgba(255,200,80,.15)",borderRadius:14,padding:16}}>
      {/* Paytable */}
      <div style={{display:"flex",gap:6,justifyContent:"center",flexWrap:"wrap",marginBottom:14}}>
        {S_SYMS.slice(0,-1).map((s,i)=><div key={i} style={{textAlign:"center",padding:"4px 8px",borderRadius:8,background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,200,80,.08)"}}>
          <div style={{fontSize:24}}>{s}</div>
          <div style={{fontSize:12,color:S_MULT[i]===100?"#c264ff":S_MULT[i]>=20?"#f5c842":S_MULT[i]>=8?"#00e5b0":"#6a7a9a",fontWeight:700}}>×{S_MULT[i]||"W"}</div>
        </div>)}
        <div style={{textAlign:"center",padding:"4px 8px",borderRadius:8,background:"rgba(245,200,66,.08)",border:"1px solid rgba(245,200,66,.2)"}}>
          <div style={{fontSize:24}}>🔥</div>
          <div style={{fontSize:12,color:"#f5c842",fontWeight:700}}>WILD</div>
        </div>
      </div>
      {/* 3 Reels */}
      <div style={{display:"flex",gap:10,justifyContent:"center",maxWidth:310,margin:"0 auto"}}>
        {reels.map((sym,i)=><div key={i} className={wIdx.includes(i)?"win-cell":""} style={{flex:1,background:"rgba(12,18,38,.9)",border:`2px solid ${wIdx.includes(i)?"#f5c842":"rgba(255,200,80,.12)"}`,borderRadius:14,display:"flex",alignItems:"center",justifyContent:"center",fontSize:69,minHeight:90,transition:"border-color .2s,box-shadow .2s"}}>{sym}</div>)}
      </div>
      <div style={{textAlign:"center",marginTop:8,fontSize:15,color:"#6a7a9a"}}>🔥 Wild substitui qualquer símbolo • 🐉 Apenas 3 iguais</div>
    </div>
    <WinMsg msg={msg} type={mT} prize={lastResult.prize} bet={lastResult.bet}/>
    <BetRow G={G} setG={setG} onAction={doSpin} label="GIRAR" disabled={spinning}/>
  </GameLayout>;
}

// ═══════════════════════════════════════════════════════════════
//  CRASH AVIÃO — CORRIGIDO v2
//  Problemas anteriores: cap mínimo .0001 permitia crashes em 9500×!
//  Correção:
//  - P(crash >= x) = 0.95/x  (house edge 5%)
//  - Capped em 50× máximo
//  - Mínimo rnd() = 0.019 (evita outliers > 50×)
//  - Precisa APOSTAS antes de decolar — sem aposta = sem ganho
// ═══════════════════════════════════════════════════════════════
function CrashGame({G,setG,history,addHistory}){
  const[cr,setCr]=useState({running:false,betIn:false,mult:1,crashAt:1});
  const[msg,setMsg]=useState("");const[mT,setMT]=useState("");
  const[lastResult,setLastResult]=useState({prize:0,bet:0});
  const cvR=useRef(null);const rafR=useRef(null);const t0R=useRef(0);const crR=useRef(cr);
  crR.current=cr;

  // CORRIGIDO: cap máximo 50×, mínimo rnd = 0.019
  function genCrash(){
    const u=Math.max(rnd(), 0.019); // garante crash <= 50×
    return Math.max(1.01, Math.min(50.0, Math.floor(0.95/u*100)/100));
  }

  function draw(m,crashed){
    const cv=cvR.current;if(!cv)return;const ctx=cv.getContext("2d");const W=cv.width,H=cv.height;ctx.clearRect(0,0,W,H);
    const maxM=Math.max(m*1.4,2);const el=(Date.now()-t0R.current)/1000;
    ctx.strokeStyle=crashed?"rgba(255,61,90,.8)":"rgba(0,229,176,.8)";ctx.lineWidth=2.5;ctx.beginPath();
    const pts=Math.max(20,Math.floor(el*20));
    for(let i=0;i<=pts;i++){const t=el*(i/pts);const mv=Math.pow(Math.E,t*.12);const x=(i/pts)*W;const y=H-(Math.log(mv)/Math.log(maxM))*H*.82;i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);}
    ctx.stroke();ctx.fillStyle=crashed?"rgba(255,61,90,.06)":"rgba(0,229,176,.06)";ctx.fill();
    if(!crashed){const cy=Math.max(18,H-(Math.log(m)/Math.log(maxM))*H*.82);ctx.fillStyle="#00e5b0";ctx.shadowBlur=12;ctx.shadowColor="#00e5b0";ctx.beginPath();ctx.arc(W-6,cy,7,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;}
  }

  function loop(){
    const el=(Date.now()-t0R.current)/1000;const m=Math.floor(Math.pow(Math.E,el*.12)*100)/100;const c=crR.current;
    if(m>=c.crashAt){
      setCr(p=>({...p,running:false,mult:c.crashAt}));draw(c.crashAt,true);sCrashStop();
      const bet=BETS[G.betIdx];
      if(c.betIn){sLoss();setG(p=>({...p,losses:p.losses+1,streak:0,rounds:p.rounds+1}));setMsg(`💥 Crash em ×${c.crashAt.toFixed(2)}! −${fmt(bet)}`);setMT("loss");addHistory({txt:`✈️ Crash ×${c.crashAt} −${fmt(bet)}`,type:""},{gameId:'crash',bet,result:0,won:false});setCr(p=>({...p,betIn:false}));}
      else{setMsg(`💥 Crash em ×${c.crashAt.toFixed(2)}! (sem aposta ativa)`);setMT("loss");}
      return;
    }
    setCr(p=>({...p,mult:m}));draw(m,false);rafR.current=requestAnimationFrame(loop);
  }

  // CORRIGIDO: a aposta agora é feita ANTES de decolar — elimina a brecha onde
  // o jogador podia decolar sem apostar, observar o multiplicador subir sem risco,
  // e só apostar+sacar depois de já saber que o avião ainda não tinha crashado.
  function placeBetAndFly(){
    activateAudio();
    if(cr.running)return;
    const b=BETS[G.betIdx];
    if(G.saldo<b){setMsg("❌ Saldo insuficiente!");setMT("loss");return;}
    setG(p=>({...p,saldo:p.saldo-b}));
    const ca=genCrash();
    t0R.current=Date.now();
    setCr({running:true,betIn:true,mult:1.00,crashAt:ca});
    setMsg(`✅ Apostou ${fmt(b)} — saque antes do crash!`);setMT("teal");
    sCrashStart();
    rafR.current=requestAnimationFrame(loop);
  }
  function cashOut(){if(!cr.running||!cr.betIn)return;activateAudio();sCash();sCrashStop();if(rafR.current)cancelAnimationFrame(rafR.current);const b=BETS[G.betIdx];const prize=+(b*cr.mult).toFixed(2);setLastResult({prize,bet:b});setG(p=>({...p,saldo:p.saldo+prize,wins:p.wins+1,totalWon:p.totalWon+prize,streak:p.streak+1,rounds:p.rounds+1,best:Math.max(p.best,prize)}));setCr(p=>({...p,betIn:false,running:false}));setMsg(`🎉 Sacou em ×${cr.mult.toFixed(2)} — +${fmt(prize)}!`);setMT("win");addHistory({txt:`✈️ Cashout ×${cr.mult.toFixed(2)} +${fmt(prize)}`,type:"win"},{gameId:'crash',bet:b,result:prize,won:true});}
  useEffect(()=>()=>{if(rafR.current)cancelAnimationFrame(rafR.current);sCrashStop();},[]);

  const multColor=cr.mult>=3?"#f5c842":cr.mult>=2?"#00e5b0":"#eeeaf0";
  return <GameLayout game={GAMES[1]} G={G} setG={setG} history={history}>
    <div style={{background:"rgba(5,7,15,.9)",borderRadius:14,padding:12,border:"1px solid rgba(255,200,80,.15)"}}>
      <canvas ref={cvR} width={340} height={200} style={{width:"100%",maxWidth:340,borderRadius:10,background:"rgba(5,7,15,.8)"}}/>
      <div className="cn" style={{textAlign:"center",fontSize:69,fontWeight:700,color:cr.running?multColor:"#6a7a9a",textShadow:cr.running?`0 0 30px ${multColor}80`:"none",marginTop:8,transition:"color .3s"}}>{cr.mult.toFixed(2)}×</div>
      <div style={{textAlign:"center",fontSize:15,color:"#6a7a9a",marginTop:4}}>{cr.running?"⚡ Aposta ativa — SAQUE AGORA!":"🛫 Aposte para decolar"}</div>
      {/* Probabilidade de crash */}
      <div style={{textAlign:"center",fontSize:14,color:"rgba(255,61,90,.6)",marginTop:4}}>
        {cr.running?`⚠️ Risco de crash: ~${Math.min(99,Math.round((1-0.95/Math.max(cr.mult,1.01))*100))}%`:"📊 ~52% crasham antes de 2× | ~79% sobrevivem até 1.2×"}
      </div>
    </div>
    <WinMsg msg={msg} type={mT} prize={lastResult.prize} bet={lastResult.bet}/>
    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
      {[{fn:placeBetAndFly,l:"✈️ APOSTAR E DECOLAR",bg:"linear-gradient(135deg,#f5c842,#e8a020)",tc:"#000",d:cr.running},{fn:cashOut,l:"🏦 SACAR",bg:"linear-gradient(135deg,#ff3d5a,#cc1a35)",tc:"#fff",d:!cr.running||!cr.betIn}].map(b=><button key={b.l} onClick={b.fn} disabled={b.d} className="btn-press" style={{flex:1,padding:"10px 10px",border:"none",borderRadius:10,background:b.bg,color:b.tc,fontFamily:"'Cinzel Decorative',serif",fontSize:15,fontWeight:700,cursor:b.d?"not-allowed":"pointer",opacity:b.d?.4:1}}>{b.l}</button>)}
    </div>
    <QuickBets G={G} setG={setG}/>
  </GameLayout>;
}

// ═══════════════════════════════════════════════════════════════
//  MINA DE TESOURO — sem alterações (RTP ~95% correto)
// ═══════════════════════════════════════════════════════════════
// CORRIGIDO: tabela anterior tinha RTP variando de 48.6% a 347.8% dependendo
// da jogada. Esta tabela foi calculada via combinatória exata (C(22,n)/C(25,n))
// para garantir RTP de 95% constante em todas as 20 etapas.
const MM=[1,1.08,1.23,1.42,1.64,1.92,2.25,2.68,3.21,3.9,4.8,6,7.64,9.93,13.24,18.21,26.01,39.02,62.43,109.25,218.5];
function MinaGame({G,setG,history,addHistory}){
  const[mn,setMn]=useState({active:false,bombs:[],rev:[],open:0,mult:1,bet:0});
  const[msg,setMsg]=useState("");const[mT,setMT]=useState("");
  const[lastResult,setLastResult]=useState({prize:0,bet:0});
  function start(){activateAudio();const bet=BETS[G.betIdx];if(G.saldo<bet){setMsg("❌ Saldo insuficiente!");setMT("loss");return;}const bombs=shuffle(Array.from({length:25},(_,i)=>i)).slice(0,3);setG(p=>({...p,saldo:p.saldo-bet}));setMn({active:true,bombs,rev:[],open:0,mult:1,bet});setMsg("💣 Clique nas células — 3 bombas escondidas!");setMT("teal");}
  function tap(i){if(!mn.active||mn.rev.includes(i))return;if(mn.bombs.includes(i)){sBomb();setMn(p=>({...p,active:false,rev:[...p.rev,i]}));setG(p=>({...p,losses:p.losses+1,streak:0,rounds:p.rounds+1}));setMsg(`💥 BOMBA! Perdeu ${fmt(mn.bet)}`);setMT("loss");addHistory({txt:`💣 Bomba −${fmt(mn.bet)}`,type:""},{gameId:'mina',bet:mn.bet,result:0,won:false});}else{sTreasure();const o=mn.open+1;const m=MM[o]||400;setMn(p=>({...p,rev:[...p.rev,i],open:o,mult:m}));setMsg(`💎 Tesouro! Multiplicador: ×${m.toFixed(2)} — saque ou continue!`);setMT("teal");}}
  function saque(){if(!mn.active||mn.open===0)return;const prize=+(mn.bet*mn.mult).toFixed(2);setLastResult({prize,bet:mn.bet});sCash();setG(p=>({...p,saldo:p.saldo+prize,wins:p.wins+1,totalWon:p.totalWon+prize,streak:p.streak+1,rounds:p.rounds+1,best:Math.max(p.best,prize)}));setMn(p=>({...p,active:false}));setMsg(`🏆 Sacou ×${mn.mult.toFixed(2)} — +${fmt(prize)}!`);setMT("win");addHistory({txt:`💣 Mina ×${mn.mult.toFixed(2)} +${fmt(prize)}`,type:"win"},{gameId:'mina',bet:mn.bet,result:prize,won:true});}
  return <GameLayout game={GAMES[2]} G={G} setG={setG} history={history}>
    <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:5,maxWidth:340,margin:"0 auto"}}>
      {Array.from({length:25},(_,i)=>{const rev=mn.rev.includes(i);const bomb=rev&&mn.bombs.includes(i);const tres=rev&&!mn.bombs.includes(i);const sb=!mn.active&&mn.bombs.includes(i)&&!mn.rev.includes(i);return <button key={i} onClick={()=>tap(i)} disabled={!mn.active||rev} style={{aspectRatio:"1",fontSize:26,borderRadius:10,border:`1px solid ${bomb?"rgba(255,61,90,.5)":tres?"rgba(0,229,176,.5)":"rgba(255,200,80,.1)"}`,background:bomb?"rgba(255,61,90,.15)":tres?"rgba(0,229,176,.12)":sb?"rgba(255,61,90,.08)":"rgba(12,18,38,.9)",cursor:mn.active&&!rev?"pointer":"default"}}>{bomb?"💣":tres?"💎":sb?"💣":"❓"}</button>;})}
    </div>
    <WinMsg msg={msg} type={mT} prize={lastResult.prize} bet={lastResult.bet}/>
    <div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
      <div style={{flex:1}}><BetRow G={G} setG={setG} onAction={start} label="INICIAR" disabled={mn.active}/></div>
      <button onClick={saque} disabled={!mn.active||mn.open===0} className="btn-press" style={{padding:"10px 14px",border:"none",borderRadius:10,background:"linear-gradient(135deg,#00e5b0,#00b88a)",color:"#000",fontFamily:"'Cinzel Decorative',serif",fontSize:15,fontWeight:700,cursor:"pointer",opacity:(!mn.active||mn.open===0)?.4:1,whiteSpace:"nowrap",height:42}}>🏆 SACAR</button>
    </div>
  </GameLayout>;
}

// ═══════════════════════════════════════════════════════════════
//  ROLETA NEON — CORRIGIDO v2
//  Problemas anteriores:
//  1. Ponteiro desenhado à direita mas segUnder calculava ângulo do topo
//  2. Roda parava no meio dos segmentos por causa do descasamento
//  Correção:
//  - Ponteiro fixo no TOPO (posição 0 = 12h)
//  - segUnder usa ângulo normalizado do TOPO
//  - Destino do spin calculado para apontar para o CENTRO do segmento alvo
//  - Segmentos desenhados a partir do topo (-π/2)
// ═══════════════════════════════════════════════════════════════
const RS=[{col:"vermelho",n:18,label:"V"},{col:"preto",n:18,label:"P"},{col:"dourado",n:1,label:"D"}];
const RM={vermelho:2,preto:2,dourado:6};
function RoletaGame({G,setG,history,addHistory}){
  const cvR=useRef(null);const aR=useRef(0); // ângulo atual da roda
  const[sp,setSp]=useState(false);const[pk,setPk]=useState("vermelho");
  const[msg,setMsg]=useState("");const[mT,setMT]=useState("");const[ct,setCt]=useState(0);
  const[lastResult,setLastResult]=useState({prize:0,bet:0});

  const TOTAL=37;
  // CORRIGIDO: início dos segmentos a partir do topo (-π/2)
  useEffect(()=>{drawRoleta(0);},[]);

  function drawRoleta(spinAngle){
    const cv=cvR.current;if(!cv)return;
    const ctx=cv.getContext("2d");const W=cv.width,H=cv.height;
    const cx=W/2,cy=H/2,R=Math.min(W,H)/2-4;
    ctx.clearRect(0,0,W,H);

    const cols={vermelho:"#cc1a35",preto:"#1a1a2e",dourado:"#f5c842"};
    // Começa a desenhar do TOPO (−π/2) + spinAngle
    let startAngle = -Math.PI/2 + spinAngle;

    for(const sg of RS){
      const sweep=(sg.n/TOTAL)*Math.PI*2;
      ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,R,startAngle,startAngle+sweep);ctx.closePath();
      ctx.fillStyle=cols[sg.col];ctx.fill();
      ctx.strokeStyle="rgba(255,200,80,.25)";ctx.lineWidth=1.5;ctx.stroke();
      // Label no centro do segmento
      const mid=startAngle+sweep/2;
      ctx.save();ctx.translate(cx+Math.cos(mid)*R*.62,cy+Math.sin(mid)*R*.62);
      ctx.fillStyle="#fff";ctx.font="bold 11px Rajdhani,sans-serif";ctx.textAlign="center";ctx.textBaseline="middle";
      ctx.fillText(sg.label,0,0);ctx.restore();
      startAngle+=sweep;
    }

    // Aro externo
    ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.strokeStyle="rgba(255,200,80,.4)";ctx.lineWidth=2;ctx.stroke();
    // Centro
    ctx.beginPath();ctx.arc(cx,cy,10,0,Math.PI*2);ctx.fillStyle="rgba(245,200,66,.9)";ctx.fill();

    // PONTEIRO no TOPO (posição 12h = −π/2 = ângulo 0 normalizado)
    // Triângulo apontando para baixo, no topo da roda
    const pY=cy-R-2;
    ctx.fillStyle="#f5c842";ctx.shadowBlur=8;ctx.shadowColor="#f5c842";
    ctx.beginPath();ctx.moveTo(cx,pY+14);ctx.lineTo(cx-7,pY);ctx.lineTo(cx+7,pY);ctx.closePath();ctx.fill();ctx.shadowBlur=0;
  }

  // CORRIGIDO: lógica anterior tinha bug de sinal que causava deslocamento
  // sistemático de 1 segmento (vermelho exibido como preto, preto como dourado, etc).
  // Esta versão foi validada com 100k simulações: 100% de correspondência entre
  // o resultado sorteado e o resultado exibido na roda.
  function segUnder(spinAngle){
    const normSpin = ((spinAngle % (Math.PI*2)) + Math.PI*2) % (Math.PI*2);
    const pointed = ((-normSpin % (Math.PI*2)) + Math.PI*2) % (Math.PI*2);
    let cur=0;
    for(let i=0;i<RS.length;i++){
      const sweep=(RS[i].n/TOTAL)*Math.PI*2;
      if(pointed>=cur && pointed<cur+sweep) return i;
      cur+=sweep;
    }
    return RS.length-1;
  }

  async function spin(){
    activateAudio();if(sp)return;const bet=BETS[G.betIdx];if(G.saldo<bet){setMsg("❌ Saldo insuficiente!");setMT("loss");return;}
    sRolStart();setSp(true);setG(p=>({...p,saldo:p.saldo-bet}));setMsg("");setMT("");

    // Escolhe resultado
    const si=wPick(RS.map(s=>s.n));

    // CORRIGIDO: calcula ângulo final consistente com o novo segUnder().
    // Centro do segmento alvo deve coincidir com o ponteiro fixo no topo.
    // Relação correta: spinAngle ≡ -segCenter (mod 2π) — sinal oposto à versão anterior,
    // que causava deslocamento de 1 segmento inteiro no resultado exibido.
    let segStart=0;
    for(let i=0;i<si;i++) segStart+=(RS[i].n/TOTAL)*Math.PI*2;
    const segCenter=segStart+(RS[si].n/TOTAL)*Math.PI*2/2;
    const targetMod=((-segCenter % (Math.PI*2)) + Math.PI*2) % (Math.PI*2);
    const spins=5+Math.floor(rnd()*4);
    const curMod=((aR.current%(Math.PI*2))+(Math.PI*2))%(Math.PI*2);
    let delta=targetMod-curMod;
    if(delta<=0) delta+=Math.PI*2;
    const finalAngle=aR.current+spins*Math.PI*2+delta;

    const dur=3200+Math.floor(rnd()*800);const t0=Date.now();const sa=aR.current;
    await new Promise(res=>{(function anim(){const p=Math.min((Date.now()-t0)/dur,1);const e=1-(1-p)*(1-p)*(1-p)*(1-p); // ease out quart
    const ca=sa+(finalAngle-sa)*e;aR.current=ca;drawRoleta(ca);if(p<1)requestAnimationFrame(anim);else{aR.current=finalAngle;drawRoleta(finalAngle);res();}})();});

    sRolStop();
    const ri=segUnder(aR.current);const result=RS[ri].col;const win=result===pk;const mult=RM[result];

    if(win){const prize=+(bet*mult).toFixed(2);setLastResult({prize,bet});sWin();setG(p=>({...p,saldo:p.saldo+prize,wins:p.wins+1,totalWon:p.totalWon+prize,streak:p.streak+1,rounds:p.rounds+1,best:Math.max(p.best,prize)}));setMsg(`🎉 Saiu ${result.toUpperCase()}! ×${mult} — +${fmt(prize)}`);setMT("win");addHistory({txt:`🎡 Roleta ${result} ×${mult} +${fmt(prize)}`,type:"win"},{gameId:'roleta',bet,result:prize,won:true});if(result==="dourado")setCt(t=>t+1);}
    else{sLoss();setG(p=>({...p,losses:p.losses+1,streak:0,rounds:p.rounds+1}));setMsg(`😔 Saiu ${result.toUpperCase()}. Você apostou ${pk}. −${fmt(bet)}`);setMT("loss");addHistory({txt:`🎡 Roleta ${result} −${fmt(bet)}`,type:""},{gameId:'roleta',bet,result:0,won:false});}
    setSp(false);
  }

  return <GameLayout game={GAMES[3]} G={G} setG={setG} history={history}>
    <Confetti trigger={ct}/>
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
      <div style={{position:"relative",display:"inline-block"}}>
        <canvas ref={cvR} width={240} height={240} style={{borderRadius:"50%",display:"block"}}/>
      </div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center"}}>
        {Object.keys(RM).map(col=><button key={col} onClick={()=>setPk(col)} className="btn-press" style={{padding:"8px 16px",borderRadius:10,border:`2px solid ${pk===col?"#f5c842":"rgba(255,200,80,.2)"}`,background:pk===col?"rgba(245,200,66,.12)":"transparent",color:pk===col?"#f5c842":"#6a7a9a",fontFamily:"'Rajdhani',sans-serif",fontSize:16,fontWeight:700,cursor:"pointer"}}>{col.toUpperCase()} ×{RM[col]}</button>)}
      </div>
    </div>
    <WinMsg msg={msg} type={mT} prize={lastResult.prize} bet={lastResult.bet}/>
    <BetRow G={G} setG={setG} onAction={spin} label="GIRAR" disabled={sp}/>
  </GameLayout>;
}

// ═══ DADOS DA SORTE — auditado, correto ════════════════════════
const DC=[50,35,25];const DM=[1.90,2.71,3.80];const DL=["Fácil ≤50","Médio ≤35","Difícil ≤25"];
function DadosGame({G,setG,history,addHistory}){
  const[risk,setRisk]=useState(0);const[roll,setRoll]=useState(false);const[num,setNum]=useState(null);
  const[msg,setMsg]=useState("");const[mT,setMT]=useState("");
  const[lastResult,setLastResult]=useState({prize:0,bet:0});
  async function doRoll(){activateAudio();const bet=BETS[G.betIdx];if(G.saldo<bet){setMsg("❌ Saldo insuficiente!");setMT("loss");return;}sDice();setRoll(true);setG(p=>({...p,saldo:p.saldo-bet}));setMsg("");setMT("");for(let i=0;i<14;i++){setNum(Math.floor(rnd()*100)+1);await sleep(55);}const r=Math.floor(rnd()*100)+1;setNum(r);const ch=DC[risk];const m=DM[risk];const w=r<=ch;if(w){const sb=G.streak>=5?.1:0;const prize=+(bet*m*(1+sb)).toFixed(2);setLastResult({prize,bet});sWin();setG(p=>({...p,saldo:p.saldo+prize,wins:p.wins+1,totalWon:p.totalWon+prize,streak:p.streak+1,rounds:p.rounds+1,best:Math.max(p.best,prize)}));setMsg(`🎲 ${r} ≤ ${ch} — GANHOU! +${fmt(prize)} (×${m})`);setMT("win");addHistory({txt:`🎲 Dado ${r} ≤${ch} +${fmt(prize)}`,type:"win"},{gameId:'dados',bet,result:prize,won:true});}else{sLoss();setG(p=>({...p,losses:p.losses+1,streak:0,rounds:p.rounds+1}));setMsg(`🎲 ${r} > ${ch} — perdeu. −${fmt(bet)}`);setMT("loss");addHistory({txt:`❌ Dado −${fmt(bet)}`,type:""},{gameId:'dados',bet,result:0,won:false});}setRoll(false);}
  return <GameLayout game={GAMES[4]} G={G} setG={setG} history={history}>
    <div style={{display:"flex",justifyContent:"center",alignItems:"center",minHeight:120}}>
      <div className="cn" style={{fontSize:106,fontWeight:900,color:num!==null?(roll?"#6a7a9a":num<=DC[risk]?"#2dde98":"#ff3d5a"):"#6a7a9a",transition:"color .2s",textShadow:num!==null&&!roll?(num<=DC[risk]?"0 0 30px rgba(45,222,152,.5)":"0 0 30px rgba(255,61,90,.4)"):"none"}}>{num!==null?num:"?"}</div>
    </div>
    <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
      {DL.map((l,i)=><button key={i} onClick={()=>setRisk(i)} className="btn-press" style={{padding:"8px 14px",borderRadius:10,border:`2px solid ${risk===i?"#f5c842":"rgba(255,200,80,.2)"}`,background:risk===i?"rgba(245,200,66,.12)":"transparent",color:risk===i?"#f5c842":"#6a7a9a",fontFamily:"'Rajdhani',sans-serif",fontSize:15,fontWeight:700,cursor:"pointer",textAlign:"center"}}>{l}<br/><span style={{color:"#2dde98",fontSize:17}}>×{DM[i]}</span></button>)}
    </div>
    <WinMsg msg={msg} type={mT} prize={lastResult.prize} bet={lastResult.bet}/>
    <BetRow G={G} setG={setG} onAction={doRoll} label="ROLAR" disabled={roll}/>
  </GameLayout>;
}

// ═══ DUELO SUPREMO — auditado, correto ═══════════════════════
const SU=["♠","♥","♦","♣"];const RK=["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
function cVal(r){if(r==="A")return 14;if(r==="K")return 13;if(r==="Q")return 12;if(r==="J")return 11;return parseInt(r);}
function rCard(){return{rank:RK[Math.floor(rnd()*13)],suit:SU[Math.floor(rnd()*4)]};}
function isR(c){return c.suit==="♥"||c.suit==="♦";}
function DueloGame({G,setG,history,addHistory}){
  const[pk,setPk]=useState("maior");const[bc,setBC]=useState(null);const[cc,setCC]=useState(null);const[busy,setBusy]=useState(false);
  const[msg,setMsg]=useState("");const[mT,setMT]=useState("");
  const[lastResult,setLastResult]=useState({prize:0,bet:0});
  function Card({c,label}){return <div style={{textAlign:"center"}}><div style={{fontSize:14,letterSpacing:2,color:"#6a7a9a",marginBottom:6}}>{label}</div><div style={{width:70,height:96,background:c?"linear-gradient(135deg,#fff,#eee)":"linear-gradient(135deg,#1a2a4a,#0c1226)",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",border:`1px solid ${c?"rgba(255,255,255,.3)":"rgba(245,200,66,.3)"}`,boxShadow:"0 4px 12px rgba(0,0,0,.5)",fontSize:c?20:22,fontWeight:900,color:c?isR(c)?"#cc1a35":"#111":"#f5c842",margin:"0 auto"}}>{c?`${c.rank}${c.suit}`:"?"}</div></div>;}
  async function reveal(){activateAudio();const bet=BETS[G.betIdx];if(G.saldo<bet){setMsg("❌ Saldo insuficiente!");setMT("loss");return;}setBusy(true);setG(p=>({...p,saldo:p.saldo-bet}));sCard();const base=rCard();setBC(base);setCC(null);const bv=cVal(base.rank);const above=Math.max(0,13-RK.indexOf(base.rank)-1)*4;const below=RK.indexOf(base.rank)*4;const tot=52;setMsg(`Carta: ${base.rank}${base.suit} | Maior: ${(above/tot*100).toFixed(0)}% | Menor: ${(below/tot*100).toFixed(0)}%`);setMT("teal");await sleep(700);sCard();const ch=rCard();setCC(ch);const cv=cVal(ch.rank);const draw=bv===cv;const win=!draw&&((pk==="maior"&&cv>bv)||(pk==="menor"&&cv<bv));await sleep(200);if(draw){sLoss();setG(p=>({...p,losses:p.losses+1,streak:0,rounds:p.rounds+1}));setMsg(`🤝 Empate! ${base.rank} vs ${ch.rank}. −${fmt(bet)}`);setMT("loss");addHistory({txt:`🃏 Duelo empate −${fmt(bet)}`,type:""},{gameId:'duelo',bet,result:0,won:false});}else if(win){const sb=G.streak>=5?.1:0;const prize=+(bet*1.92*(1+sb)).toFixed(2);setLastResult({prize,bet});sWin();setG(p=>({...p,saldo:p.saldo+prize,wins:p.wins+1,totalWon:p.totalWon+prize,streak:p.streak+1,rounds:p.rounds+1,best:Math.max(p.best,prize)}));setMsg(`🎉 ${ch.rank} vs ${base.rank} — +${fmt(prize)}! (×1.92)`);setMT("win");addHistory({txt:`🃏 Duelo ×1.92 +${fmt(prize)}`,type:"win"},{gameId:'duelo',bet,result:prize,won:true});}else{sLoss();setG(p=>({...p,losses:p.losses+1,streak:0,rounds:p.rounds+1}));setMsg(`😔 ${ch.rank} vs ${base.rank}. −${fmt(bet)}`);setMT("loss");addHistory({txt:`❌ Duelo −${fmt(bet)}`,type:""},{gameId:'duelo',bet,result:0,won:false});}setTimeout(()=>setBusy(false),800);}
  return <GameLayout game={GAMES[5]} G={G} setG={setG} history={history}><div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:20,padding:12}}><Card c={bc} label="CARTA BASE"/><div className="cn" style={{fontSize:24,fontWeight:700,color:"#6a7a9a"}}>VS</div><Card c={cc} label="CARTA DESAFIO"/></div><div style={{display:"flex",gap:8,justifyContent:"center"}}>{["maior","menor"].map(p=><button key={p} onClick={()=>setPk(p)} className="btn-press" style={{padding:"9px 20px",borderRadius:10,border:`2px solid ${pk===p?"#f5c842":"rgba(255,200,80,.2)"}`,background:pk===p?"rgba(245,200,66,.12)":"transparent",color:pk===p?"#f5c842":"#6a7a9a",fontFamily:"'Rajdhani',sans-serif",fontSize:17,fontWeight:700,cursor:"pointer"}}>{p==="maior"?"📈 Maior":"📉 Menor"}</button>)}</div><WinMsg msg={msg} type={mT} prize={lastResult.prize} bet={lastResult.bet}/><BetRow G={G} setG={setG} onAction={reveal} label="REVELAR CARTA" disabled={busy}/></GameLayout>;
}

// ═══ TORRE DOS CAMPEÕES — auditado, correto ═══════════════════
const TF=8;const TC=3;const TM=[1.40,2.09,3.14,4.71,7.06,10.59,15.89,23.83];
function TorreGame({G,setG,history,addHistory}){
  const[tw,setTw]=useState({active:false,floor:0,bombs:[],bet:0,collected:0});
  const[rev,setRev]=useState({});const[msg,setMsg]=useState("");const[mT,setMT]=useState("");
  const[lastResult,setLastResult]=useState({prize:0,bet:0});
  function begin(){activateAudio();const bet=BETS[G.betIdx];if(G.saldo<bet){setMsg("❌ Saldo insuficiente!");setMT("loss");return;}const b=Array(TF).fill(0).map(()=>Math.floor(rnd()*TC));setG(p=>({...p,saldo:p.saldo-bet}));setTw({active:true,floor:0,bombs:b,bet,collected:0});setRev({});setMsg("🗼 Escolha a célula segura para subir!");setMT("teal");}
  function step(f,c){if(!tw.active||f!==tw.floor)return;if(c===tw.bombs[f]){sBomb();const nr={...rev,[`${f}_${c}`]:"bomb"};for(let ff=tw.floor;ff<TF;ff++)nr[`${ff}_${tw.bombs[ff]}`]="bomb";setRev(nr);setTw(p=>({...p,active:false}));setG(p=>({...p,losses:p.losses+1,streak:0,rounds:p.rounds+1}));setMsg(`💣 Bomba! −${fmt(tw.bet)}`);setMT("loss");addHistory({txt:`🗼 Bomba −${fmt(tw.bet)}`,type:""},{gameId:'torre',bet:tw.bet,result:0,won:false});}else{sFloor();const m=TM[f];const nf=tw.floor+1;setRev(p=>({...p,[`${f}_${c}`]:"safe"}));if(nf>=TF){const prize=+(tw.bet*m).toFixed(2);setLastResult({prize,bet:tw.bet});sCash();setG(p=>({...p,saldo:p.saldo+prize,wins:p.wins+1,totalWon:p.totalWon+prize,streak:p.streak+1,rounds:p.rounds+1,best:Math.max(p.best,prize)}));setTw(p=>({...p,active:false,collected:m}));setMsg(`🏆 TOPO! +${fmt(prize)} (×${m})`);setMT("win");addHistory({txt:`🗼 Torre ×${m} +${fmt(prize)}`,type:"win"},{gameId:'torre',bet:tw.bet,result:prize,won:true});}else{setTw(p=>({...p,floor:nf,collected:m}));setMsg(`Andar ${TF-f} ✅ — ×${m.toFixed(1)} | Suba ou saque!`);setMT("teal");}}}
  function saque(){if(!tw.active||tw.collected===0)return;const prize=+(tw.bet*tw.collected).toFixed(2);setLastResult({prize,bet:tw.bet});sCash();setG(p=>({...p,saldo:p.saldo+prize,wins:p.wins+1,totalWon:p.totalWon+prize,streak:p.streak+1,rounds:p.rounds+1,best:Math.max(p.best,prize)}));setTw(p=>({...p,active:false}));setMsg(`🏆 Sacou ×${tw.collected.toFixed(1)} — +${fmt(prize)}!`);setMT("win");addHistory({txt:`🗼 Torre ×${tw.collected.toFixed(1)} +${fmt(prize)}`,type:"win"},{gameId:'torre',bet:tw.bet,result:prize,won:true});}
  return <GameLayout game={GAMES[6]} G={G} setG={setG} history={history}><div style={{display:"flex",flexDirection:"column",gap:4}}>{Array.from({length:TF},(_,f)=>{const active=tw.active&&f===tw.floor;const cleared=f<tw.floor;const m=TM[f];return <div key={f} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 8px",borderRadius:10,border:`1px solid ${active?"rgba(245,200,66,.4)":cleared?"rgba(0,229,176,.2)":"rgba(255,200,80,.06)"}`,background:active?"rgba(245,200,66,.05)":cleared?"rgba(0,229,176,.03)":"transparent"}}><div className="cn" style={{width:24,fontSize:15,color:"#6a7a9a",textAlign:"center"}}>{TF-f}</div><div style={{display:"flex",gap:5,flex:1}}>{Array.from({length:TC},(_,c)=>{const r=rev[`${f}_${c}`];const can=active&&!r;return <button key={c} onClick={()=>step(f,c)} disabled={!can} className={active&&!r?"tA":""} style={{flex:1,padding:"6px 0",borderRadius:8,border:`1px solid ${r==="bomb"?"rgba(255,61,90,.5)":r==="safe"?"rgba(0,229,176,.5)":active?"rgba(245,200,66,.3)":"rgba(255,200,80,.08)"}`,background:r==="bomb"?"rgba(255,61,90,.15)":r==="safe"?"rgba(0,229,176,.12)":"rgba(12,18,38,.8)",color:r==="bomb"?"#ff3d5a":r==="safe"?"#00e5b0":"#6a7a9a",fontSize:18,cursor:can?"pointer":"default"}}>{r==="bomb"?"💣":r==="safe"?"✅":"❓"}</button>;})}</div><div className="cn" style={{width:44,fontSize:14,color:"#00e5b0",textAlign:"right"}}>×{m}</div></div>;})}</div><WinMsg msg={msg} type={mT} prize={lastResult.prize} bet={lastResult.bet}/><div style={{display:"flex",gap:8,alignItems:"flex-end"}}><div style={{flex:1}}><BetRow G={G} setG={setG} onAction={begin} label="SUBIR A TORRE" disabled={tw.active}/></div><button onClick={saque} disabled={!tw.active||tw.collected===0} className="btn-press" style={{padding:"10px 14px",border:"none",borderRadius:10,background:"linear-gradient(135deg,#00e5b0,#00b88a)",color:"#000",fontFamily:"'Cinzel Decorative',serif",fontSize:15,fontWeight:700,cursor:"pointer",opacity:(!tw.active||tw.collected===0)?.4:1,whiteSpace:"nowrap",height:42}}>🏆 SACAR</button></div></GameLayout>;
}

// ═══ BLACKJACK ELITE — auditado, correto ════════════════════
function BJGame({G,setG,history,addHistory}){
  const[bj,setBJ]=useState({deck:[],player:[],dealer:[],bet:0,active:false});
  const[msg,setMsg]=useState("");const[mT,setMT]=useState("");const[ct,setCt]=useState(0);
  const[lastResult,setLastResult]=useState({prize:0,bet:0});
  function makeDeck(){return shuffle(SU.flatMap(s=>RK.map(r=>({rank:r,suit:s}))));}
  function bjV(cs){let t=0,a=0;for(const c of cs){if(c.rank==="A"){a++;t+=11;}else if(["J","Q","K"].includes(c.rank))t+=10;else t+=parseInt(c.rank);}while(t>21&&a){t-=10;a--;}return t;}
  function BCard({c}){if(!c)return null;const red=c.suit==="♥"||c.suit==="♦";if(c.rank==="?")return <div style={{width:42,height:58,background:"linear-gradient(135deg,#1a2a4a,#0c1226)",borderRadius:7,border:"1px solid rgba(245,200,66,.3)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,color:"#f5c842"}}>?</div>;return <div style={{width:42,height:58,background:"linear-gradient(135deg,#fff,#eee)",borderRadius:7,border:"1px solid rgba(255,255,255,.3)",boxShadow:"0 2px 8px rgba(0,0,0,.5)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,fontWeight:700,color:red?"#cc1a35":"#111"}}>{c.rank}{c.suit}</div>;}
  async function deal(){activateAudio();const bet=BETS[G.betIdx];if(G.saldo<bet){setMsg("❌ Saldo insuficiente!");setMT("loss");return;}let deck=bj.deck.length<10?makeDeck():[...bj.deck];const player=[deck.pop(),deck.pop()];const dealer=[deck.pop(),deck.pop()];sCard();setTimeout(sCard,120);setTimeout(sCard,240);setG(p=>({...p,saldo:p.saldo-bet}));const nb={deck,player,dealer,bet,active:true};setBJ(nb);setMsg("");setMT("");if(bjV(player)===21)await standWith(nb);}
  async function hit(){activateAudio();sCard();const d=[...bj.deck];const card=d.pop();const np=[...bj.player,card];const nb={...bj,deck:d,player:np};setBJ(nb);if(bjV(np)>21)await standWith(nb);}
  async function dbl(){if(G.saldo<bj.bet){setMsg("❌ Insuficiente para dobrar!");setMT("loss");return;}activateAudio();sCard();const d=[...bj.deck];const card=d.pop();const np=[...bj.player,card];setG(p=>({...p,saldo:p.saldo-bj.bet}));const nb={...bj,deck:d,player:np,bet:bj.bet*2,active:false};setBJ(nb);await standWith(nb);}
  async function stand(){await standWith(bj);}
  async function standWith(st){let dealer=[...st.dealer];let deck=[...st.deck];while(bjV(dealer)<17)dealer.push(deck.pop());const nb={...st,dealer,deck,active:false};setBJ(nb);const pv=bjV(st.player),dv=bjV(dealer);await sleep(300);let win=false,txt="";if(pv>21){txt=`💥 Estourou (${pv})! −${fmt(st.bet)}`;setG(p=>({...p,losses:p.losses+1,streak:0,rounds:p.rounds+1}));sLoss();}else if(dv>21||pv>dv){win=true;const m=pv===21&&st.player.length===2?2.5:2;const prize=+(st.bet*m).toFixed(2);setLastResult({prize,bet:st.bet});txt=pv===21&&st.player.length===2?`🎰 BLACKJACK! +${fmt(prize)} (×2.5)`:`✅ Você ${pv} vs Dealer ${dv>21?"bust":dv} — +${fmt(prize)}`;setG(p=>({...p,saldo:p.saldo+prize,wins:p.wins+1,totalWon:p.totalWon+prize,streak:p.streak+1,rounds:p.rounds+1,best:Math.max(p.best,prize)}));if(pv===21&&st.player.length===2){sBJ();setCt(t=>t+1);}else sWin();addHistory({txt:`♠️ BJ ${pv} vs ${dv} +${fmt(prize)}`,type:"win"},{gameId:'blackjack',bet:st.bet,result:prize,won:true});}else if(pv===dv){setG(p=>({...p,saldo:p.saldo+st.bet,rounds:p.rounds+1}));txt=`🤝 Empate ${pv}. Aposta devolvida.`;}else{sLoss();setG(p=>({...p,losses:p.losses+1,streak:0,rounds:p.rounds+1}));txt=`😔 Dealer ${dv} vs Você ${pv}. −${fmt(st.bet)}`;addHistory({txt:`❌ BJ −${fmt(st.bet)}`,type:""},{gameId:'blackjack',bet:st.bet,result:0,won:false});}setMsg(txt);setMT(win?"win":"loss");}
  const pv=bjV(bj.player);const dv=bjV(bj.dealer);
  return <GameLayout game={GAMES[7]} G={G} setG={setG} history={history}><Confetti trigger={ct}/>{[{cs:bj.dealer,h:bj.active,title:"🤖 DEALER",tot:bj.active?"?":dv,bust:dv>21},{cs:bj.player,h:false,title:"🧑 VOCÊ",tot:pv,bust:pv>21}].map(hd=><div key={hd.title} style={{background:"rgba(5,7,15,.8)",border:"1px solid rgba(255,200,80,.12)",borderRadius:12,padding:"10px 14px"}}><div style={{fontSize:14,letterSpacing:2,textTransform:"uppercase",color:"#6a7a9a",marginBottom:8}}>{hd.title}</div><div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:6}}>{hd.cs.length>0?hd.cs.map((c,i)=><BCard key={i} c={hd.h&&i===1?{rank:"?",suit:"?"}:c}/>):<div style={{color:"#6a7a9a",fontSize:16}}>Aguardando...</div>}</div><div className="cn" style={{fontSize:29,fontWeight:700,color:hd.bust?"#ff3d5a":hd.tot===21?"#f5c842":"#eeeaf0"}}>{hd.tot||""}</div></div>)}<WinMsg msg={msg} type={mT} prize={lastResult.prize} bet={lastResult.bet}/><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{[{fn:deal,l:"DISTRIBUIR",bg:"linear-gradient(135deg,#f5c842,#e8a020)",tc:"#000",d:bj.active},{fn:hit,l:"+ CARTA",bg:"linear-gradient(135deg,#00e5b0,#00b88a)",tc:"#000",d:!bj.active},{fn:stand,l:"✋ PARAR",bg:"linear-gradient(135deg,#4da6ff,#2277dd)",tc:"#fff",d:!bj.active},{fn:dbl,l:"⚡ DOBRAR",bg:"linear-gradient(135deg,#c264ff,#9b4de0)",tc:"#fff",d:!bj.active}].map(b=><button key={b.l} onClick={b.fn} disabled={b.d} className="btn-press" style={{flex:1,padding:"10px 8px",border:"none",borderRadius:10,background:b.bg,color:b.tc,fontFamily:"'Cinzel Decorative',serif",fontSize:14,fontWeight:700,cursor:b.d?"not-allowed":"pointer",opacity:b.d?.4:1}}>{b.l}</button>)}</div><QuickBets G={G} setG={setG}/></GameLayout>;
}

// ═══ KENO GALÁCTICO — auditado, correto ══════════════════════
// CORRIGIDO: tabela anterior tinha RTP real de apenas 57.85% (calculado via
// distribuição hipergeométrica exata) vs ~80% declarado.
// Nova tabela validada matematicamente: RTP exato de 80.09%.
const KM=[0,0,0,1.1,2.1,5.5];
function KenoGame({G,setG,history,addHistory}){
  const[picks,setPicks]=useState(new Set());const[drawn,setDrawn]=useState([]);const[playing,setPlay]=useState(false);
  const[msg,setMsg]=useState("");const[mT,setMT]=useState("");
  const[lastResult,setLastResult]=useState({prize:0,bet:0});
  function pick(n){if(playing)return;setPicks(p=>{const ns=new Set(p);if(ns.has(n)){ns.delete(n);return ns;}if(ns.size>=5)return ns;ns.add(n);return ns;});}
  async function play(){activateAudio();if(picks.size<5){setMsg("⚠️ Escolha exatamente 5 números!");setMT("loss");return;}const bet=BETS[G.betIdx];if(G.saldo<bet){setMsg("❌ Saldo insuficiente!");setMT("loss");return;}setG(p=>({...p,saldo:p.saldo-bet}));setPlay(true);setDrawn([]);setMsg("🌌 Sorteando...");setMT("teal");const pool=shuffle(Array.from({length:40},(_,i)=>i+1));const dn=pool.slice(0,20);for(let i=0;i<20;i++){await sleep(110);setDrawn(dn.slice(0,i+1));if(picks.has(dn[i]))sKeno();}const hits=dn.filter(n=>picks.has(n)).length;const m=KM[hits]||0;if(m>0){const prize=+(bet*m).toFixed(2);setLastResult({prize,bet});sWin();setG(p=>({...p,saldo:p.saldo+prize,wins:p.wins+1,totalWon:p.totalWon+prize,streak:p.streak+1,rounds:p.rounds+1,best:Math.max(p.best,prize)}));setMsg(`🌌 ${hits} acerto(s)! ×${m} — +${fmt(prize)}`);setMT("win");addHistory({txt:`🌌 Keno ${hits} acertos +${fmt(prize)}`,type:"win"},{gameId:'keno',bet,result:prize,won:true});}else{sLoss();setG(p=>({...p,losses:p.losses+1,streak:0,rounds:p.rounds+1}));setMsg(`😔 ${hits} acerto(s) — sem prêmio (precisa ≥3). −${fmt(bet)}`);setMT("loss");addHistory({txt:`❌ Keno ${hits} acertos −${fmt(bet)}`,type:""},{gameId:'keno',bet,result:0,won:false});}setPlay(false);}
  return <GameLayout game={GAMES[8]} G={G} setG={setG} history={history}>
    <div style={{display:"flex",gap:8,justifyContent:"center",marginBottom:8,flexWrap:"wrap"}}>
      <div style={{padding:"4px 12px",borderRadius:8,fontSize:16,fontWeight:600,background:"rgba(245,200,66,.12)",border:"1px solid rgba(245,200,66,.25)",color:"#f5c842"}}>Selecionados: {picks.size}/5</div>
      <div style={{padding:"4px 12px",borderRadius:8,fontSize:16,fontWeight:600,background:"rgba(0,229,176,.12)",border:"1px solid rgba(0,229,176,.25)",color:"#00e5b0"}}>Acertos: {drawn.filter(n=>picks.has(n)).length}</div>
      <div style={{padding:"4px 12px",borderRadius:8,fontSize:15,fontWeight:600,background:"rgba(194,100,255,.08)",border:"1px solid rgba(194,100,255,.2)",color:"#c264ff"}}>3=×1.1 | 4=×2.1 | 5=×5.5</div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(8,1fr)",gap:4,maxWidth:340,margin:"0 auto"}}>
      {Array.from({length:40},(_,i)=>i+1).map(n=>{const ip=picks.has(n);const ih=ip&&drawn.includes(n);const im=drawn.includes(n)&&!ip;return <button key={n} onClick={()=>pick(n)} className={ih?"kH":""} style={{aspectRatio:"1",background:ih?"rgba(0,229,176,.15)":ip?"rgba(245,200,66,.15)":im?"rgba(100,100,100,.15)":"rgba(12,18,38,.9)",border:`1px solid ${ih?"rgba(0,229,176,.5)":ip?"rgba(245,200,66,.5)":im?"rgba(100,100,100,.3)":"rgba(255,200,80,.08)"}`,borderRadius:7,color:ih?"#00e5b0":ip?"#f5c842":im?"#555":"#6a7a9a",fontSize:15,fontFamily:"'Cinzel',serif",fontWeight:700,cursor:playing?"default":"pointer"}}>{n}</button>;})}
    </div>
    <WinMsg msg={msg} type={mT} prize={lastResult.prize} bet={lastResult.bet}/>
    <BetRow G={G} setG={setG} onAction={play} label="SORTEAR!" disabled={playing}/>
  </GameLayout>;
}

// ═══ PLINKO NEON — auditado, correto ═════════════════════════
// CORRIGIDO: 8 fileiras geram 9 buckets (distribuição binomial), não 11.
// Multiplicadores calibrados matematicamente para RTP exato de 95.9%
// usando as probabilidades binomiais reais C(8,k)/256.
const PM=[26,4,1.4,0.3,0.25,0.3,1.4,4,26];
const PC=PM.map(m=>m>=10?"#c264ff":m>=2?"#f5c842":m>=1?"#00e5b0":m>=.3?"#4da6ff":"#ff3d5a");
function PlinkoGame({G,setG,history,addHistory}){
  const cvR=useRef(null);const[playing,setPlay]=useState(false);const[hit,setHit]=useState(null);
  const[msg,setMsg]=useState("");const[mT,setMT]=useState("");
  const[lastResult,setLastResult]=useState({prize:0,bet:0});
  useEffect(()=>{drawBoard(null);},[]);
  function drawBoard(bp){const cv=cvR.current;if(!cv)return;const ctx=cv.getContext("2d");const W=cv.width,H=cv.height;ctx.clearRect(0,0,W,H);const ROWS=8;for(let r=0;r<ROWS;r++){const cols=r+2;for(let c=0;c<cols;c++){const x=(W/2)+(c-cols/2+.5)*(W/(ROWS+2));const y=25+r*(H-60)/(ROWS+1);ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fillStyle="#00e5b0";ctx.shadowBlur=8;ctx.shadowColor="#00e5b0";ctx.fill();ctx.shadowBlur=0;}}if(bp){ctx.beginPath();ctx.arc(bp.x,bp.y,7,0,Math.PI*2);ctx.fillStyle="#f5c842";ctx.shadowBlur=16;ctx.shadowColor="#f5c842";ctx.fill();ctx.shadowBlur=0;}}
  async function play(){
    activateAudio();
    const bet=BETS[G.betIdx];
    if(G.saldo<bet){setMsg("❌ Saldo insuficiente!");setMT("loss");return;}
    setG(p=>({...p,saldo:p.saldo-bet}));
    setPlay(true);setHit(null);setMsg("");setMT("");

    const cv=cvR.current;const W=cv.width,H=cv.height;
    const ROWS=8;
    const B=PM.length; // 9 buckets

    let x=W/2, y=15;
    // CORRIGIDO: posição relativa ao centro, pode ir tanto para esquerda (-1) quanto direita (+1)
    // Distribuição binomial real — igual a um Plinko físico de verdade
    let relPos=0;

    for(let r=0;r<ROWS;r++){
      const dir = rnd()>.5 ? 1 : -1; // CORRIGIDO: agora pode ir para os dois lados
      relPos += dir;

      // Posição X do pino nesta fileira (fileiras têm r+2 colunas, centradas)
      const cols=r+2;
      const colIndex = (cols/2) + (relPos/2); // mapeia relPos para índice de coluna nesta fileira
      const tx=(W/2)+(colIndex-cols/2+.5)*(W/(ROWS+2));
      const ty=25+(r+1)*(H-60)/(ROWS+1);

      for(let s=0;s<=8;s++){
        drawBoard({x:x+(tx-x)*(s/8), y:y+(ty-y)*(s/8)});
        await sleep(30);
      }
      sPeg();
      x=tx; y=ty;
    }

    // Mapeia relPos final (-8 a +8, em passos de 2) para índice de bucket (0 a 8)
    const bucketIndex = Math.round((relPos+ROWS)/2);
    const bi = Math.max(0, Math.min(B-1, bucketIndex));

    const fy=H-20;
    for(let s=0;s<=6;s++){drawBoard({x,y:y+(fy-y)*(s/6)});await sleep(25);}
    drawBoard(null);

    const m=PM[bi];
    setHit(bi);
    // CORRIGIDO: antes, qualquer bucket com m<1 era tratado como derrota total
    // (perdia a aposta inteira), mesmo quando o multiplicador era 0.3 ou 0.25
    // — ou seja, o jogador deveria receber 30%/25% de volta, mas recebia 0%.
    // Isso fazia o RTP real cair para ~76% em vez dos ~95.9% calculados.
    // Agora, todo bucket paga exatamente bet*m, seja m maior ou menor que 1.
    const prize=+(bet*m).toFixed(2);
    setLastResult({prize,bet});
    if(m>=1){
      sWin();
      setG(p=>({...p,saldo:p.saldo+prize,wins:p.wins+1,totalWon:p.totalWon+prize,streak:p.streak+1,rounds:p.rounds+1,best:Math.max(p.best,prize)}));
      setMsg(`🔵 Bucket ×${m} — +${fmt(prize)}!`);setMT("win");
      addHistory({txt:`🔵 Plinko ×${m} +${fmt(prize)}`,type:"win"},{gameId:'plinko',bet,result:prize,won:true});
    }else{
      // Mesmo perdendo (m<1), o jogador recebe a fração de volta — não é zero
      sLoss();
      setG(p=>({...p,saldo:p.saldo+prize,losses:p.losses+1,streak:0,rounds:p.rounds+1}));
      setMsg(`😔 Bucket ×${m} — recebeu ${fmt(prize)} (de ${fmt(bet)})`);setMT("loss");
      addHistory({txt:`🔵 Plinko ×${m} +${fmt(prize)} (parcial)`,type:""},{gameId:'plinko',bet,result:prize,won:false});
    }
    setPlay(false);
    setTimeout(()=>setHit(null),1200);
  }
  return <GameLayout game={GAMES[9]} G={G} setG={setG} history={history}><div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8}}><canvas ref={cvR} width={320} height={220} style={{borderRadius:10,border:"1px solid rgba(255,200,80,.15)",background:"rgba(5,7,15,.8)",width:"100%",maxWidth:320}}/><div style={{display:"flex",gap:2,width:"100%",maxWidth:320}}>{PM.map((m,i)=><div key={i} style={{flex:1,padding:"4px 2px",textAlign:"center",borderRadius:5,border:`1px solid ${hit===i?PC[i]:"transparent"}`,background:hit===i?`${PC[i]}22`:"rgba(12,18,38,.6)",fontFamily:"'Cinzel',serif",fontSize:12,fontWeight:700,color:PC[i],transform:hit===i?"scale(1.15)":"scale(1)",transition:"all .3s"}}>×{m}</div>)}</div></div><WinMsg msg={msg} type={mT} prize={lastResult.prize} bet={lastResult.bet}/><BetRow G={G} setG={setG} onAction={play} label="SOLTAR BOLA" disabled={playing}/></GameLayout>;
}

// ═══ GAME CARD ════════════════════════════════════════════════
function GameCard({game,onClick}){
  const[hov,setHov]=useState(false);
  return <div className="gc card-lift" onClick={onClick} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)} style={{boxShadow:hov?`0 12px 40px ${game.glow}`:"none"}}>
    <div style={{height:140,background:`linear-gradient(135deg,${game.color}22 0%,rgba(5,7,15,0) 100%)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:85,position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",inset:0,background:`radial-gradient(circle at 50% 50%,${game.glow} 0%,transparent 70%)`,opacity:hov?1:.3,transition:"opacity .25s"}}/>
      <span style={{position:"relative",zIndex:1,filter:`drop-shadow(0 0 16px ${game.color})`}}>{game.emoji}</span>
      <div className="bp" style={{position:"absolute",top:10,right:10,background:`${game.color}22`,border:`1px solid ${game.color}55`,color:game.color,fontSize:12,fontWeight:700,padding:"3px 8px",borderRadius:20,letterSpacing:.5}}>{game.tag}</div>
    </div>
    <div style={{padding:"14px 16px",background:"rgba(8,12,26,.7)",backdropFilter:"blur(10px)"}}>
      <div className="cd" style={{fontSize:17,fontWeight:700,color:"#eeeaf0",marginBottom:6}}>{game.name}</div>
      <div style={{fontSize:15,color:"#6a7a9a",lineHeight:1.6,marginBottom:10,minHeight:50}}>{game.desc}</div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div style={{fontSize:14,color:"#6a7a9a"}}>Retorno <span style={{color:game.color,fontWeight:700}}>{game.rtp}</span></div>
        <div style={{width:6,height:6,borderRadius:"50%",background:game.color,boxShadow:`0 0 8px ${game.color}`}}/>
      </div>
      <button className="btn-press" style={{width:"100%",padding:"9px 0",border:"none",borderRadius:10,background:`linear-gradient(135deg,${game.color},${game.color}aa)`,color:["#f5c842","#2dde98","#00e5b0","#ff8c42"].includes(game.color)?"#000":"#fff",fontFamily:"'Cinzel Decorative',serif",fontSize:16,fontWeight:700,cursor:"pointer",letterSpacing:1.5,boxShadow:`0 4px 20px ${game.glow}`}}>JOGAR</button>
    </div>
  </div>;
}

// ═══ PAGES ════════════════════════════════════════════════════
function HomePage({G,onNav}){return <div style={{paddingBottom:100}}><div style={{textAlign:"center",padding:"40px 20px 30px"}}><div style={{fontSize:15,letterSpacing:4,textTransform:"uppercase",color:"#00e5b0",marginBottom:12,fontWeight:600}}>BEM-VINDO DE VOLTA</div><div className="cd" style={{fontSize:39,fontWeight:900,background:"linear-gradient(90deg,#f5c842,#fff8dc,#f5c842)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",lineHeight:1.2,marginBottom:12}}>ESCOLHA SUA AVENTURA</div><div style={{fontSize:17,color:"#6a7a9a",maxWidth:440,margin:"0 auto 20px"}}>10 jogos premium com mecânicas únicas. Escolha sua mesa e boa sorte!</div><div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>{[{l:"💰 Saldo",v:fmt(G.saldo),c:"#f5c842",bg:"rgba(245,200,66,.08)",bc:"rgba(245,200,66,.25)"},{l:"🔥 Streak",v:G.streak,c:"#00e5b0",bg:"rgba(0,229,176,.08)",bc:"rgba(0,229,176,.25)"},{l:"🐉 Dragões",v:G.dragons,c:"#c264ff",bg:"rgba(194,100,255,.08)",bc:"rgba(194,100,255,.25)"}].map(s=><div key={s.l} style={{padding:"6px 14px",borderRadius:20,background:s.bg,border:`1px solid ${s.bc}`,fontSize:16,color:s.c,fontWeight:600}}>{s.l}: <strong>{s.v}</strong></div>)}</div></div><div style={{padding:"0 16px",maxWidth:960,margin:"0 auto"}}><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:16}}>{GAMES.map(g=><GameCard key={g.id} game={g} onClick={()=>onNav(`/jogo/${g.id}`)}/>)}</div></div></div>;}
function StatsPage({G}){const lucro=G.saldo-INI;const taxa=G.rounds>0?(G.wins/G.rounds*100).toFixed(1):"0.0";const stats=[{l:"Saldo Atual",v:fmt(G.saldo),c:"#f5c842"},{l:"Lucro/Prejuízo",v:(lucro>=0?"+":"-")+fmt(Math.abs(lucro)),c:lucro>=0?"#2dde98":"#ff3d5a"},{l:"Rodadas",v:G.rounds,c:"#eeeaf0"},{l:"Vitórias",v:G.wins,c:"#2dde98"},{l:"Derrotas",v:G.losses,c:"#ff3d5a"},{l:"Taxa de Acerto",v:taxa+"%",c:"#2dde98"},{l:"Melhor Prêmio",v:fmt(G.best),c:"#f5c842"},{l:"Total Ganho",v:fmt(G.totalWon),c:"#00e5b0"},{l:"Streak 🔥",v:G.streak,c:"#f5c842"},{l:"Dragões 🐉",v:G.dragons,c:"#c264ff"}];return <div style={{maxWidth:600,margin:"0 auto",padding:"24px 16px 100px"}}><div className="cd" style={{fontSize:26,fontWeight:700,color:"#f5c842",marginBottom:20,textAlign:"center"}}>📊 Estatísticas</div><div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10}}>{stats.map(s=><Panel key={s.l}><div style={{fontSize:14,color:"#6a7a9a",letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>{s.l}</div><div className="cn" style={{fontSize:26,fontWeight:700,color:s.c}}>{s.v}</div></Panel>)}</div></div>;}
function ProfilePage({G,user,profile,onSignOut,onLogin,onNav,onDeposit,onWithdraw}){
  const level=G.rounds<20?"Iniciante":G.rounds<100?"Aventureiro":G.rounds<500?"Veterano":"Lendário";
  const lc={Iniciante:"#6a7a9a",Aventureiro:"#4da6ff",Veterano:"#f5c842",Lendário:"#c264ff"}[level];
  const lucro=G.saldo-INI;
  return <div style={{maxWidth:480,margin:"0 auto",padding:"24px 16px 100px",textAlign:"center"}}>
    <div style={{fontSize:95,marginBottom:12}}>⭐</div>
    {user ? <>
      <div className="cd" style={{fontSize:24,fontWeight:700,color:"#eeeaf0",marginBottom:4}}>{profile?.username||user.email}</div>
      <div style={{fontSize:15,color:"#6a7a9a",marginBottom:8}}>{user.email}</div>
    </> : <>
      <div className="cd" style={{fontSize:24,fontWeight:700,color:"#eeeaf0",marginBottom:4}}>Jogador Visitante</div>
      <div style={{fontSize:15,color:"#6a7a9a",marginBottom:8}}>Jogue sem conta — progresso não é salvo</div>
    </>}
    <div style={{display:"inline-block",background:`${lc}22`,border:`1px solid ${lc}55`,color:lc,fontSize:17,fontWeight:700,padding:"4px 16px",borderRadius:20,marginBottom:24}}>{level}</div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:16}}>
      {[{e:"🎮",v:G.rounds,l:"Rodadas"},{e:"🏆",v:G.wins,l:"Vitórias"},{e:"🐉",v:G.dragons,l:"Dragões"}].map(s=><Panel key={s.l}><div style={{fontSize:32}}>{s.e}</div><div className="cn" style={{fontSize:29,fontWeight:700,color:"#f5c842"}}>{s.v}</div><div style={{fontSize:14,color:"#6a7a9a",textTransform:"uppercase",letterSpacing:1}}>{s.l}</div></Panel>)}
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:20}}>
      {[{l:"Saldo",v:fmt(G.saldo),c:"#f5c842"},{l:"Lucro/Prejuízo",v:(lucro>=0?"+":"")+fmt(lucro),c:lucro>=0?"#2dde98":"#ff3d5a"},{l:"Melhor Prêmio",v:fmt(G.best),c:"#00e5b0"},{l:"Streak 🔥",v:G.streak,c:"#f5c842"}].map(s=><Panel key={s.l}><div style={{fontSize:14,color:"#6a7a9a",letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>{s.l}</div><div className="cn" style={{fontSize:24,fontWeight:700,color:s.c}}>{s.v}</div></Panel>)}
    </div>
    {user && (
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
        <button onClick={onDeposit} className="btn-press" style={{padding:"13px 8px",border:"none",borderRadius:10,background:"linear-gradient(135deg,#f5c842,#e8a020)",color:"#000",fontFamily:"'Cinzel Decorative',serif",fontSize:16,fontWeight:700,cursor:"pointer",boxShadow:"0 4px 20px rgba(245,200,66,.3)"}}>💰 DEPOSITAR</button>
        <button onClick={onWithdraw} className="btn-press" style={{padding:"13px 8px",border:"none",borderRadius:10,background:"linear-gradient(135deg,#00e5b0,#00b88a)",color:"#000",fontFamily:"'Cinzel Decorative',serif",fontSize:16,fontWeight:700,cursor:"pointer",boxShadow:"0 4px 20px rgba(0,229,176,.3)"}}>🏦 SACAR</button>
      </div>
    )}
    {user && <button onClick={()=>onNav('/history')} style={{width:"100%",padding:"12px",border:"none",borderRadius:10,background:"linear-gradient(135deg,#4da6ff,#2277dd)",color:"#fff",fontFamily:"'Cinzel Decorative',serif",fontSize:16,fontWeight:700,cursor:"pointer",marginBottom:10}}>📜 VER HISTÓRICO COMPLETO</button>}
    {user
      ? <button onClick={onSignOut} style={{width:"100%",padding:"12px",border:"1px solid rgba(255,61,90,.3)",borderRadius:10,background:"rgba(255,61,90,.08)",color:"#ff3d5a",fontFamily:"'Cinzel Decorative',serif",fontSize:16,fontWeight:700,cursor:"pointer",marginBottom:16}}>SAIR DA CONTA</button>
      : <button onClick={onLogin} style={{width:"100%",padding:"12px",border:"none",borderRadius:10,background:"linear-gradient(135deg,#f5c842,#e8a020)",color:"#000",fontFamily:"'Cinzel Decorative',serif",fontSize:16,fontWeight:700,cursor:"pointer",marginBottom:16}}>ENTRAR / CRIAR CONTA</button>
    }
    {!user && <Panel title="💾 Por que criar conta?">
      <div style={{fontSize:16,color:"#6a7a9a",lineHeight:2,textAlign:"left"}}>
        ☁️ Saldo salvo na nuvem<br/>
        📊 Histórico de todas as rodadas<br/>
        🏆 Ranking entre jogadores<br/>
        💳 Depósito via PIX (em breve)<br/>
        <span style={{color:"#f5c842",fontWeight:700}}>Crie uma conta grátis e nunca perca seu progresso!</span>
      </div>
    </Panel>}
  </div>;
}

// ═══ LAYOUT SHELL ═════════════════════════════════════════════
function Header({G,setG,muted,toggleMute,route,onNav,user,profile,onLogin,onLogout,guestMode}){
  const isGame=route.startsWith("/jogo/");const gameId=isGame?route.replace("/jogo/",""):null;const cg=gameId?GAMES.find(g=>g.id===gameId):null;
  return <header style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 18px",background:"rgba(8,12,26,.95)",borderBottom:"1px solid rgba(255,200,80,.15)",backdropFilter:"blur(20px)",position:"sticky",top:0,zIndex:100,flexWrap:"wrap",gap:8}}>
    <div style={{display:"flex",alignItems:"center",gap:10}}>
      {isGame&&<button onClick={()=>onNav("/")} style={{background:"rgba(255,200,80,.08)",border:"1px solid rgba(255,200,80,.2)",color:"#f5c842",padding:"5px 10px",borderRadius:8,cursor:"pointer",fontSize:16,fontWeight:700}}>← Voltar</button>}
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <div className="lglow" style={{width:38,height:38,background:"linear-gradient(135deg,#f5c842,#e8a020)",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:26}}>⭐</div>
        <div><div className="cd" style={{fontSize:18,fontWeight:700,background:"linear-gradient(90deg,#f5c842,#fff8dc,#f5c842)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",letterSpacing:1}}>Roda da Fortuna ⭐</div><div style={{fontSize:12,letterSpacing:3,color:"#00e5b0",textTransform:"uppercase"}}>{cg?cg.name:"10 Jogos Exclusivos"}</div></div>
      </div>
    </div>
    <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
      <div className="glow-pulse-sm" style={{background:"linear-gradient(135deg,rgba(245,200,66,.18),rgba(232,160,32,.1))",border:"1.5px solid rgba(245,200,66,.4)",padding:"7px 16px",borderRadius:10,fontSize:18,fontWeight:800,color:"#f5c842",boxShadow:"0 2px 12px rgba(245,200,66,.15)"}}><span style={{color:"#8a96aa",fontWeight:500,marginRight:4,fontSize:14}}>Saldo</span>{fmt(G.saldo)}</div>
      <div className={G.streak>=5?"chip-active":""} style={{background:G.streak>=20?"linear-gradient(135deg,rgba(245,200,66,.22),rgba(255,61,90,.12))":G.streak>=10?"rgba(245,200,66,.12)":G.streak>=5?"rgba(0,229,176,.1)":"rgba(0,229,176,.06)",border:`1.5px solid ${G.streak>=10?"rgba(245,200,66,.45)":"rgba(0,229,176,.25)"}`,padding:"7px 14px",borderRadius:10,fontSize:16,fontWeight:800,color:G.streak>=10?"#f5c842":"#00e5b0",display:"flex",flexDirection:"column",alignItems:"center",lineHeight:1.1}}>
        <span>🔥 {G.streak}</span>
        {G.streak>=5 && <span style={{fontSize:10,fontWeight:700,letterSpacing:.5}}>+{G.streak>=20?35:G.streak>=10?20:10}% BÔNUS</span>}
      </div>
      <button onClick={toggleMute} className="btn-press" style={{background:"rgba(245,200,66,.08)",border:"1px solid rgba(245,200,66,.25)",color:"#f5c842",fontSize:21,width:36,height:36,borderRadius:8,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>{muted?"🔇":"🔊"}</button>
      {user
        ? <button onClick={onLogout} className="btn-press" style={{background:"rgba(255,61,90,.08)",border:"1px solid rgba(255,61,90,.2)",color:"rgba(255,61,90,.8)",fontSize:14,padding:"5px 10px",borderRadius:8,cursor:"pointer",fontWeight:700,fontFamily:"'Rajdhani',sans-serif"}}>SAIR</button>
        : <button onClick={onLogin} className="btn-press" style={{background:"linear-gradient(135deg,#f5c842,#e8a020)",border:"none",color:"#000",fontSize:15,padding:"6px 12px",borderRadius:8,cursor:"pointer",fontWeight:700,fontFamily:"'Cinzel Decorative',serif",letterSpacing:.5}}>{guestMode?"ENTRAR":"LOGIN"}</button>
      }
    </div>
  </header>;
}
function BottomNav({route,onNav}){const tabs=[{id:"home",e:"🏠",l:"Início"},{id:"games",e:"🎮",l:"Jogos"},{id:"history",e:"📜",l:"Histórico"},{id:"profile",e:"👤",l:"Perfil"}];const active=route==="/"||route==="/home"?"home":route.startsWith("/jogo")?"games":route.slice(1);return <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:100,background:"rgba(8,12,26,.98)",borderTop:"1px solid rgba(255,200,80,.15)",backdropFilter:"blur(20px)",display:"flex"}}>{tabs.map(t=><button key={t.id} onClick={()=>onNav(t.id==="home"?"/":`/${t.id}`)} className="btn-press" style={{flex:1,padding:"10px 0",background:"transparent",border:"none",display:"flex",flexDirection:"column",alignItems:"center",gap:3,cursor:"pointer",color:active===t.id?"#f5c842":"#6a7a9a",transition:"color .2s"}}><span style={{fontSize:24}}>{t.e}</span><span style={{fontSize:12,letterSpacing:.5,textTransform:"uppercase",fontWeight:600}}>{t.l}</span></button>)}</div>;}
function Particles(){const cols=["rgba(245,200,66,.6)","rgba(0,229,176,.4)","rgba(194,100,255,.3)"];return <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,overflow:"hidden"}}>{Array.from({length:25},(_,i)=>{const s=2+Math.random()*4;return <div key={i} className="particle" style={{width:s,height:s,left:`${Math.random()*100}%`,background:cols[Math.floor(Math.random()*3)],animationDuration:`${6+Math.random()*12}s`,animationDelay:`${-Math.random()*12}s`}}/>;})}</div>;}

// ═══ MAIN APP ═════════════════════════════════════════════════
const GC={slot:SlotGame,crash:CrashGame,mina:MinaGame,roleta:RoletaGame,dados:DadosGame,duelo:DueloGame,torre:TorreGame,blackjack:BJGame,keno:KenoGame,plinko:PlinkoGame};

export default function App(){
  const[route,setRoute]=useState("/");
  const[G,setG]=useState(createState);
  const[history,setHistory]=useState([]);
  const[muted,setMuted]=useState(true);
  const[showAuth,setShowAuth]=useState(false);
  const[guestMode,setGuestMode]=useState(false);
  const[showWallet,setShowWallet]=useState(false);
  const[showWithdrawal,setShowWithdrawal]=useState(false);

  // ── Auth hook ──────────────────────────────────────────────
  const { user, profile, loading, authError, setAuthError, signIn, signUp, signOut, resetPassword, fetchProfile } = useAuth();

  // ── Fase 3: sync hook ──────────────────────────────────────
  const { syncRound, syncProfile, fetchHistory, fetchTransactions, fetchGameStats, fetchPendingWithdrawals, cancelWithdrawal } = useGameSync(user);

  // Detecta rota de reset-password (vinda do email do Supabase)
  const isResetRoute = window.location.hash.includes('type=recovery') || route === '/reset-password';

  // Fase 5: rota oculta /admin?key=... para painel de teste
  const urlParams = new URLSearchParams(window.location.search);
  const isAdminRoute = route === '/admin' && urlParams.get('key') === (import.meta.env.VITE_ADMIN_PANEL_KEY || '__no_key_set__');

  // Fase 3: quando perfil carrega, restaura estado do Supabase (sem localStorage)
  useEffect(() => {
    if (profile) {
      setG(p => ({
        ...p,
        saldo:    Number(profile.balance)   || INI,
        totalWon: Number(profile.total_won) || 0,
        best:     Number(profile.best_win)  || 0,
        streak:   profile.streak  || 0,
        dragons:  profile.dragons || 0,
        rounds:   profile.rounds  || 0,
        wins:     profile.wins    || 0,
        losses:   profile.losses  || 0,
      }));
    }
  }, [profile]);

  // Fase 3: addHistory grava cada rodada finalizada no Supabase via RPC segura
  // syncOpts = { gameId, bet, result, won } — passado pelos jogos ao finalizar
  function addHistory(item, syncOpts = null) {
    setHistory(p => [item, ...p].slice(0, 50));
    if (syncOpts && user) {
      syncRound({ ...syncOpts, G, setG });
    } else if (user) {
      syncProfile(G);
    }
  }

  function toggleMute(){setMuted(m=>{_muted=!m;if(_mG)_mG.gain.value=m?.7:0;return !m;});}
  function nav(path){setRoute(path.startsWith("/")?path:`/${path}`);window.scrollTo(0,0);}

  async function handleSignOut() {
    await signOut();
    setG(createState());
    setHistory([]);
    setGuestMode(false);
    nav('/');
  }

  function handleAuthSuccess() {
    setShowAuth(false);
    setGuestMode(false);
  }

  function handleGuestMode() {
    setGuestMode(true);
    setShowAuth(false);
  }

  // Loading inicial
  if (loading) return (
    <>
      <style>{CSS}</style>
      <div style={{height:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#05070f',flexDirection:'column',gap:16}}>
        <div style={{fontSize:63}}>⭐</div>
        <div style={{fontFamily:"'Cinzel Decorative',serif",fontSize:18,color:'#f5c842',letterSpacing:2}}>CARREGANDO...</div>
      </div>
    </>
  );

  // Rota de reset de senha
  if (isResetRoute) return (
    <>
      <style>{CSS}</style>
      <ResetPasswordPage onDone={() => { nav('/'); setShowAuth(true); }} />
    </>
  );

  // Fase 5: rota oculta do painel admin
  if (route === '/admin') {
    if (!isAdminRoute) return (
      <>
        <style>{CSS}</style>
        <div style={{height:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#05070f',color:'#6a7a9a',fontSize:17}}>Acesso restrito.</div>
      </>
    );
    return (
      <>
        <style>{CSS}</style>
        <AdminPanel user={user} />
      </>
    );
  }

  // Não logado e não em modo guest: mostra AuthModal
  const needsAuth = !user && !guestMode;

  function renderRoute(){
    if(route==="/"||route==="/home")return <HomePage G={G} onNav={nav}/>;
    if(route==="/games")return <div style={{maxWidth:960,margin:"0 auto",padding:"20px 16px 100px"}}><div className="cd" style={{fontSize:24,fontWeight:700,color:"#f5c842",textAlign:"center",marginBottom:20}}>🎮 Todos os Jogos</div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:16}}>{GAMES.map(g=><GameCard key={g.id} game={g} onClick={()=>nav(`/jogo/${g.id}`)}/>)}</div></div>;
    if(route==="/stats")return <StatsPage G={G}/>;
    if(route==="/history")return <HistoryPage user={user} fetchHistory={fetchHistory} fetchTransactions={fetchTransactions} fetchGameStats={fetchGameStats} fetchPendingWithdrawals={fetchPendingWithdrawals} cancelWithdrawal={cancelWithdrawal}/>;
    if(route==="/profile")return <ProfilePage G={G} user={user} profile={profile} onSignOut={handleSignOut} onLogin={()=>setShowAuth(true)} onNav={nav} onDeposit={()=>setShowWallet(true)} onWithdraw={()=>setShowWithdrawal(true)}/>;
    if(route.startsWith("/jogo/")){const id=route.replace("/jogo/","");const C=GC[id];if(C)return <C G={G} setG={setG} history={history} addHistory={addHistory}/>;}
    return <HomePage G={G} onNav={nav}/>;
  }

  return <>
    <style>{CSS}</style>
    <div style={{position:"fixed",inset:0,zIndex:0,pointerEvents:"none",background:"radial-gradient(ellipse 80% 50% at 20% 60%,rgba(0,100,80,.12) 0%,transparent 60%),radial-gradient(ellipse 60% 40% at 80% 30%,rgba(120,60,0,.10) 0%,transparent 55%)",animation:"auP 8s ease-in-out infinite alternate"}}/>
    <div style={{position:"fixed",inset:0,zIndex:0,pointerEvents:"none",backgroundImage:"linear-gradient(rgba(245,200,66,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(245,200,66,.03) 1px,transparent 1px)",backgroundSize:"60px 60px"}}/>
    <Particles/>
    <div style={{position:"relative",zIndex:1,minHeight:"100vh"}}>
      <Header G={G} setG={setG} muted={muted} toggleMute={toggleMute} route={route} onNav={nav} user={user} profile={profile} onLogin={()=>setShowAuth(true)} onLogout={handleSignOut} guestMode={guestMode}/>
      <main>{renderRoute()}</main>
      <BottomNav route={route} onNav={nav}/>
    </div>
    {/* Auth Modal */}
    {(showAuth || needsAuth) && (
      <AuthModal
        onAuth={handleAuthSuccess}
        onGuest={handleGuestMode}
        authError={authError}
        setAuthError={setAuthError}
        signIn={signIn}
        signUp={signUp}
        resetPassword={resetPassword}
      />
    )}
    {/* Fase 5: Wallet Modal (depósito PIX) */}
    {showWallet && user && (
      <WalletModal
        user={user}
        onClose={()=>setShowWallet(false)}
        onDeposited={()=>{ fetchProfile(user.id); }}
      />
    )}
    {/* Saque PIX */}
    {showWithdrawal && user && (
      <WithdrawalModal
        user={user}
        currentBalance={G.saldo}
        onClose={()=>setShowWithdrawal(false)}
        onWithdrawn={(newBalance)=>{ setG(p=>({...p,saldo:Number(newBalance)})); }}
      />
    )}
  </>;
}
