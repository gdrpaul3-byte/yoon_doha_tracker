const LEGACY_HEADER_MAP = {
  counter_1: 'counter_1_legacy_num_bubbles',
  counter_2: 'counter_2_legacy_num_likes',
  comments: 'comments_legacy_num_reviews',
};

const METRIC_HEADERS = [
  'num_chats',
  'num_bubbles',
  'num_likes',
  'num_reviews',
  'num_trigger_images',
];

function finiteInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

function mapPersonaStatistics(persona) {
  const stats = persona?.statistics || {};
  return {
    character_id: String(persona?.id ?? ''),
    name: String(persona?.name ?? ''),
    num_chats: finiteInteger(stats.numChats),
    num_bubbles: finiteInteger(stats.numBubbles),
    num_likes: finiteInteger(stats.numLikes),
    num_reviews: finiteInteger(stats.numReviews),
    num_trigger_images: finiteInteger(stats.numTriggerImages),
  };
}

function metricRatio(numerator, denominator) {
  const n = Number(numerator);
  const d = Number(denominator);
  if (!Number.isFinite(n) || !Number.isFinite(d)) return 'UNKNOWN';
  if (d === 0) return 'N/A';
  return n / d;
}

function migrateLegacyHeaders(headers) {
  const migrated = headers.map((header) => LEGACY_HEADER_MAP[header] || header);
  for (const header of METRIC_HEADERS) {
    if (!migrated.includes(header)) migrated.push(header);
  }
  return migrated;
}

module.exports = {
  LEGACY_HEADER_MAP,
  METRIC_HEADERS,
  mapPersonaStatistics,
  metricRatio,
  migrateLegacyHeaders,
};
