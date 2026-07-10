#!/usr/bin/env node
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const PROJECT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(PROJECT, 'data');
const BASE_URL = 'https://tingle.chat/chat/characters';
const AUTH_PROFILE_DIR = process.env.TINGLE_BROWSER_PROFILE || '/root/projects/tingle-browser-research/browser-profile';

const CHARACTERS = [
  { id: '45714', name: '윤도하' },
  { id: '46604', name: '류하민' },
  { id: '46693', name: '서이담' },
  { id: '46696', name: '이사야' },
  { id: '46742', name: '한이든' },
  { id: '46743', name: '도재경' },
  { id: '46744', name: '유한설' },
].map((character) => ({
  ...character,
  url: `${BASE_URL}/${character.id}`,
}));

const FIELDS = [
  'collected_at_kst',
  'character_id',
  'name',
  'author',
  'visible',
  'counter_1',
  'operator_qa_counter_1_total',
  'net_customer_counter_1',
  'operator_qa_messages_total',
  'counter_2',
  'comments',
  'tags',
  'public_date',
  'cover_image_url',
  'url',
];

const COUNT_UNITS = {
  k: 1_000,
  K: 1_000,
  m: 1_000_000,
  M: 1_000_000,
  천: 1_000,
  만: 10_000,
  억: 100_000_000,
};

function kstNow() {
  const now = new Date();
  return new Date(now.getTime() + 9 * 60 * 60 * 1000);
}

function kstStamp() {
  return kstNow().toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' KST');
}

function parseKstStamp(value) {
  if (!value) return null;
  const text = String(value).trim().replace(' KST', '');
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second = '0'] = match;
  const utcMs = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour) - 9, Number(minute), Number(second));
  return Number.isFinite(utcMs) ? utcMs : null;
}

function csvEscape(value) {
  const s = value === undefined || value === null ? '' : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function parseCsvLine(line) {
  const cells = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      cells.push(field);
      field = '';
    } else {
      field += char;
    }
  }

  cells.push(field);
  return cells;
}

function readCsvRows(csvPath) {
  if (!fs.existsSync(csvPath)) return [];
  const lines = fs.readFileSync(csvPath, 'utf8').trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const header = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    return Object.fromEntries(header.map((key, index) => [key, cells[index] ?? '']));
  });
}

function latestRowsByCharacter(rows) {
  const latest = new Map();
  for (const row of rows) {
    if (row.character_id) latest.set(String(row.character_id), row);
  }
  return latest;
}

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
  if (current === null || current === undefined || current === '') return 'n/a';
  if (previous === null || previous === undefined || previous === '') return 'n/a';
  const p = Number(previous);
  const c = Number(current);
  if (!Number.isFinite(p) || !Number.isFinite(c)) return 'n/a';
  const d = c - p;
  return d === 0 ? '±0' : (d > 0 ? `+${d}` : String(d));
}

function readOperatorQaEvents() {
  const qaPath = path.join(DATA_DIR, 'operator-qa-events.json');
  if (!fs.existsSync(qaPath)) return [];
  try {
    const events = JSON.parse(fs.readFileSync(qaPath, 'utf8'));
    return Array.isArray(events) ? events : [];
  } catch (err) {
    console.warn(`⚠️ QA 이벤트 로그 파싱 실패: ${err.message}`);
    return [];
  }
}

function qaTotalsForCharacter(events, characterId, collectedAtKst) {
  const collectedMs = parseKstStamp(collectedAtKst) ?? Number.POSITIVE_INFINITY;
  const total = {
    operator_qa_counter_1_total: 0,
    operator_qa_messages_total: 0,
  };

  for (const event of events) {
    if (String(event.character_id) !== String(characterId)) continue;
    const eventMs = parseKstStamp(event.occurred_at_kst);
    if (eventMs !== null && eventMs > collectedMs) continue;
    const impact = Number(event.estimated_counter_1_delta ?? event.counter_1_delta_observed ?? 0);
    const messages = Number(event.messages_sent ?? event.turns ?? 0);
    if (Number.isFinite(impact)) total.operator_qa_counter_1_total += impact;
    if (Number.isFinite(messages)) total.operator_qa_messages_total += messages;
  }

  return total;
}

