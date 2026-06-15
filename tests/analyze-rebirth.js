// 환생 곡선 분석 — 그리디 플레이 + "정체 시 환생" 정책으로 장시간 돌려
// 환생마다 maxStage·획득 용비늘·영구배율·복귀 시간을 측정한다.
// 사용법: node analyze-rebirth.js <index.html> [시간(h)] [정체기준(분)]
'use strict';
const fs = require('fs');

function makeEl(id) {
  const el = {
    id: id || '', style: { setProperty(k, v){ this[k] = v; } },
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    textContent: '', dataset: {}, children: [], _handlers: {},
    offsetLeft: 0, offsetTop: 0, offsetWidth: 0,
    appendChild(c){ el.children.push(c); }, remove(){},
    addEventListener(ev, fn){ (el._handlers[ev] = el._handlers[ev] || []).push(fn); },
    click(){ (el._handlers.click || []).forEach(f => f()); },
    querySelectorAll(){ return []; },
  };
  let _html = '';
  Object.defineProperty(el, 'innerHTML', {        // innerHTML='' 시 children 비움 (실제 DOM 동작)
    get(){ return _html; }, set(v){ _html = v; if (v === '') el.children = []; },
  });
  return el;
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
global.setTimeout = () => 0;
global.prompt = () => null;
global.runSeconds = function(sec) {
  const stepMs = 100, steps = Math.ceil(sec * 1000 / stepMs);
  for (let i = 0; i < steps; i++) { simTime += stepMs; rafCb(simTime); }
};
global.report = console.log;
global.els = els;
global.HOURS = Number(process.argv[3] || 12);
global.STALL = Number(process.argv[4] || 6);

const html = fs.readFileSync(process.argv[2], 'utf8');
const src = html.split('<script>')[1].split('<' + '/script>')[0];

const body = `
function greedy() {
  for (let i = 0; i < 80 && S.gold >= upCost('atk'); i++) buyUpgrade('atk');
  for (let i = 0; i < 80 && S.gold >= upCost('hp'); i++) buyUpgrade('hp');
  if (S.upgrades.spd < 30 && S.gold >= upCost('spd')*3) buyUpgrade('spd');
  if (S.upgrades.crit < 45 && S.gold >= upCost('crit')*3) buyUpgrade('crit');
  for (const sk of SKILLS) if (S.level >= sk.unlock && S.gold >= skillUpCost(sk)*4) buySkillUp(sk.id);
  for (const s of SLOTS) if (S.equip[s.key] && S.gold >= enhCost(s.key)*5) buyEnhance(s.key);
  for (const r of RELICS) if (S.spores >= relicCost(r)) buyRelic(r.id);
  while (S.gold >= pull10Cost() * 2) doPulls(10);
  if (S.farm) { S.farm = false; S.kills = 0; player.hp = player.maxHp; spawnMonster(); }   // 보스벽 즉시 재도전
}

const rebirths = [];           // {n, min, maxStage, gain, sporesEarnedAfter, mult, climbMin}
let prevMaxAtRebirth = 1;
let lastImproveMin = 0, lastMax = 1;
let pendingClimb = null;       // 직전 환생 시점 기록 (복귀 시간 측정용)

for (let min = 0; min < HOURS * 60; min++) {
  runSeconds(60);
  greedy();

  // 복귀 시간 측정: 환생 후 이전 maxStage 회복까지 걸린 분
  if (pendingClimb && S.stage >= pendingClimb.target) {
    pendingClimb.rec.climbMin = min - pendingClimb.startMin;
    pendingClimb = null;
  }

  if (S.maxStage > lastMax) { lastMax = S.maxStage; lastImproveMin = min; }

  // 정체 판정: STALL분 동안 maxStage 정체 + 환생 이득 > 0 → 환생
  const stalled = (min - lastImproveMin) >= STALL;
  if (stalled && sporeGain() > 0) {
    const gain = sporeGain();
    const maxAt = S.maxStage;
    doPrestige();
    if (els['modalBtns'].children[0]) els['modalBtns'].children[0].click();
    const rec = { n: rebirths.length+1, min, maxStage: maxAt, gain,
      sporesEarnedAfter: S.life.sporesEarned, mult: 1 + S.life.sporesEarned*0.02,
      deltaMax: maxAt - prevMaxAtRebirth, climbMin: -1 };
    rebirths.push(rec);
    prevMaxAtRebirth = maxAt;
    pendingClimb = { target: maxAt, startMin: min, rec };
    lastMax = 1; lastImproveMin = min;
  }
}

report('=== 환생 곡선 분석 (' + HOURS + '시간, 정체기준 ' + STALL + '분) ===');
report('환생# | 시각 | maxStage | ΔmaxStage | 획득용비늘 | 누적용비늘 | 영구배율 | 복귀(분)');
for (const r of rebirths) {
  report(
    String(r.n).padStart(4) + ' | ' +
    (r.min+'분').padStart(6) + ' | ' +
    String(r.maxStage).padStart(8) + ' | ' +
    (r.deltaMax>=0?'+':'')+String(r.deltaMax).padStart(7) + ' | ' +
    String(r.gain).padStart(9) + ' | ' +
    String(r.sporesEarnedAfter).padStart(10) + ' | ' +
    ('×'+r.mult.toFixed(1)).padStart(8) + ' | ' +
    (r.climbMin<0?'미복귀':String(r.climbMin)).padStart(7)
  );
}
report('');
report('총 환생 ' + rebirths.length + '회 · 최종 maxStage ' + S.maxStage + ' · 최종 누적용비늘 ' + S.life.sporesEarned + ' · 최종 영구배율 ×' + (1+S.life.sporesEarned*0.02).toFixed(1));
if (rebirths.length >= 4) {
  const first3 = rebirths.slice(0,3).reduce((a,r)=>a+r.deltaMax,0)/3;
  const last3 = rebirths.slice(-3).reduce((a,r)=>a+r.deltaMax,0)/3;
  report('환생당 maxStage 증가폭: 초반3회 평균 +' + first3.toFixed(1) + ' → 후반3회 평균 +' + last3.toFixed(1) +
    '  (' + (last3 < first3*0.5 ? '⚠️ 절반 이하로 둔화 = 정체 확인' : '완만') + ')');
  const climbs = rebirths.filter(r=>r.climbMin>=0).map(r=>r.climbMin);
  if (climbs.length) report('환생 후 이전 최고stage 복귀 시간: 평균 ' + (climbs.reduce((a,b)=>a+b,0)/climbs.length).toFixed(1) + '분 (최대 ' + Math.max(...climbs) + '분)');
}
`;
(0, eval)(src + body);
