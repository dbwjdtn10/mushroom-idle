# 🍄 버섯 키우기

램프를 문질러 장비를 모으고 버섯을 키우는 모바일 방치형 RPG. 의존성 없는 단일 HTML 파일 게임입니다.

## 실행

- **로컬**: `index.html`을 브라우저로 열면 바로 실행됩니다.
- **PWA(홈 화면 설치·오프라인)**: 서비스워커는 https(또는 localhost)에서만 동작하므로 호스팅이 필요합니다.

```
# 로컬에서 PWA 테스트
npx serve .          # 또는 python -m http.server
# → http://localhost:3000 접속 후 주소창의 설치 아이콘 확인
```

## 배포 (아무거나 택 1)

| 방법 | 절차 |
|---|---|
| **GitHub Pages** | 저장소 푸시 → Settings → Pages → Branch `main` / root 선택 |
| **Netlify Drop** | https://app.netlify.com/drop 에 폴더를 드래그 앤 드롭 |
| **itch.io** | 폴더를 zip으로 묶어 HTML 게임으로 업로드 (`index.html` 포함) |

배포 후 모바일 브라우저에서 접속 → "홈 화면에 추가"하면 앱처럼 전체화면으로 실행되고 오프라인에서도 동작합니다.

## 파일 구성

```
index.html            게임 본체 (단일 파일)
manifest.webmanifest  PWA 매니페스트
sw.js                 서비스워커 (오프라인 캐시) — 게임 수정 시 CACHE 버전 올릴 것
icon-192.png / icon-512.png  설치 아이콘
tests/                테스트 도구 (Node로 실행)
```

## 테스트

```
node tests/smoke.js index.html               # 단위 스모크 테스트 (74개 체크)
node tests/player-agent.js index.html active 6   # 플레이어 에이전트 (active|idle|rusher, 시간)
node tests/chaos-agent.js index.html [시드]   # 이상 유저 에이전트 (익스플로잇 + 랜덤 퍼징)
node tests/balance.js index.html             # 진행 곡선 시뮬레이션 (4시간)
node tests/make-icons.js                     # PWA 아이콘 재생성
```

## 주의

- 게임을 수정하면 `sw.js`의 `CACHE` 버전 문자열을 올려야 기존 설치 유저에게 새 버전이 배포됩니다.
- 저장은 `localStorage` 기반입니다. 메뉴 → 저장 내보내기/가져오기로 기기 간 이전이 가능합니다.
