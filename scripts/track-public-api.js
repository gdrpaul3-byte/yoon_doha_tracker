#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { mapPersonaStatistics, migrateLegacyHeaders } = require('./public-api-metrics');

const PROJECT = path.resolve(__dirname, '..');
const DATA_DIR = process.env.OUTPUT_DIR || path.join(PROJECT, 'data');
const API_URL = 'https://api.tingle.chat/public/personas/v3?personaIds=45714,46604,46693,46696,46742,46743,46744,51025&languageCode=ko&countryCode=KR';
// Single registry for every live character. Add future characters here with
// their public cover URL so collection and dashboard cards cannot diverge.
const CHARACTER_REGISTRY = new Map([
  ['45714', { name: '윤도하', cover_image_url: 'https://asset.tingle.chat/chat/j5aq1sq9u634g2ns5hq7xd20bu.webp' }],
  ['46604', { name: '류하민', cover_image_url: 'https://asset.tingle.chat/chat/6u3wla40vt4ervknplr8fxz2yo.webp' }],
  ['46693', { name: '서이담', cover_image_url: 'https://asset.tingle.chat/chat/fcwq09ci8nepqfumaj440s2d9k.webp' }],
  ['46696', { name: '이사야', cover_image_url: 'https://asset.tingle.chat/chat/5d1hhru88ce0dkus96a53s7t2w.webp' }],
  ['46742', { name: '한이든', cover_image_url: 'https://asset.tingle.chat/chat/zvfzh7sjk7qwm1nvpl2fxo7z94.webp' }],
  ['46743', { name: '도재경', cover_image_url: 'https://asset.tingle.chat/chat/6fp6atkb98bi47szbhwsdt4978.webp' }],
  ['46744', { name: '유한설', cover_image_url: 'https://asset.tingle.chat/chat/bgwgtgitzmkep7js70fs4pdxb4.webp' }],
  ['51025', { name: '서도겸', cover_image_url: 'https://asset.tingle.chat/chat/awo3g4s6ks6cul111xiruccbnv.webp' }],
]);
const CHARACTERS = new Map([...CHARACTER_REGISTRY].map(([id, value]) => [id, value.name]));
const FIELDS = [
  'collected_at_utc', 'character_id', 'name', 'num_chats', 'num_bubbles',
  'num_likes', 'num_reviews', 'num_trigger_images', 'url',
  'cover_image_url',
  'counter_1_legacy_num_bubbles', 'counter_2_legacy_num_likes',
  'comments_legacy_num_reviews',
];

function csvEscape(value) {
  const text = value === undefined || value === null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function atomicWrite(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tempPath, content, 'utf8');
  fs.renameSync(tempPath, filePath);
}

function csvRows(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, 'utf8').trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split(',');
  return lines.slice(1).map((line) => Object.fromEntries(line.split(',').map((v, i) => [header[i], v])));
}

async function fetchPublicPersonas(fetchImpl = fetch) {
  const response = await fetchImpl(API_URL, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`public API HTTP ${response.status}`);
  const body = await response.json();
  if (!Array.isArray(body.results)) throw new Error('public API response missing results[]');
  return body.results;
}

function buildRows(personas, collectedAtUtc) {
  return personas
    .filter((persona) => CHARACTERS.has(String(persona.id)))
    .map((persona) => ({
      collected_at_utc: collectedAtUtc,
      ...mapPersonaStatistics(persona),
      url: `https://tingle.chat/chat/characters/${persona.id}`,
      cover_image_url: CHARACTER_REGISTRY.get(String(persona.id))?.cover_image_url || '',
      counter_1_legacy_num_bubbles: '',
      counter_2_legacy_num_likes: '',
      comments_legacy_num_reviews: '',
    }));
}

function appendCsv(rows) {
  const filePath = path.join(DATA_DIR, 'yoon-doha-stats.csv');
  const existing = csvRows(filePath);
  const allFields = migrateLegacyHeaders(FIELDS);
  const lines = [allFields.join(',')];
  for (const row of [...existing, ...rows]) {
    lines.push(allFields.map((field) => csvEscape(row[field])).join(','));
  }
  atomicWrite(filePath, `${lines.join('\n')}\n`);
}

async function main() {
  const collectedAtUtc = new Date().toISOString();
  const rows = buildRows(await fetchPublicPersonas(), collectedAtUtc);
  if (rows.length !== CHARACTERS.size) throw new Error(`expected ${CHARACTERS.size} tracked personas, got ${rows.length}`);
  appendCsv(rows);
  atomicWrite(path.join(DATA_DIR, 'yoon-doha-latest.json'), `${JSON.stringify(rows, null, 2)}\n`);
  atomicWrite(path.join(DATA_DIR, 'yoon-doha-latest-report.txt'), [
    `Collected: ${collectedAtUtc}`,
    `Source: ${API_URL}`,
    ...rows.map((row) => `${row.name}: chats=${row.num_chats}, bubbles=${row.num_bubbles}, likes=${row.num_likes}, reviews=${row.num_reviews}, trigger_images=${row.num_trigger_images}`),
  ].join('\n') + '\n');
  console.log(JSON.stringify({ source: API_URL, collectedAtUtc, count: rows.length, dataDir: DATA_DIR }));
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exit(1); });

module.exports = { API_URL, FIELDS, buildRows, fetchPublicPersonas, migrateLegacyHeaders };
