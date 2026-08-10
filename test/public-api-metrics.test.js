const assert = require('node:assert/strict');
const test = require('node:test');
const {
  mapPersonaStatistics,
  metricRatio,
  migrateLegacyHeaders,
} = require('../scripts/public-api-metrics');
const { buildRows, FIELDS } = require('../scripts/track-public-api');

const fixture = {
  id: '45714',
  name: '윤도하',
  statistics: {
    numChats: 3,
    numBubbles: 2230,
    numLikes: 1,
    numReviews: 0,
    numTriggerImages: 14,
  },
};

test('maps public API statistics to explicit metric columns', () => {
  assert.deepEqual(mapPersonaStatistics(fixture), {
    character_id: '45714',
    name: '윤도하',
    num_chats: 3,
    num_bubbles: 2230,
    num_likes: 1,
    num_reviews: 0,
    num_trigger_images: 14,
  });
});

test('keeps zero metrics and returns N/A for zero denominator', () => {
  const row = mapPersonaStatistics({ id: '46693', name: '서이담', statistics: {
    numChats: 0, numBubbles: 0, numLikes: 0, numReviews: 0, numTriggerImages: 14,
  }});
  assert.equal(row.num_chats, 0);
  assert.equal(row.num_reviews, 0);
  assert.equal(metricRatio(row.num_bubbles, row.num_chats), 'N/A');
});

test('builds tracked public personas with explicit fields', () => {
  const rows = buildRows([
    fixture,
    { id: '51025', name: '서도겸', statistics: { numChats: 0, numBubbles: 0, numLikes: 0, numReviews: 0, numTriggerImages: 0 } },
    { id: '99999', name: '외부 캐릭터', statistics: {} },
  ], '2026-08-09T00:00:00.000Z');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].num_bubbles, 2230);
  assert.equal(rows[1].character_id, '51025');
  assert.equal(rows[1].name, '서도겸');
  assert.equal(rows[0].counter_1_legacy_num_bubbles, '');
  assert.ok(FIELDS.includes('num_chats'));
  assert.ok(FIELDS.includes('num_trigger_images'));
});

test('migrates legacy counter names without silently redefining them', () => {
  assert.deepEqual(migrateLegacyHeaders([
    'character_id', 'counter_1', 'counter_2', 'comments', 'name',
  ]), [
    'character_id',
    'counter_1_legacy_num_bubbles',
    'counter_2_legacy_num_likes',
    'comments_legacy_num_reviews',
    'name',
    'num_chats',
    'num_bubbles',
    'num_likes',
    'num_reviews',
    'num_trigger_images',
  ]);
});
