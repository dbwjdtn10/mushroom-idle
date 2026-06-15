// 헤드리스 스모크 테스트 — index.html의 <script>를 DOM 스텁 위에서 실행
'use strict';
const fs = require('fs');

function makeEl(id) {
  const el = {
    id: id || '',
    style: { setProperty(k, v){ this[k] = v; } },
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    textContent: '',
    dataset: {},
    children: [],
    _handlers: {},
    offsetLeft: 0, offsetTop: 0, offsetWidth: 0,
    appendChild(c){ el.children.push(c); },
    remove(){},
    addEventListener(ev, fn){ (el._handlers[ev] = el._handlers[ev] || []).push(fn); },
    click(){ (el._handlers.click || []).forEach(f => f()); },
    querySelectorAll(){ return []; },
  };
  let _html = '';
  Object.defineProperty(el, 'innerHTML', {
    get(){ return _html; },
    set(v){ _html = v; if (v === '') el.children = []; },
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
global.localStorage = {
  getItem(k){ return k in store ? store[k] : null; },
  setItem(k,v){ store[k] = String(v); },
  removeItem(k){ delete store[k]; },
};
global.window = { addEventListener(){} };
global.location = { reload(){} };
Object.defineProperty(global, 'navigator', { value: {}, configurable: true });
global.performance = { now: () => simTime };
let rafCb = null;
global.requestAnimationFrame = cb => { rafCb = cb; };
global.setInterval = () => 0;
global.prompt = () => null;

let simTime = 0;
function runSeconds(sec, stepMs) {
  stepMs = stepMs || 100;
  const steps = Math.ceil(sec * 1000 / stepMs);
  for (let i = 0; i < steps; i++) { simTime += stepMs; rafCb(simTime); }
}

// index.html에서 스크립트 추출
const html = fs.readFileSync(process.argv[2], 'utf8');
const src = html.split('<script>')[1].split('<' + '/script>')[0];

let failed = 0;
global.check = function check(name, cond, extra) {
  if (cond) console.log('PASS  ' + name + (extra ? '  (' + extra + ')' : ''));
  else { failed++; console.log('FAIL  ' + name + (extra ? '  (' + extra + ')' : '')); }
};
global.els = els;
global.runSeconds = runSeconds;
global.getFailed = () => failed;

// 게임 소스 + 테스트 본문을 같은 스코프에서 실행 (let 바인딩 접근 위해)
const body = `
check('init: 게임 부팅', S.level === 1 && monster !== null);

// 1) 전투 진행 — 120초 동안 골드/처치 누적, 스테이지 전진
runSeconds(120);
check('전투: 골드 획득', S.gold > 60, 'gold=' + Math.floor(S.gold));
check('전투: 처치 누적', S.life.kills > 0, 'kills=' + S.life.kills);

// 2) 뽑기 — 골드 지급 후 10연차
S.gold += 1e6;
doPulls(10);
check('뽑기: 레벨 상승', S.level > 1, 'level=' + S.level);
const anyItem = Object.values(S.equip).some(it => it);
check('뽑기: 장비 장착', anyItem);

// 3) 장비 강화
const slotKey = Object.keys(S.equip).find(k => S.equip[k]);
const before = S.enhance[slotKey];
S.gold += 1e6;
buyEnhance(slotKey);
check('강화: 레벨 +1', S.enhance[slotKey] === before + 1, slotKey + ' +' + S.enhance[slotKey]);
const atkBefore = stats.atk;
buyEnhance(slotKey); buyEnhance(slotKey);
check('강화: 스탯 반영', S.equip[slotKey].atk > 0 ? stats.atk >= atkBefore : true, 'atk=' + Math.floor(stats.atk));

// 4) 골드 던전 — 입장, 45초 후 자동 종료
const goldBeforeDg = S.gold;
enterDungeon();
check('던전: 입장', dungeonLeft > 0 && monster.isDungeon, 'left=' + dungeonLeft);
check('던전: 일일 카운트', S.daily.counts.dungeon === 1);
runSeconds(50);
check('던전: 자동 종료', dungeonLeft === 0 && !monster.isDungeon);
check('던전: 골드 수익', S.gold > goldBeforeDg, '+' + Math.floor(S.gold - goldBeforeDg));
enterDungeon(); runSeconds(50);
enterDungeon();
check('던전: 일일 2회 제한', S.daily.counts.dungeon === 2 && dungeonLeft === 0);

// 5) 일일 퀘스트 — 던전 퀘스트 수령 가능 여부
const dgQuestDone = S.daily.counts.dungeon >= 1;
const diaBefore = S.dia;
claimQuest('dungeon');
check('퀘스트: 던전 퀘스트 보상', dgQuestDone && S.dia === diaBefore + 25, 'dia=' + S.dia);

// 6) v1 score 누락 마이그레이션 버그 수정 확인
const legacy = JSON.parse(JSON.stringify(S));
legacy.equip.weapon = { slot:'weapon', rarity:0, atk:10, hp:5 }; // score 없음
mergeState(legacy);
check('마이그레이션: score 재계산', S.equip.weapon.score === 10*5 + 5, 'score=' + S.equip.weapon.score);
check('마이그레이션: enhance 보존', S.enhance[slotKey] === before + 3);

// 7) 환생 — 모달 버튼 클릭 시뮬레이션
S.maxStage = 45;
const expectedSpores = sporeGain();   // 공식 변경에 견고하도록 직접 호출
check('환생: 용비늘 획득량 공식(깊이 초선형)', expectedSpores === Math.floor(15 * 1.2 * (1 + 45/300)), 'gain=' + expectedSpores);
doPrestige();
const modalBtns = els['modalBtns'].children;
const sporesEarnedBefore = S.life.sporesEarned;
modalBtns[0].click(); // '환생!'
check('환생: 포자 획득', S.life.sporesEarned === sporesEarnedBefore + expectedSpores, 'spores=' + S.spores);
check('환생: 스테이지 초기화', S.stage === 1 && S.level === 1);
check('환생: 시작 골드 보너스', S.gold >= 60 + S.life.sporesEarned * 100, 'gold=' + Math.floor(S.gold));
check('환생: 강화 초기화', Object.values(S.enhance).every(v => v === 0));
check('환생: 펫/다이아 유지', S.dia > 0);

// 8) 환생 후 전투 정상 동작
runSeconds(30);
check('환생 후: 전투 재개', S.life.kills > 0 && monster !== null);

// 9) 저장/로드 왕복
saveGame();
const saved = JSON.parse(localStorage.getItem('mushroomIdleSave_v2'));
check('저장: enhance 직렬화', saved.enhance && typeof saved.enhance.weapon === 'number');
check('저장: 던전 카운트 직렬화', typeof saved.daily.counts.dungeon === 'number');

// ===== v4 기능 =====

// 10) 탭 공격
monster.maxHp = 1e9; monster.hp = 1e9;
els['battle']._handlers.pointerdown[0]({ target:{ closest:()=>null, classList:{ contains:()=>false } }, clientX:50, clientY:80 });
check('탭 공격: 데미지 적용', monster.hp < 1e9, '-' + Math.floor(1e9 - monster.hp));

// 11) 황금 버섯
const battleEl = els['battle'];
spawnGolden();
const gel = battleEl.children[battleEl.children.length - 1];
check('황금 버섯: 생성', gel.className === 'golden');
const wealthB = S.gold + S.dia * 1e9;
gel._handlers.pointerdown[0]({ stopPropagation(){} });
check('황금 버섯: 보상 지급', S.gold + S.dia * 1e9 > wealthB);

// 12) 펫 성급 진화
S.pets.mouse = 5; S.dia += 1000;
evolvePet('mouse');
check('펫 진화: 1성 달성', S.petStars.mouse === 1);
const pb = petBonuses();
check('펫 진화: 효과 +60%', Math.abs(pb.gold - 0.02*5*1.6) < 1e-9, 'gold bonus=' + pb.gold.toFixed(3));
evolvePet('mouse'); // 2성은 Lv.10 필요 → 실패해야 함
check('펫 진화: 레벨 조건 검사', S.petStars.mouse === 1);

// 13) 다이아 던전
spawnMonster(); // 보스 전투 상태 해제용 현재 상태 확인
if (monster.isBoss) { S.farm = true; spawnMonster(); }
const diaB2 = S.dia;
enterDungeon('dia');
check('다이아 던전: 입장', dungeonLeft === 30 && monster.diaDrop >= 1, 'drop=' + (monster.diaDrop||0));
runSeconds(35);
check('다이아 던전: 종료 + 다이아 수익', dungeonLeft === 0 && S.dia > diaB2, '+' + (S.dia - diaB2));
enterDungeon('dia');
check('다이아 던전: 일일 1회 제한', dungeonLeft === 0);

// 14) 도감
check('도감: 몬스터 기록', Object.keys(S.codex.mobs).length > 0, Object.keys(S.codex.mobs).length + '종');
check('도감: 장비 등급 기록', Object.keys(S.codex.rarities).length > 0);
const atkNoCodex = (() => { const c = S.codex; S.codex = {mobs:{},bosses:{},rarities:{}}; recalcStats(); const a = stats.atk; S.codex = c; recalcStats(); return a; })();
check('도감: 영구 보너스 반영', stats.atk > atkNoCodex);

// 15) 자동 뽑기 / 자동 강화
S.settings.autoPull = true; S.gold += 1e9;
const pullsB = S.pulls;
runSeconds(10);
check('자동 뽑기: 동작', S.pulls > pullsB, '+' + (S.pulls - pullsB) + '회');
S.settings.autoPull = false;
S.settings.autoEnh = true; S.gold += 1e9;
const enhB = Object.values(S.enhance).reduce((a,b)=>a+b,0);
runSeconds(10);
check('자동 강화: 동작', Object.values(S.enhance).reduce((a,b)=>a+b,0) > enhB);
S.settings.autoEnh = false;

// 16) 환생 시 펫 성급/도감 유지
S.maxStage = 45;
doPrestige();
els['modalBtns'].children[0].click();
check('환생: 펫 성급 유지', S.petStars.mouse === 1);
check('환생: 도감 유지', Object.keys(S.codex.rarities).length > 0);
check('환생: 자동 설정 유지', S.settings.autoPull === false && S.settings.sound === true);

// 17) v4 필드 저장 왕복
saveGame();
const saved2 = JSON.parse(localStorage.getItem('mushroomIdleSave_v2'));
check('저장: petStars/codex 직렬화', saved2.petStars && saved2.codex && typeof saved2.daily.counts.diadungeon === 'number');
mergeState(saved2);
check('로드: petStars/codex 복원', S.petStars.mouse === 1 && Object.keys(S.codex.rarities).length > 0);
recalcStats();

// ===== v5 전직 시스템 =====

// 18) 전직 시험 — 도전/실패
S.level = 30;
check('전직: 도전 가능 판정', canJobTrial());
startJobTrial();
check('전직: 시험관 등장', trialLeft === 30 && monster.isTrial === true, 'hp=' + Math.floor(monster.maxHp));
monster.maxHp = 1e15; monster.hp = 1e15;   // 못 잡게 만들어 시간 초과 유도
runSeconds(35);
check('전직: 실패해도 불이익 없음', trialLeft === 0 && S.jobTier === 0 && !monster.isTrial);

// 19) 재도전 → 합격 → 직업 선택
startJobTrial();
monster.hp = 0; onMonsterDeath();
check('전직: 합격 시 직업 선택 모달 (3개)', els['modalBtns'].children.length === 3);
els['modalBtns'].children[1].click();   // 🏹 궁수
check('전직: 궁수 1차 전직', S.job === 'archer' && S.jobTier === 1);
check('전직: 궁수 효과 반영', Math.abs(stats.aps - (1 + 0.05*S.upgrades.spd) * 1.08) < 1e-9 && stats.crit >= 0.09 - 1e-9, 'aps=' + stats.aps.toFixed(2) + ' crit=' + stats.crit.toFixed(2));

// 20) 2차 승급 + 다이아 보상
S.level = 80;
startJobTrial();
const diaB3 = S.dia;
monster.hp = 0; onMonsterDeath();
check('전직: 2차 승급 + 💎100 보상', S.jobTier === 2 && S.dia === diaB3 + 100);
closeModal();

// 21) 법사 효과 (직접 전환해 수치 확인)
S.job = 'mage'; recalcStats();
check('전직: 법사 스킬 배율/쿨감', Math.abs(stats.skillMult - 1.8) < 1e-9 && Math.abs(stats.cdMult - 0.88) < 1e-9);
S.job = 'archer'; recalcStats();

// 22) 환생 후 전직 유지
S.maxStage = 45;
doPrestige();
els['modalBtns'].children[0].click();
check('전직: 환생 후 직업/차수 유지', S.job === 'archer' && S.jobTier === 2);
saveGame();
const saved3 = JSON.parse(localStorage.getItem('mushroomIdleSave_v2'));
check('전직: 저장 직렬화', saved3.job === 'archer' && saved3.jobTier === 2);

// ===== v6 무한의 탑 =====

// 23) 등반 시작 → 1층 수호자
startTower();
check('탑: 1층 도전 시작', towerLeft === 30 && monster.isTower === true && monster.name === '1층 수호자');

// 24) 층 클리어 → 보상 + 자동 다음 층
const diaT = S.dia, goldT = S.gold;
monster.hp = 0; onMonsterDeath();
check('탑: 1층 클리어 기록', S.tower === 1);
check('탑: 첫 클리어 보상 (💎3+💰)', S.dia === diaT + 3 && S.gold > goldT);
check('탑: 다음 층 자동 연속 도전', towerLeft === 30 && monster.isTower && monster.name === '2층 수호자');

// 25) 10층 보너스
while (S.tower < 9) { monster.hp = 0; onMonsterDeath(); }
const diaT2 = S.dia;
monster.hp = 0; onMonsterDeath();   // 10층 클리어
check('탑: 10층 보너스 (+30💎)', S.tower === 10 && S.dia === diaT2 + 3 + Math.floor(10/4) + 30, '+' + (S.dia - diaT2));

// 26) 시간 초과 → 등반 종료, 기록 유지
monster.maxHp = 1e15; monster.hp = 1e15;
runSeconds(35);
check('탑: 시간 초과 시 종료 + 기록 유지', towerLeft === 0 && S.tower === 10 && !monster.isTower);

// 27) 일일 퀘스트 / 업적 연동
check('탑: 일일 퀘스트 카운트', S.daily.counts.tower >= 10);
const towerAch = ACHS.find(a => a.id === 'tower');
check('탑: 업적 달성 가능 (10층)', towerAch.stat() === 10 && achClaimable(towerAch));

// 28) 환생 후 탑 기록 유지
S.maxStage = 45;
doPrestige();
els['modalBtns'].children[0].click();
check('탑: 환생 후 기록 유지', S.tower === 10);

// 29) 던전/시험과 동시 진행 차단
startTower();
const dgCount = S.daily.counts.dungeon;
enterDungeon('gold');
check('탑: 등반 중 던전 입장 차단', dungeonLeft === 0 && S.daily.counts.dungeon === dgCount);
exitTower('테스트 종료.');

// ===== v7 스킬 각성 / 세트 효과 =====

// 30) 세트 효과 — 전 부위 희귀(2) 장착 시 +12%
for (const s of SLOTS) S.equip[s.key] = { slot:s.key, rarity:2, atk:100, hp:100, score:600 };
recalcStats();
const atkSet = stats.atk;
check('세트: 희귀 세트 인식', stats.setRank === 2);
S.equip.ring.rarity = 0;   // 한 부위만 일반로 강등
recalcStats();
check('세트: 최소 등급 기준 적용', stats.setRank === 0);
check('세트: +12% 보너스 수치', Math.abs(atkSet / stats.atk - 1.12) < 1e-9, 'ratio=' + (atkSet/stats.atk).toFixed(4));   // 일반 세트(rank0)는 0% 보너스
S.equip.ring.rarity = 2;
recalcStats();

// 31) 스킬 각성 — 조건 검사
S.level = 200;   // 모든 스킬 해금
S.dia += 10000;
awakenSkill('fire');
check('각성: 스킬 레벨 미달 시 거부', S.skillAwk.fire === 0);
S.skills.fire = 9;   // 표시 Lv.10
const diaA = S.dia;
awakenSkill('fire');
check('각성: 파이어볼 각성 성공 (💎200)', S.skillAwk.fire === 1 && S.dia === diaA - 200);

// 32) 화상 도트
monster.maxHp = 1e9; monster.hp = 1e9;
castSkill(SKILLS[0]);   // fire
check('각성: 화상 부여', monster.burn && monster.burn.t === 3 && monster.burn.dps > 0);
const hpBurn = monster.hp;
runSeconds(2);
check('각성: 화상 도트 피해', monster.hp < hpBurn);

// 33) 대회오리 질풍 / 메테오 강화
S.skills.tornado = 9; S.skills.meteor = 9;
awakenSkill('tornado'); awakenSkill('meteor');
castSkill(SKILLS[2]);   // tornado
check('각성: 질풍 발동 (공속 버프)', S.skillAwk.tornado === 1);
monster.maxHp = 1e12; monster.hp = 1e12;
const hpM = monster.hp;
castSkill(SKILLS[3]);   // meteor
const dealt = hpM - monster.hp;
const expected = stats.atk * (25 + 4*9) * (stats.skillMult||1) * 1.8;
check('각성: 메테오 피해 +80%', dealt > expected*0.94 && dealt < expected*1.06, 'dealt=' + Math.floor(dealt) + ' vs ' + Math.floor(expected));

// 34) 환생 후 각성 유지 + 저장 왕복
S.maxStage = 45;
doPrestige();
els['modalBtns'].children[0].click();
check('각성: 환생 후 유지', S.skillAwk.fire === 1 && S.skillAwk.meteor === 1);
saveGame();
const saved4 = JSON.parse(localStorage.getItem('mushroomIdleSave_v2'));
check('각성: 저장 직렬화', saved4.skillAwk && saved4.skillAwk.fire === 1);

// ===== v8 오프라인 보상 (효율 + 온라인 초과 금지) =====

// 35) 효율 곡선
const tB2 = S.relics.time, rB2 = S.life.rebirths, twB2 = S.tower;
S.relics.time = 0; S.life.rebirths = 0; S.tower = 0;
check('오프라인: 기본 효율 75%', Math.abs(offlineEff() - 0.75) < 1e-9);
S.life.rebirths = 10; S.tower = 50;
check('오프라인: 성장 연동 +15%p', Math.abs(offlineEff() - 0.9) < 1e-9);
S.relics.time = 5;
check('오프라인: 효율 100% 상한', offlineEff() === 1);
check('오프라인: 캡 12h+2h/모래시계, 24h 상한', offlineCapSec() === 22*3600 && (S.relics.time = 7, offlineCapSec() === 24*3600) && (S.relics.time = 5, true));

// 36) 효율 100%에서도 온라인 파밍 실측을 넘지 않는지 (스킬 잠김 + 다타 구간 = 최악 케이스)
S.upgrades.hp += 300;   // 사망 방지
S.stage = 30;
recalcStats();
while (offlineKillRate() >= stats.aps && S.stage < 300) S.stage += 5;   // 다타 구간 찾기
if (isBossStage(S.stage)) S.stage++;
S.farm = true; S.kills = 0;
spawnMonster();
player.hp = player.maxHp;
const goldOnB = S.gold;
runSeconds(600);
const onlineGain = S.gold - goldOnB;
const offlineGain = Math.floor(mobGold(S.stage) * offlineKillRate() * 600 * stats.goldMult * offlineEff());
check('오프라인 100% ≤ 온라인 실측 (10분 파밍 비교)', offlineGain <= onlineGain && onlineGain > 0,
  'off=' + fmt(offlineGain) + ' / on=' + fmt(onlineGain) + ' @stage' + S.stage);

// 37) 보상 모달 — 수치 일치 + 더블탭 1회 지급
S.lastSeen = Date.now() - 2 * 3600 * 1000;
const goldOffB2 = S.gold;
checkOffline();
const expOff2 = Math.floor(mobGold(S.stage) * offlineKillRate() * 7200 * stats.goldMult * offlineEff());
els['modalBtns'].children[0].click();
els['modalBtns'].children[0].click();
check('오프라인: 보상 1회 지급 + 수치 일치', Math.abs((S.gold - goldOffB2) - expOff2) <= expOff2 * 0.01 + 2, '+' + fmt(S.gold - goldOffB2));
S.relics.time = tB2; S.life.rebirths = rB2; S.tower = twB2;

// ===== 길드 원정 =====

// 38) 기본 상태 + 슬롯 수 곡선
check('길드: 초기 Lv.1 슬롯 1개', S.guild.level === 1 && guildSlotCount(1) === 1);
check('길드: 슬롯 곡선 (4레벨당 +1, 최대 4)', guildSlotCount(5) === 2 && guildSlotCount(13) === 4 && guildSlotCount(99) === 4);

// 39) 파견 — 빈 슬롯에 들어가고 일일 카운트 + endAt 미래
S.daily.counts.exped = 0;
S.guild.slots = [null,null,null,null];
dispatchExped('patrol');
check('길드: 파견 시 슬롯 점유', S.guild.slots[0] && S.guild.slots[0].type === 'patrol', 'slot0=' + (S.guild.slots[0]&&S.guild.slots[0].type));
check('길드: 파견 일일 퀘스트 트래킹', S.daily.counts.exped === 1);
check('길드: endAt 미래값', S.guild.slots[0].endAt > Date.now());

// 40) 슬롯 가득 시 추가 파견 거부 (Lv.1은 슬롯 1개)
dispatchExped('hunt');
check('길드: 슬롯 1개 초과 파견 거부', S.guild.slots[1] === null);

// 41) 잠긴 원정(relic minLv4) 파견 거부
S.guild.slots = [null,null,null,null]; S.guild.level = 1;
dispatchExped('relic');
check('길드: 미해금 원정 거부', S.guild.slots.every(s => s === null));

// 42) 완료 + 수령 — 보상 지급 + exp 적립, slotDone 판정
S.guild.level = 5; // 슬롯 2개
S.guild.slots = [null,null,null,null];
S.maxStage = 100;
dispatchExped('patrol');
S.guild.slots[0].endAt = Date.now() - 1000; // 강제 완료
check('길드: 완료 판정', guildReady() === true);
const eP = EXPEDITIONS.find(e=>e.id==='patrol');
const rP = expedReward(eP);
const goldGB = S.gold, expGB = S.guild.exp;
collectExped(0);
check('길드: 수령 시 골드 지급', S.gold === goldGB + rP.gold && rP.gold > 0, '+' + fmt(rP.gold));
check('길드: 수령 시 슬롯 비움', S.guild.slots[0] === null);
check('길드: 수령 시 exp 적립', S.guild.exp === expGB + rP.exp);

// 43) 보상 진행도 연동 — maxStage 높을수록 골드 보상 증가
S.maxStage = 50;  const r50 = expedReward(eP).gold;
S.maxStage = 200; const r200 = expedReward(eP).gold;
check('길드: 보상 진행도 연동', r200 > r50, fmt(r50) + ' → ' + fmt(r200));

// 44) 즉시완료 — 다이아 차감 + 즉시 수령 (남은 1분당 💎1)
S.guild.level = 5; S.guild.slots = [null,null,null,null]; S.maxStage = 100;
dispatchExped('hunt');
const sH = S.guild.slots[0];
const cost = Math.max(1, Math.ceil((sH.endAt - Date.now())/60000));
S.dia = cost + 50;
const diaIB = S.dia, goldIB = S.gold;
const rH = expedReward(EXPEDITIONS.find(e=>e.id==='hunt'));
instantExped(0);
check('길드: 즉시완료 다이아 차감', S.dia === diaIB - cost + rH.dia, 'cost=' + cost + ' 보상dia=' + rH.dia);
check('길드: 즉시완료 후 수령됨', S.guild.slots[0] === null && S.gold === goldIB + rH.gold);

// 45) 즉시완료 다이아 부족 시 거부
S.guild.slots = [null,null,null,null];
dispatchExped('hunt');
S.dia = 0;
instantExped(0);
check('길드: 다이아 부족 시 즉시완료 거부', S.guild.slots[0] && !slotDone(S.guild.slots[0]));

// 46) 레벨업 — 임계치 도달 시 레벨 상승 + 잔여 exp 이월
S.guild.level = 1; S.guild.exp = 0;
addGuildExp(guildExpNeed(1) + 5);
check('길드: 레벨업 + exp 이월', S.guild.level === 2 && S.guild.exp === 5, 'lv=' + S.guild.level + ' exp=' + S.guild.exp);
S.guild.level = GUILD_MAX_LV; S.guild.exp = 0;
addGuildExp(99999);
check('길드: 최대 레벨 상한', S.guild.level === GUILD_MAX_LV && S.guild.exp === 0);

// 47) 환생 유지 — guild가 keep 목록에 포함
S.guild.level = 7; S.guild.exp = 33;
S.guild.slots = [null,null,null,null];
dispatchExped('patrol');
S.maxStage = 45;
doPrestige();
els['modalBtns'].children[0].click();
check('길드: 환생 후 레벨/슬롯 유지', S.guild.level === 7 && S.guild.exp === 33 && S.guild.slots[0] && S.guild.slots[0].type === 'patrol');

// 48) 저장/로드 왕복 + 손상 슬롯 방어
saveGame();
const savedG = JSON.parse(localStorage.getItem('mushroomIdleSave_v2'));
check('길드: 저장 직렬화', savedG.guild && savedG.guild.level === 7 && Array.isArray(savedG.guild.slots));
const corrupt = JSON.parse(JSON.stringify(S));
corrupt.guild.slots = [{type:'nonexistent', endAt:123}, {type:'patrol'}, null, null];
corrupt.guild.level = 999;
mergeState(corrupt);
check('길드: 손상 슬롯 정화', S.guild.slots[0] === null && S.guild.slots[1] === null, JSON.stringify(S.guild.slots.map(s=>s&&s.type)));
check('길드: 레벨 상한 클램프', S.guild.level === GUILD_MAX_LV);
`;

(0, eval)(src + body);

console.log(failed === 0 ? '\nALL PASSED' : '\n' + failed + ' FAILED');
process.exit(failed === 0 ? 0 : 1);
