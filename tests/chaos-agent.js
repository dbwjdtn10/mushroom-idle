// 카오스 에이전트 — 이상 유저 시뮬레이션 (익스플로잇 시나리오 + 랜덤 퍼징)
// 사용법: node tests/chaos-agent.js <index.html 경로> [시드]
'use strict';
const fs = require('fs');

function makeEl(id) {
  const el = {
    id: id || '', style: {},
    classList: {
      _set: new Set(),
      add(c){ this._set.add(c); }, remove(c){ this._set.delete(c); },
      toggle(c, on){ if (on === undefined) on = !this._set.has(c); if (on) this._set.add(c); else this._set.delete(c); },
      contains(c){ return this._set.has(c); },
    },
    textContent: '', dataset: {}, children: [], _handlers: {}, _parent: null,
    offsetLeft: 0, offsetTop: 0, offsetWidth: 0,
    appendChild(c){ c._parent = el; el.children.push(c); },
    remove(){ if (el._parent) { const i = el._parent.children.indexOf(el); if (i >= 0) el._parent.children.splice(i, 1); } },
    addEventListener(ev, fn){ (el._handlers[ev] = el._handlers[ev] || []).push(fn); },
    click(){ (el._handlers.click || []).forEach(f => f()); },
    querySelectorAll(){ return []; },
  };
  let _html = '';
  Object.defineProperty(el, 'innerHTML', {
    get(){ return _html; },
    set(v){ _html = v; if (v === '') el.children = []; },
  });
  Object.defineProperty(el, 'className', {
    get(){ return [...el.classList._set].join(' '); },
    set(v){ el.classList._set = new Set(String(v).split(/\s+/).filter(Boolean)); },
  });
  return el;
}

const els = {};
global.document = {
  getElementById(id){ if (!els[id]) els[id] = makeEl(id); return els[id]; },
  createElement(){ return makeEl(); },
  querySelectorAll(){ return []; },
  addEventListener(){},
  hidden: false,
};
const store = {};
global.localStorage = { getItem(k){ return k in store ? store[k] : null; }, setItem(k,v){ store[k]=String(v); }, removeItem(k){ delete store[k]; } };
global.window = { addEventListener(){} };
global.location = { reload(){} };
Object.defineProperty(global, 'navigator', { value: {}, configurable: true });
let simTime = 0;
global.performance = { now: () => simTime };
let rafCb = null;
global.requestAnimationFrame = cb => { rafCb = cb; };
global.setInterval = () => 0;
global.setTimeout = () => 0;
global.PROMPT_VAL = null;
global.prompt = () => global.PROMPT_VAL;
global.atob = s => Buffer.from(s, 'base64').toString('binary');
global.btoa = s => Buffer.from(s, 'binary').toString('base64');
global.els = els;
global.report = console.log;
global.SEED = Number(process.argv[3] || 20260612);
global.stepSim = ms => { simTime += ms; rafCb(simTime); };

const html = fs.readFileSync(process.argv[2], 'utf8');
const src = html.split('<script>')[1].split('<' + '/script>')[0];