function applyOperatorQaAdjustments(stats, events) {
  return stats.map((stat) => {
    const totals = qaTotalsForCharacter(events, stat.character_id, stat.collected_at_kst);
    const counter1 = Number(stat.counter_1);
    const qaImpact = Number(totals.operator_qa_counter_1_total || 0);
    const netCustomer = Number.isFinite(counter1) ? Math.max(0, counter1 - qaImpact) : null;
    return {
      ...stat,
      ...totals,
      net_customer_counter_1: netCustomer,
    };
  });
}

function pickAuthor(lines, nameIdx) {
  if (nameIdx < 0) return '';
  const maybeAuthor = lines[nameIdx + 1] || '';
  if (!maybeAuthor || parseCount(maybeAuthor) !== null || maybeAuthor.startsWith('#')) return '';
  return maybeAuthor;
}

function pickCoverImage(raw, character) {
  const images = Array.isArray(raw.images) ? raw.images : [];
  const exactAlt = images.find((img) => String(img.alt || '').includes(`${character.name}썸네일 이미지`));
  if (exactAlt?.src) return exactAlt.src;

  const largeCharacterImage = images.find((img) =>
    String(img.src || '').includes('asset.tingle.chat/chat/')
    && Number(img.width || img.w || 0) >= 250
    && Number(img.height || img.h || 0) >= 250
  );
  if (largeCharacterImage?.src) return largeCharacterImage.src;

  const firstChatImage = images.find((img) => String(img.src || '').includes('asset.tingle.chat/chat/'));
  return firstChatImage?.src || '';
}

