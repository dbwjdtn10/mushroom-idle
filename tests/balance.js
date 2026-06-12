// 밸런스 시뮬레이션 — 간단한 그리디 정책으로 자동 플레이하며 스테이지 진행 곡선 확인
'use strict';
const fs = require('fs');

function makeEl(id) {
  return {
    id: id || '', style: { setProperty(k, v){ this[k] = v; } },
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    textContent: '', innerHTML: '', dataset: {}, children: [], _handlers: {},
    offsetLeft: 0, offsetTop: 0, offsetWidth: 0,
    appendChild(c){ this.children.push(c); }, remove(){},
    addEventListener(ev, fn){ (this._handlers[ev] = this._handlers[ev] || []).push(fn); },
    click(){ (this._handlers.click || []).forEach(f => f()); },
    querySelectorAll(){ return []; },
  };
}
const els = {};
global.document = {
  getElementById(id){ if (!els[id]) els[id] = makeEl(id); return els[id]; },
  createElement(){ return makeEl(); }, querySelectorAll(){ return []; },
  addEventListener(){}, hidden: false,
};
const store = {};
global.localStorage = { getItem(k){ return store[k] ?? null; }, setItem(k,v){ store[k]=String(v); }, removeItem(k){ delete store[k]; } };
global.window = { addEventListener(){} };
global.location = { reload(){} };
Object.defineProperty(global, 'navigator', { value: {}, configurable: true });
let simTime = 0;
global.performance = { now: () => simTime };
let rafCb = null;
global.requestAnimationFrame = cb => { rafCb = cb; };
global.setInterval = () => 0;
global.prompt = () => null;
global.runSeconds = function(sec) {
  const stepMs = 100, steps = Math.ceil(sec * 1000 / stepMs);
  for (let i = 0; i < steps; i++) { simTime += stepMs; rafCb(simTime); }
};
global.report = console.log;

const html = fs.readFileSync(process.argv[2], 'utf8');
const src = html.split('<script>')[1].split('<' + '/script>')[0];

const body = `
// 그리디 정책: 30초마다 — 강화 수련 구매, 남는 골드로 뽑기, 장비 강화는 골드의 20%까지
const HOURS = 4;
let nextLog = 0;
for (let min = 0; min < HOURS * 60; min++) {
  runSeconds(60);
  for (let i = 0; i < 50 && S.gold >= upCost('atk'); i++) buyUpgrade('atk');
  for (let i = 0; i < 50 && S.gold >= upCost('hp'); i++) buyUpgrade('hp');
  if (S.upgrades.spd < 30 && S.gold >= upCost('spd')*3) buyUpgrade('spd');
  if (S.upgrades.crit < 45 && S.gold >= upCost('crit')*3) buyUpgrade('crit');
  for (const sk of SKILLS) if (S.level >= sk.unlock && S.gold >= skillUpCost(sk)*4) buySkillUp(sk.id);
  for (const s of SLOTS) if (S.equip[s.key] && S.gold >= enhCost(s.key)*5) buyEnhance(s.key);
  while (S.gold >= pull10Cost() * 2) doPulls(10);
  // 보스 재도전: 파밍 모드면 일정 시간 후 재도전
  if (S.farm && min % 3 === 0) { S.farm = false; S.kills = 0; player.hp = player.maxHp; spawnMonster(); }
  if (min >= nextLog) {
    report('t=' + min + '분  stage=' + S.stage + ' (max ' + S.maxStage + ')  lv=' + S.level +
      '  gold=' + fmt(S.gold) + '  dia=' + Math.floor(S.dia) + '  atk업=' + S.upgrades.atk +
      '  강화합=' + Object.values(S.enhance).reduce((a,b)=>a+b,0));
    nextLog += 30;
  }
}
report('최종: maxStage=' + S.maxStage + ', 환생 가능 여부(40+): ' + (S.maxStage >= 40) + ', 포자 예상=' + sporeGain());
`;
(0, eval)(src + body);
