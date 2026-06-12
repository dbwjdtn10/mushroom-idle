// 플레이어 에이전트 — 페르소나별로 실제 유저처럼 플레이하며 무결성 검사
// 사용법: node player-agent.js <index.html 경로> <persona: active|idle|rusher> [시간(h)]
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
// setTimeout: 시뮬레이션에서 실시간 타이머는 의미 없음 → 즉시도 지연도 아닌 무시 (플로터/황금버섯 잔류는 수동 정리)
global.setTimeout = () => 0;
global.prompt = () => null;

global.els = els;
global.report = console.log;
global.PERSONA = process.argv[3] || 'active';
global.HOURS = Number(process.argv[4] || 6);

global.stepSim = function(stepMs) { simTime += stepMs; rafCb(simTime); };

const html = fs.readFileSync(process.argv[2], 'utf8');
const src = html.split('<script>')[1].split('<' + '/script>')[0];

const body = `
/* ===================== 플레이어 에이전트 ===================== */
const persona = PERSONA;
const issues = [];
const errors = [];
let prevTower = 0, prevLifeRebirths = 0, prevLevel = 1;
let taps = 0, goldens = 0, towersStarted = 0, trialsStarted = 0, dgGold = 0, dgDia = 0, petPullCnt = 0, evolveCnt = 0, awakenCnt = 0, prestigeCnt = 0;

function inv(name, cond, extra) {
  if (!cond) issues.push('[' + Math.floor(simMin) + '분] ' + name + (extra ? ' (' + extra + ')' : ''));
}
function act(name, fn) {
  try { return fn(); } catch (e) { errors.push('[' + Math.floor(simMin) + '분] ' + name + ': ' + e.message); }
}
let simMin = 0;

function isBusy() {
  return dungeonLeft > 0 || trialLeft > 0 || towerLeft > 0 || (monster && monster.isBoss);
}

// 모달 자동 응답: 직업 선택은 페르소나별, 그 외엔 첫 번째 버튼
function handleModal() {
  if ($('modalOverlay').style.display !== 'flex') return;
  const btns = $('modalBtns').children;
  if (!btns.length) return;
  let pick = 0;
  if (btns.length === 3 && $('modalTitle').textContent.includes('합격')) {
    pick = persona === 'active' ? 2 : persona === 'rusher' ? 0 : 1;   // 법사/검사/궁수
  }
  act('모달 클릭', () => btns[pick].click());
}

// 매 스텝(100ms): 탭 공격, 황금 버섯 줍기, 모달 응답
function eachStep(i) {
  handleModal();
  if (persona === 'active' && i % 5 === 0) {
    act('탭 공격', () => {
      $('battle')._handlers.pointerdown[0]({ target:{ closest:()=>null, classList:{ contains:()=>false } }, clientX:0, clientY:0 });
      taps++;
    });
  }
  if (persona !== 'idle') {
    for (const c of $('battle').children.slice()) {
      if (c.classList && c.classList.contains('golden') && !c._done && c._handlers.pointerdown) {
        c._done = true;
        act('황금 버섯', () => { c._handlers.pointerdown[0]({ stopPropagation(){} }); goldens++; });
      }
    }
  }
  // setTimeout 무시로 잔류하는 플로터/버섯 정리 (메모리 보호)
  const b = $('battle');
  if (b.children.length > 80) b.children.splice(0, b.children.length - 40);
}

// 매 분: 페르소나 행동
function eachMinute(min) {
  act('퀘스트 수령', () => { for (const q of QUESTS) claimQuest(q.id); });
  act('업적 수령', () => { for (const a of ACHS) claimAch(a.id); });

  if (persona === 'idle') {
    S.settings.autoPull = true;
    S.settings.autoEnh = true;
    if (min % 30 === 0) act('수련 구매', () => {
      for (let i = 0; i < 20 && S.gold >= upCost('atk'); i++) buyUpgrade('atk');
      for (let i = 0; i < 20 && S.gold >= upCost('hp'); i++) buyUpgrade('hp');
    });
    return;
  }

  // active / rusher 공통
  act('수련 구매', () => {
    for (let i = 0; i < 50 && S.gold >= upCost('atk'); i++) buyUpgrade('atk');
    for (let i = 0; i < 50 && S.gold >= upCost('hp'); i++) buyUpgrade('hp');
    if (S.upgrades.spd < 30 && S.gold >= upCost('spd')*3) buyUpgrade('spd');
    if (S.upgrades.crit < 45 && S.gold >= upCost('crit')*3) buyUpgrade('crit');
  });
  act('스킬 강화', () => { for (const sk of SKILLS) if (S.level >= sk.unlock && S.gold >= skillUpCost(sk)*4) buySkillUp(sk.id); });
  act('뽑기', () => { let n = 0; while (S.gold >= pull10Cost() * 1.5 && n++ < 30) doPulls(10); });
  act('장비 강화', () => { for (const s of SLOTS) if (S.equip[s.key] && S.gold >= enhCost(s.key)*5) buyEnhance(s.key); });
  act('유물 구매', () => { for (const r of RELICS) if (S.spores >= relicCost(r)) buyRelic(r.id); });
  act('스킬 각성', () => { for (const sk of SKILLS) awakenSkill(sk.id); });
  act('펫 진화', () => { for (const p of PETS) if (S.pets[p.id]) evolvePet(p.id); });

  if (persona === 'active') {
    if (S.dia >= 400) act('펫 뽑기', () => { doPetPulls(1); petPullCnt++; });
    if (!isBusy()) {
      if (canJobTrial()) { act('전직 시험', startJobTrial); trialsStarted++; }
      else if (min % 15 === 3) { act('탑 등반', startTower); towersStarted++; }
      else {
        act('골드 던전', () => enterDungeon('gold'));
        act('다이아 던전', () => enterDungeon('dia'));
      }
    }
    if (S.farm && min % 4 === 0) act('보스 재도전', () => $('retryBossBtn').click());
    const gain = sporeGain();
    if (gain >= 20 + S.life.sporesEarned * 0.4 && !isBusy()) { act('환생', doPrestige); prestigeCnt++; }
  } else { // rusher
    if (S.dia >= 200) act('펫 뽑기', () => { doPetPulls(1); petPullCnt++; });
    if (S.farm && min % 3 === 0) act('보스 재도전', () => $('retryBossBtn').click());
    if (sporeGain() >= 5 && !isBusy()) { act('환생', doPrestige); prestigeCnt++; }
  }
}

// 매 분: 무결성 검사
function checkInvariants(min) {
  inv('골드 비정상', Number.isFinite(S.gold) && S.gold >= 0, 'gold=' + S.gold);
  inv('다이아 비정상', Number.isFinite(S.dia) && S.dia >= 0, 'dia=' + S.dia);
  inv('포자 비정상', Number.isFinite(S.spores) && S.spores >= 0, 'spores=' + S.spores);
  inv('스탯 비정상', stats && Number.isFinite(stats.atk) && stats.atk > 0 && Number.isFinite(stats.maxHp), 'atk=' + (stats && stats.atk));
  inv('HP 초과', player.hp <= player.maxHp * 1.001, player.hp.toFixed(1) + '/' + player.maxHp.toFixed(1));
  inv('몬스터 없음', monster !== null);
  inv('골드 던전 한도 초과', S.daily.counts.dungeon <= 2, String(S.daily.counts.dungeon));
  inv('다이아 던전 한도 초과', S.daily.counts.diadungeon <= 1, String(S.daily.counts.diadungeon));
  inv('탑 기록 역행', S.tower >= prevTower, S.tower + '<' + prevTower);
  prevTower = S.tower;
  if (S.life.rebirths === prevLifeRebirths) inv('레벨 역행', S.level >= prevLevel, S.level + '<' + prevLevel);
  prevLifeRebirths = S.life.rebirths; prevLevel = S.level;
  inv('전직 차수 비정상', S.jobTier >= 0 && S.jobTier <= 4, String(S.jobTier));
  inv('동시 모드 충돌', [dungeonLeft, trialLeft, towerLeft].filter(v => v > 0).length <= 1,
    'dg=' + dungeonLeft.toFixed(1) + ' tr=' + trialLeft.toFixed(1) + ' tw=' + towerLeft.toFixed(1));
}

/* ===== 메인 루프 ===== */
const totalMin = HOURS * 60;
for (let min = 0; min < totalMin; min++) {
  simMin = min;
  for (let i = 0; i < 600; i++) { stepSim(100); eachStep(i); }   // 600 × 100ms = 1분
  eachMinute(min);
  checkInvariants(min);
  if (min % 60 === 0 || min === totalMin - 1) {
    report('[' + persona + '] t=' + min + '분 | stage=' + S.stage + '/' + S.maxStage + ' lv=' + S.level +
      ' | 🗼' + S.tower + ' 🎓' + (S.job || '-') + S.jobTier +
      ' | 💰' + fmt(S.gold) + ' 💎' + Math.floor(S.dia) + ' 🌀' + S.spores +
      ' | 환생' + S.life.rebirths + ' 각성' + Object.values(S.skillAwk).reduce((a,b)=>a+b,0) +
      ' 세트' + (stats.setRank ?? -1));
  }
}

function stepSimNoop(){}
report('');
report('=== [' + persona + '] 최종 리포트 (' + HOURS + '시간) ===');
report('진행: maxStage=' + S.maxStage + ', lv=' + S.level + ', 탑 ' + S.tower + '층, 전직 ' + (S.job || '없음') + ' ' + S.jobTier + '차, 환생 ' + S.life.rebirths + '회');
report('행동: 탭 ' + taps + ' · 황금버섯 ' + goldens + ' · 펫뽑기 ' + petPullCnt + ' · 누적처치 ' + fmt(S.life.kills));
report('재화: 💰' + fmt(S.gold) + ' 💎' + Math.floor(S.dia) + ' 🌀' + S.spores + ' · 도감 ' + Object.keys(S.codex.mobs).length + '/' + MONSTERS.length + '몹 ' + Object.keys(S.codex.bosses).length + '/' + BOSSES.length + '보스');
report('이슈: ' + (issues.length ? issues.length + '건' : '없음'));
issues.slice(0, 15).forEach(i => report('  ⚠️ ' + i));
report('예외: ' + (errors.length ? errors.length + '건' : '없음'));
[...new Set(errors)].slice(0, 15).forEach(e => report('  ❌ ' + e));
if (!issues.length && !errors.length) report('✅ 무결성 검사 전체 통과');
`;

let eachStepHook = null;
(0, eval)(src + body);