function parseStats(raw, character, collectedAtKst) {
  const lines = raw.text.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  const nameIdx = lines.findIndex((line) => line === character.name);
  const numericAfterName = [];

  if (nameIdx >= 0) {
    for (let i = nameIdx + 1; i < Math.min(lines.length, nameIdx + 14); i += 1) {
      const parsed = parseCount(lines[i]);
      if (parsed !== null) numericAfterName.push(parsed);
    }
  }

  const commentLine = lines.find((line) => /^댓글\s*\d+/.test(line));
  const commentCount = commentLine ? Number(commentLine.match(/\d+/)?.[0] || 0) : null;
  const publicDateIdx = lines.findIndex((line) => line.startsWith('최초 공개:'));
  const tagSearchEnd = publicDateIdx >= 0 ? publicDateIdx : Math.min(lines.length, nameIdx >= 0 ? nameIdx + 16 : 16);
  const tags = (nameIdx >= 0 ? lines.slice(nameIdx, tagSearchEnd) : lines.slice(0, tagSearchEnd))
    .filter((line) => /^#/.test(line))
    .slice(0, 10);
  const publicDateLine = publicDateIdx >= 0
    ? (lines[publicDateIdx].replace('최초 공개:', '').trim() || lines[publicDateIdx + 1] || '')
    : '';

  const intro = nameIdx >= 0
    ? lines.find((line) => line.length > 18 && !line.startsWith('#') && !line.startsWith('최초 공개:')) || ''
    : '';

  return {
    collected_at_kst: collectedAtKst,
    url: raw.url,
    title: raw.title,
    character_id: character.id,
    name: character.name,
    author: pickAuthor(lines, nameIdx),
    visible: raw.text.includes(character.name),
    counter_1: numericAfterName[0] ?? null,
    counter_2: numericAfterName[1] ?? null,
    comments: commentCount,
    tags: tags.join(' '),
    public_date: publicDateLine.replace('최초 공개:', '').trim(),
    cover_image_url: pickCoverImage(raw, character),
    intro,
  };
}

async function fetchStatsForCharacter(page, character, collectedAtKst) {
  await page.goto(character.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);

  const raw = await page.evaluate(() => {
    const visible = (el) => {
      const rect = el.getBoundingClientRect();
      return rect.width > 20 && rect.height > 20;
    };
    const images = [...document.images].filter(visible).map((img) => {
      const rect = img.getBoundingClientRect();
      return {
        src: img.src,
        alt: img.alt,
        width: rect.width,
        height: rect.height,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
      };
    });
    return {
      text: document.body.innerText,
      title: document.title,
      url: location.href,
      images,
    };
  });

  return parseStats(raw, character, collectedAtKst);
}

function clearProfileLocks(profileDir) {
  for (const name of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
    try { fs.unlinkSync(path.join(profileDir, name)); } catch (_) {}
  }
}

async function fetchAllStats() {
  const launchArgs = ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--disable-software-rasterizer', '--disable-features=UseChromeOSDirectVideoDecoder'];
  const useAuthProfile = fs.existsSync(AUTH_PROFILE_DIR);
  let context;
  let browser;

  if (useAuthProfile) {
    clearProfileLocks(AUTH_PROFILE_DIR);
    context = await chromium.launchPersistentContext(AUTH_PROFILE_DIR, {
      headless: true,
      channel: 'chrome',
      locale: 'ko-KR',
      viewport: { width: 1280, height: 900 },
      args: launchArgs,
    });
  } else {
    browser = await chromium.launch({ headless: true, args: launchArgs });
    context = await browser.newContext({ locale: 'ko-KR', viewport: { width: 1280, height: 900 } });
  }

  try {
    const page = context.pages()[0] || await context.newPage();
    const collectedAtKst = kstStamp();
    const stats = [];

    for (const character of CHARACTERS) {
      stats.push(await fetchStatsForCharacter(page, character, collectedAtKst));
    }

    return stats;
  } finally {
    await context?.close();
    await browser?.close();
  }
}

function writeCsvRows(csvPath, stats) {
  const exists = fs.existsSync(csvPath);
  if (!exists) {
    fs.writeFileSync(csvPath, FIELDS.join(',') + '\n', 'utf8');
  } else {
    const firstLine = fs.readFileSync(csvPath, 'utf8').split(/\r?\n/, 1)[0] || '';
    const currentHeader = parseCsvLine(firstLine);
    if (currentHeader.join('\u0001') !== FIELDS.join('\u0001')) {
      const oldRows = readCsvRows(csvPath);
      const migrated = [FIELDS.join(',')]
        .concat(oldRows.map((row) => FIELDS.map((field) => csvEscape(row[field])).join(',')))
        .join('\n');
      fs.writeFileSync(csvPath, `${migrated}\n`, 'utf8');
    }
  }

  const rows = stats
    .map((stat) => FIELDS.map((field) => csvEscape(stat[field])).join(','))
    .join('\n');
  fs.appendFileSync(csvPath, `${rows}\n`, 'utf8');
}

function buildReport(stats, previousByCharacter) {
  const collectedAt = stats[0]?.collected_at_kst || kstStamp();
  const lines = [
    '📊 Tingle 캐릭터 포트폴리오 실적 트래킹',
    `- 수집시각: ${collectedAt}`,
    '',
  ];

  for (const stat of stats) {
    const prev = previousByCharacter.get(stat.character_id);
    lines.push(
      `[${stat.character_id}] ${stat.name}`,
      `- 링크: ${stat.url}`,
      `- 공개 확인: ${stat.visible ? '정상 노출' : '비노출'}`,
      `- 제작자: ${stat.author || 'n/a'}`,
      `- 태그: ${stat.tags || '없음'}`,
      `- 카운터1: ${stat.counter_1 ?? 'n/a'} (${delta(stat.counter_1, prev?.counter_1)})`,
      `- QA 보정: 누적 QA 영향 ${stat.operator_qa_counter_1_total ?? 0}, QA 메시지 ${stat.operator_qa_messages_total ?? 0}`,
      `- 순수 고객 추정 counter_1: ${stat.net_customer_counter_1 ?? 'n/a'} (${delta(stat.net_customer_counter_1, prev?.net_customer_counter_1)})`,
      `- 카운터2: ${stat.counter_2 ?? 'n/a'} (${delta(stat.counter_2, prev?.counter_2)})`,
      `- 댓글: ${stat.comments ?? 'n/a'} (${delta(stat.comments, prev?.comments)})`,
      `- 최초 공개: ${stat.public_date || 'n/a'}`,
      '',
    );
  }

  return lines.join('\n').trimEnd();
}

(async () => {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const csvPath = path.join(DATA_DIR, 'yoon-doha-stats.csv');
  const latestPath = path.join(DATA_DIR, 'yoon-doha-latest.json');
  const reportPath = path.join(DATA_DIR, 'yoon-doha-latest-report.txt');

  const previousByCharacter = latestRowsByCharacter(readCsvRows(csvPath));
  const operatorQaEvents = readOperatorQaEvents();
  const stats = applyOperatorQaAdjustments(await fetchAllStats(), operatorQaEvents);

  writeCsvRows(csvPath, stats);
  fs.writeFileSync(latestPath, JSON.stringify(stats, null, 2), 'utf8');

  const report = buildReport(stats, previousByCharacter);
  fs.writeFileSync(reportPath, report, 'utf8');
  console.log(report);
})().catch((err) => {
  console.error(`❌ Tingle 캐릭터 포트폴리오 트래킹 실패: ${err.stack || err.message}`);
  process.exit(1);
});
