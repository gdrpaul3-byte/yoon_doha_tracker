# 윤도하 Tingle 트래커

Tingle 캐릭터 **윤도하**의 공개 지표를 Playwright로 수집하고, GitHub Pages에서 정적 대시보드로 보여주는 독립 프로젝트입니다.

## 대상 캐릭터

- 이름: 윤도하
- 캐릭터 ID: `45714`
- URL: <https://tingle.chat/chat/characters/45714>
- 수집 지표: `counter_1`, `counter_2`, `comments`
- 데이터 파일: `data/yoon-doha-stats.csv`, `data/yoon-doha-latest.json`, `data/yoon-doha-latest-report.txt`

## 설치

```bash
cd /root/projects/yoon-doha-tracker
npm install
```

Playwright 브라우저가 없는 환경이면 다음 명령도 실행합니다.

```bash
npx playwright install chromium
```

## 실행

```bash
npm run track
```

실행하면 CSV에는 새 행이 append되고, 최신 JSON과 텍스트 리포트가 갱신됩니다. 같은 날 또는 같은 값으로 중복 실행해도 기존 CSV 행은 제거하지 않습니다.

## GitHub Pages 대시보드

`index.html`은 브라우저에서 상대 경로로 `data/yoon-doha-stats.csv`와 `data/yoon-doha-latest.json`을 fetch합니다. GitHub Pages에 배포되면 다음 주소에서 확인합니다.

<https://gdrpaul3-byte.github.io/yoon_doha_tracker/>

## 자동 업데이트

```bash
./scripts/update-and-push.sh
```

스크립트는 다음 순서로 동작합니다.

1. `git fetch` 후 현재 브랜치를 원격 브랜치에 `--ff-only` 병합
2. `package-lock.json`이 있으면 `npm ci`, 없으면 필요 시 `npm install`
3. `node scripts/track-yoon-doha-stats.js` 실행
4. 데이터, 대시보드, README, 패키지, 스크립트 파일 add/commit/push
5. 최신 리포트, 대시보드 URL, Pages HTTP 상태 출력

## 프로젝트 구조

```text
/root/projects/yoon-doha-tracker/
├── README.md
├── index.html
├── package.json
├── scripts/
│   ├── track-yoon-doha-stats.js
│   └── update-and-push.sh
└── data/
    ├── yoon-doha-stats.csv
    ├── yoon-doha-latest.json
    └── yoon-doha-latest-report.txt
```