const body = `
/* ===================== 카오스 에이전트 ===================== */
const failsX = [], passesX = [], chaosIssues = [], chaosErrors = [];
function expectT(name, cond, extra) {
  (cond ? passesX : failsX).push(name + (extra ? ' — ' + extra : ''));
}
function tryDo(name, fn) { try { return fn(); } catch (e) { chaosErrors.push(name + ': ' + e.message); } }
// 시드 고정 RNG (재현 가능)
let seed = SEED >>> 0;
function rng() { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
function pick(arr) { return arr[Math.floor(rng() * arr.length)]; }
function runSec(s) { for (let i = 0; i < s * 10; i++) stepSim(100); }

report('=== 1부: 익스플로잇 시나리오 ===');

// 워밍업: 자원·진행 확보
S.gold += 1e8; S.dia += 5000; runSec(30);
doPulls(10); recalcStats();

// [E1] 직업 선택 모달 더블탭 → 다이아 이중 지급?
S.level = 30;
startJobTrial();
monster.hp = 0; onMonsterDeath();
const diaJob = S.dia;
const jobBtns = $('modalBtns').children;
jobBtns[0].click(); jobBtns[0].click(); jobBtns[0].click();
expectT('직업선택 모달 연타 → 보상 1회만', S.dia === diaJob + 50 && S.jobTier === 1, 'dia +' + (S.dia - diaJob) + ' (기대 +50)');

// [E2] 환생 확인 모달 더블탭 → 포자 이중 지급?
S.maxStage = 45;
const gainE = sporeGain();
const seB = S.life.sporesEarned;
doPrestige();
const prBtns = $('modalBtns').children;
prBtns[0].click(); prBtns[0].click();
expectT('환생 모달 연타 → 포자 1회만', S.life.sporesEarned === seB + gainE, '+' + (S.life.sporesEarned - seB) + ' (기대 +' + gainE + ')');

// [E3] 오프라인 보상 모달 더블탭 → 골드 이중 지급?
recalcStats();
S.lastSeen = Date.now() - 3600 * 1000;
const goldOff = S.gold;
checkOffline();
const offBtns = $('modalBtns').children;
const expOff = Math.floor(mobGold(S.stage) * offlineKillRate() * 3600 * stats.goldMult * offlineEff());
offBtns[0].click(); offBtns[0].click();
expectT('오프라인 보상 연타 → 1회만', (S.gold - goldOff) < expOff * 1.5, '+' + Math.floor(S.gold - goldOff) + ' (기대 ~' + expOff + ')');

// [E4] 황금 버섯 더블탭 → 이중 보상?
const wealthG = S.gold + S.dia * 1e12;
spawnGolden();
const gels = $('battle').children;
const gel = gels[gels.length - 1];
gel._handlers.pointerdown[0]({ stopPropagation(){} });
const wealthAfter1 = S.gold + S.dia * 1e12;
gel._handlers.pointerdown[0]({ stopPropagation(){} });
expectT('황금 버섯 더블탭 → 1회만', S.gold + S.dia * 1e12 === wealthAfter1 && wealthAfter1 > wealthG);

// [E5] 조작된 저장 코드 (gold: 1e999 → Infinity) import 시 거부?
const savedSnapshot = localStorage.getItem('mushroomIdleSave_v2');
PROMPT_VAL = btoa(unescape(encodeURIComponent('{"gold":1e999,"dia":100}')));
importSave();
const stored = JSON.parse(localStorage.getItem('mushroomIdleSave_v2'));
expectT('Infinity 골드 import 거부', Number.isFinite(stored.gold), 'stored.gold=' + stored.gold);
PROMPT_VAL = null;

// [E6] 던전 입장 버튼 연타 → 입장권 이중 차감?
ensureDaily();
const dgB = S.daily.counts.dungeon;
enterDungeon('gold'); enterDungeon('gold'); enterDungeon('gold');
expectT('골드 던전 연타 → 1회만 차감', S.daily.counts.dungeon === dgB + 1, '+' + (S.daily.counts.dungeon - dgB));
exitDungeon(false);

// [E7] 자정 롤오버가 진행 중 콘텐츠를 깨뜨리지 않는지
enterDungeon('dia');
S.daily.date = '어제';
runSec(5);   // hasClaimables→ensureDaily가 매 프레임 돌며 리셋
expectT('자정 롤오버 중 던전 생존', (dungeonLeft > 0 || !monster.isDungeon) && Number.isFinite(S.dia) && S.daily.counts.diadungeon === 0, 'counts 리셋 + 던전 유지');
runSec(40);  // 던전 자연 종료

// [E8] 펫 진화/각성/강화 연타 (경계값)
S.pets.mouse = 5; S.petStars.mouse = 0; S.dia = 80;   // 정확히 1회분
evolvePet('mouse'); evolvePet('mouse'); evolvePet('mouse');
expectT('펫 진화 연타 + 다이아 경계값', S.petStars.mouse === 1 && S.dia === 0, 'star=' + S.petStars.mouse + ' dia=' + S.dia);
S.dia += 5000;
S.level = 200;   // 환생 직후라 스킬 해금 레벨 복구 필요
S.skills.fire = 9;
awakenSkill('fire'); awakenSkill('fire');
expectT('각성 이중 구매 방지', S.skillAwk.fire === 1 && S.dia === 5000 - 200, 'dia=' + S.dia);

report('통과 ' + passesX.length + ' / 실패 ' + failsX.length);
passesX.forEach(p => report('  ✅ ' + p));
failsX.forEach(f => report('  ❌ ' + f));

/* ===================== 2부: 카오스 몽키 (90분 퍼징) ===================== */
report('');
report('=== 2부: 카오스 몽키 (시드 ' + SEED + ') ===');
let prevTowerC = S.tower;
const ACTIONS = [
  () => doPulls(pick([1, 10])),
  () => buyUpgrade(pick(['atk','hp','spd','crit'])),
  () => buyEnhance(pick(['weapon','helmet','armor','gloves','boots','ring','없는부위'])),
  () => buySkillUp(pick(['fire','bolt','tornado','meteor','zzz'])),
  () => awakenSkill(pick(['fire','bolt','tornado','meteor','zzz'])),
  () => doPetPulls(pick([1, 10])),
  () => evolvePet(pick(['mouse','goldragon','drake','없는펫'])),
  () => enterDungeon(pick(['gold','dia',undefined])),
  () => startTower(),
  () => startJobTrial(),
  () => doPrestige(),
  () => claimQuest(pick(['kills','pulls','ups','boss','dungeon','tower','xx'])),
  () => claimAch(pick(['kills','stage','pulls','rebirth','pets','enh','job','tower','xx'])),
  () => buyRelic(pick(['gold','atk','hp','time','critdmg','xx'])),
  () => $('retryBossBtn').click(),
  () => { activeTab = pick(['upgrade','skill','equip','pet','prestige','more']); renderPanel(); },
  () => { for (let i = 0; i < 5; i++) $('battle')._handlers.pointerdown[0]({ target:{ closest:()=>null, classList:{ contains:()=>false } }, clientX:0, clientY:0 }); },
  () => { const m = $('modalBtns').children; if (m.length) for (let i = 0, n = 1 + Math.floor(rng()*3); i < n; i++) tryDo('모달', () => m[Math.floor(rng()*m.length)].click()); },
  () => { if (rng() < 0.1) S.daily.date = '롤오버' + Math.floor(rng()*1e6); },
  () => { exportSave(); },
];
for (let min = 0; min < 90; min++) {
  for (let i = 0; i < 600; i++) {
    stepSim(100);
    if (i % 7 === 0) tryDo('action', pick(ACTIONS));
    const m = $('modalBtns').children;   // 모달이 떠 있으면 수시로 마구 클릭
    if (m.length && $('modalOverlay').style.display === 'flex' && rng() < 0.3) tryDo('모달', () => m[Math.floor(rng()*m.length)].click());
    const b = $('battle');
    if (b.children.length > 80) b.children.splice(0, b.children.length - 40);
  }
  // 무결성 검사
  const bad = [];
  if (!Number.isFinite(S.gold) || S.gold < 0) bad.push('gold=' + S.gold);
  if (!Number.isFinite(S.dia) || S.dia < 0) bad.push('dia=' + S.dia);
  if (!Number.isFinite(S.spores) || S.spores < 0) bad.push('spores=' + S.spores);
  if (!stats || !Number.isFinite(stats.atk) || stats.atk <= 0) bad.push('atk=' + (stats && stats.atk));
  if (!monster) bad.push('monster=null');
  if (S.daily.counts.dungeon > 2 || S.daily.counts.diadungeon > 1) bad.push('던전한도 ' + S.daily.counts.dungeon + '/' + S.daily.counts.diadungeon);
  if ([dungeonLeft, trialLeft, towerLeft].filter(v => v > 0).length > 1) bad.push('모드충돌');
  if (S.tower < prevTowerC) bad.push('탑역행');
  prevTowerC = S.tower;
  if (S.jobTier < 0 || S.jobTier > 4) bad.push('jobTier=' + S.jobTier);
  if (bad.length) chaosIssues.push('[' + min + '분] ' + bad.join(', '));
}
report('진행: stage=' + S.maxStage + ' lv=' + S.level + ' 🗼' + S.tower + ' 환생' + S.life.rebirths + ' 💎' + Math.floor(S.dia));
report('무결성 이슈: ' + (chaosIssues.length || '없음'));
chaosIssues.slice(0, 10).forEach(i => report('  ⚠️ ' + i));
const uniqErr = [...new Set(chaosErrors)];
report('예외: ' + (uniqErr.length || '없음'));
uniqErr.slice(0, 10).forEach(e => report('  ❌ ' + e));

if (failsX.length || chaosIssues.length || uniqErr.length) { report(''); report('🔴 문제 발견'); process.exit(1); }
report('');
report('🟢 카오스 테스트 전체 통과');
`;

(0, eval)(src + body);
