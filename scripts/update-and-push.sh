#!/usr/bin/env bash
set -euo pipefail

REPO="${REPO:-gdrpaul3-byte/yoon_doha_tracker}"
PAGES_URL="${PAGES_URL:-https://gdrpaul3-byte.github.io/yoon_doha_tracker/}"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BRANCH="${BRANCH:-}"

cd "$PROJECT_DIR"

echo "== 윤도하 Tingle 트래커 업데이트 =="
echo "프로젝트: $PROJECT_DIR"
echo "저장소: $REPO"

if [ -d .git ]; then
  if git remote get-url origin >/dev/null 2>&1; then
    git fetch origin
    if [ -z "$BRANCH" ]; then
      BRANCH="$(git rev-parse --abbrev-ref HEAD)"
    fi
    if git rev-parse --verify "origin/$BRANCH" >/dev/null 2>&1; then
      git merge --ff-only "origin/$BRANCH"
    else
      echo "원격 브랜치 origin/$BRANCH 가 없어 fast-forward 병합을 건너뜁니다."
    fi
  else
    echo "origin remote가 없어 git fetch/merge를 건너뜁니다."
  fi
else
  echo ".git 디렉터리가 없어 git fetch/merge를 건너뜁니다."
fi

if [ -f package-lock.json ]; then
  npm ci
elif [ ! -d node_modules ]; then
  npm install
else
  echo "node_modules가 있어 npm install을 건너뜁니다."
fi

node scripts/track-yoon-doha-stats.js

if [ -d .git ]; then
  shopt -s nullglob
  git add .gitignore data/*.csv data/*.json data/*.txt index.html README.md package*.json scripts/*.js scripts/*.sh

  if git diff --cached --quiet; then
    echo "커밋할 변경사항이 없습니다."
  else
    git commit -m "Update Yoon Doha tracker data"
    git push origin "${BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"
  fi
else
  echo ".git 디렉터리가 없어 add/commit/push를 건너뜁니다."
fi

echo
echo "== 최신 리포트 =="
if [ -f data/yoon-doha-latest-report.txt ]; then
  cat data/yoon-doha-latest-report.txt
else
  echo "리포트 파일이 없습니다."
fi

echo
echo "대시보드 URL: $PAGES_URL"
if command -v curl >/dev/null 2>&1; then
  pages_status="$(curl -L -s -o /dev/null -w '%{http_code}' "$PAGES_URL" || true)"
  echo "배포 상태: GitHub Pages HTTP $pages_status"
else
  echo "배포 상태: curl이 없어 HTTP 상태를 확인하지 못했습니다."
fi
