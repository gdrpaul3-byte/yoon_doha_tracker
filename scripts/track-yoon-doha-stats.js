#!/usr/bin/env node
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const PROJECT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(PROJECT, 'data');
const URL = 'https://tingle.chat/chat/characters/45714';
const CHARACTER_ID = '45714';
const CHARACTER_NAME = '윤도하';

function kstNow() {
  const now = new Date();
  return new Date(now.getTime() + 9 * 60 * 60 * 1000);
}

function kstStamp() {
  return kstNow().toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' KST');
}

function csvEscape(value) {
  const s = value === undefined || value === null ? '' : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function readLastCsvRow(csvPath) {
  if (!fs.existsSync(csvPath)) return null;
  const lines = fs.readFileSync(csvPath, 'utf8').trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return null;
  const header = lines[0].split(',');
  const row = lines[lines.length - 1].split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(v => v.replace(/^"|"$/g, '').replace(/""/g, '"'));
  return Object.fromEntries(header.map((h, i) => [h, row[i] ?? '']));
}

const COUNT_UNITS = {
  k: 1_000,
  K: 1_000,
  m: 1_000_000,
  M: 1_000_000,
  천: 1_000,
  만: 10_000,
  억: 100_000_000,
};

function parseCount(value) {
  if (value === undefined || value === null || typeof value === 'boolean') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : null;
  const text = String(value).trim().replace(/,/g, '');
  const match = text.match(/^(\d+(?:\.\d+)?|\.\d+)\s*([kKmM천만억]?)$/);
  if (!match) return null;
  const number = Number(match[1]);
  if (!Number.isFinite(number)) return null;
  return Math.trunc(number * (COUNT_UNITS[match[2]] || 1));
}

function delta(current, previous) {
  if (!previous) return '첫 기록';
  const p = Number(previous);
  const c = Number(current);
  if (!Number.isFinite(p) || !Number.isFinite(c)) return 'n/a';
  const d = c - p;
  return d === 0 ? '±0' : (d > 0 ? `+${d}` : String(d));
}

async function fetchStats() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage({ locale: 'ko-KR', viewport: { width: 1280, height: 900 } });
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2500);

    const raw = await page.evaluate(() => {
      const text = document.body.innerText;
      const title = document.title;
      const nextData = document.getElementById('__NEXT_DATA__')?.textContent || null;
      const buttons = [...document.querySelectorAll('button')].map((b) => ({
        text: (b.innerText || b.textContent || '').trim(),
        cls: String(b.className || ''),
        disabled: b.disabled,
      }));
      const imgs = [...document.querySelectorAll('img')].map((img) => ({
        src: img.src,
        alt: img.alt,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
      }));
      return { text, title, nextData, buttons, imgs, url: location.href };
    });

    if (/존재하지 않는 캐릭터|삭제된 캐릭터|로그인/.test(raw.text) && !raw.text.includes(CHARACTER_NAME)) {
      throw new Error(`character page not visible; url=${raw.url}; title=${raw.title}`);
    }

    const lines = raw.text.split(/\n+/).map(s => s.trim()).filter(Boolean);
    const nameIdx = lines.findIndex(x => x === CHARACTER_NAME);
    const author = nameIdx >= 0 ? lines[nameIdx + 1] : '';
    const numericAfterName = [];
    if (nameIdx >= 0) {
      for (let i = nameIdx + 1; i < Math.min(lines.length, nameIdx + 12); i += 1) {
        const parsed = parseCount(lines[i]);
        if (parsed !== null) numericAfterName.push(parsed);
      }
    }
    const commentLine = lines.find(x => /^댓글\s*\d+/.test(x));
    const commentCount = commentLine ? Number(commentLine.match(/\d+/)?.[0] || 0) : null;
    const tags = lines.filter(x => /^#/.test(x)).slice(0, 10);
    const publicDateIdx = lines.findIndex(x => x.startsWith('최초 공개:'));
    const publicDateLine = publicDateIdx >= 0
      ? (lines[publicDateIdx].replace('최초 공개:', '').trim() || lines[publicDateIdx + 1] || '')
      : '';
    const intro = lines.find(x => x.includes('당신을 체포하러 온 전 약혼자')) || '';

    // Tingle currently shows two unlabeled counters near the author. The UI does not expose
    // labels in plain text, so keep them as counter_1/counter_2 and track deltas over time.
    return {
      collected_at_kst: kstStamp(),
      url: raw.url,
      title: raw.title,
      character_id: CHARACTER_ID,
      name: CHARACTER_NAME,
      author,
      visible: raw.text.includes(CHARACTER_NAME),
      counter_1: numericAfterName[0] ?? null,
      counter_2: numericAfterName[1] ?? null,
      comments: commentCount,
      tags: tags.join(' '),
      public_date: publicDateLine.replace('최초 공개:', '').trim(),
      intro,
    };
  } finally {
    await browser.close();
  }
}

(async () => {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const csvPath = path.join(DATA_DIR, 'yoon-doha-stats.csv');
  const latestPath = path.join(DATA_DIR, 'yoon-doha-latest.json');
  const reportPath = path.join(DATA_DIR, 'yoon-doha-latest-report.txt');

  const prev = readLastCsvRow(csvPath);
  const stats = await fetchStats();

  const fields = ['collected_at_kst', 'character_id', 'name', 'author', 'visible', 'counter_1', 'counter_2', 'comments', 'tags', 'public_date', 'url'];
  const exists = fs.existsSync(csvPath);
  const row = fields.map(f => csvEscape(stats[f])).join(',') + '\n';
  if (!exists) fs.writeFileSync(csvPath, fields.join(',') + '\n', 'utf8');
  fs.appendFileSync(csvPath, row, 'utf8');
  fs.writeFileSync(latestPath, JSON.stringify(stats, null, 2), 'utf8');

  const report = [
    `📊 Tingle 윤도하 실적 트래킹`,
    `- 수집시각: ${stats.collected_at_kst}`,
    `- 링크: ${stats.url}`,
    `- 공개 확인: ${stats.visible ? '정상 노출' : '비노출'}`,
    `- 태그: ${stats.tags || '없음'}`,
    `- 카운터1: ${stats.counter_1 ?? 'n/a'} (${delta(stats.counter_1, prev?.counter_1)})`,
    `- 카운터2: ${stats.counter_2 ?? 'n/a'} (${delta(stats.counter_2, prev?.counter_2)})`,
    `- 댓글: ${stats.comments ?? 'n/a'} (${delta(stats.comments, prev?.comments)})`,
    `- 최초 공개: ${stats.public_date || 'n/a'}`,
  ].join('\n');

  fs.writeFileSync(reportPath, report, 'utf8');
  console.log(report);
})().catch((err) => {
  console.error(`❌ Tingle 윤도하 트래킹 실패: ${err.stack || err.message}`);
  process.exit(1);
});
