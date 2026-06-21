/**
 * test_conditionParser.js
 * Test manual (tanpa framework) untuk conditionParser.js, pakai contoh
 * formula ASLI yang sudah kita temukan dari master.mdb kamu.
 *
 * Jalankan: node test_conditionParser.js
 */

'use strict';

const { parseCondition, evaluateCondition, getVariablesUsed } = require('./conditionParser');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ GAGAL: ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  assert(ok, `${message} (expected=${JSON.stringify(expected)}, actual=${JSON.stringify(actual)})`);
}

console.log('=== TEST 1: Formula simple AND-only ===');
{
  // skill 10071: distance_rate>=50&distance_rate<=60&order_rate>50
  const formula = 'distance_rate>=50&distance_rate<=60&order_rate>50';
  const parsed = parseCondition(formula);

  assertEqual(parsed.length, 1, 'harus ada 1 OR-clause');
  assertEqual(parsed[0].length, 3, 'clause pertama harus ada 3 AND-term');
  assertEqual(parsed[0][0], { variable: 'distance_rate', operator: '>=', value: 50, raw: 'distance_rate>=50' }, 'term pertama benar');
  assertEqual(parsed[0][2], { variable: 'order_rate', operator: '>', value: 50, raw: 'order_rate>50' }, 'term ketiga (operator ">") benar');
}

console.log('\n=== TEST 2: Formula dengan OR (skill 10081 アクセルX) ===');
{
  const formula = 'order>=3&order_rate<=50&remain_distance<=200&bashin_diff_infront<=1@order>=3&order_rate<=50&remain_distance<=200&bashin_diff_behind<=1';
  const parsed = parseCondition(formula);

  assertEqual(parsed.length, 2, 'harus ada 2 OR-clause');
  assertEqual(parsed[0].length, 4, 'clause pertama 4 term');
  assertEqual(parsed[1].length, 4, 'clause kedua 4 term');
  assertEqual(parsed[0][3].variable, 'bashin_diff_infront', 'clause 1 term ke-4 variable benar');
  assertEqual(parsed[1][3].variable, 'bashin_diff_behind', 'clause 2 term ke-4 variable benar');
}

console.log('\n=== TEST 3: Formula dengan track_id + nilai negatif (skill 110471) ===');
{
  const formula = 'phase>=2&is_last_straight==1&order_rate<=40&track_id==10005&course_distance==2500@phase>=2&is_last_straight==1&order_rate<=40&track_id==10006&distance_type==3';
  const parsed = parseCondition(formula);

  assertEqual(parsed.length, 2, 'harus ada 2 OR-clause');
  assertEqual(parsed[0].find((t) => t.variable === 'track_id').value, 10005, 'clause 1 track_id=10005 (Nakayama)');
  assertEqual(parsed[1].find((t) => t.variable === 'track_id').value, 10006, 'clause 2 track_id=10006 (Tokyo)');
}

console.log('\n=== TEST 4: Operator != dan nilai negatif ===');
{
  const formula = 'corner!=0&change_order_onetime<0';
  const parsed = parseCondition(formula);

  assertEqual(parsed[0][0], { variable: 'corner', operator: '!=', value: 0, raw: 'corner!=0' }, 'operator != ok');
  assertEqual(parsed[0][1], { variable: 'change_order_onetime', operator: '<', value: 0, raw: 'change_order_onetime<0' }, 'nilai negatif (0, bukan -1) ok');
}

console.log('\n=== TEST 5: Formula kosong (skill tanpa condition_2, mis. skill 204292) ===');
{
  const parsed = parseCondition('');
  assertEqual(parsed, [], 'formula kosong -> array kosong');

  const parsedNull = parseCondition(null);
  assertEqual(parsedNull, [], 'formula null -> array kosong');
}

console.log('\n=== TEST 6: evaluateCondition - cek track-specific skill (200031 東京レース場◎) ===');
{
  // Skill ini hanya valid di Tokyo (track_id==10006)
  const parsed = parseCondition('track_id==10006');

  const contextTokyo = { track_id: 10006, course_distance: 2400, ground_type: 1 };
  const contextNakayama = { track_id: 10005, course_distance: 2400, ground_type: 1 };

  assert(evaluateCondition(parsed, contextTokyo) === true, 'valid di Tokyo (track_id 10006)');
  assert(evaluateCondition(parsed, contextNakayama) === false, 'TIDAK valid di Nakayama (track_id 10005)');
}

console.log('\n=== TEST 7: evaluateCondition - non-strict mode (Tahap 1, variabel runtime diabaikan) ===');
{
  // skill dengan campuran variabel statis (course_distance) + runtime (distance_rate, order_rate)
  const parsed = parseCondition('distance_rate>=50&distance_rate<=60&order_rate>50&course_distance==2400');

  // Context Tahap 1: cuma punya data track, BELUM ada distance_rate/order_rate
  const contextTrackOnly = { course_distance: 2400, ground_type: 1 };

  // non-strict: term yang variabelnya tidak ada di context (distance_rate, order_rate)
  // dianggap "lolos" (tidak membatalkan), course_distance==2400 match -> overall TRUE
  assert(
    evaluateCondition(parsed, contextTrackOnly, { strict: false }) === true,
    'non-strict: course_distance cocok, var runtime diabaikan -> valid (mungkin aktif)'
  );

  // Ganti course_distance jadi tidak cocok -> harus false walau non-strict,
  // karena term course_distance==2400 itu term yang KNOWN dan gagal
  const contextWrongDistance = { course_distance: 1600, ground_type: 1 };
  assert(
    evaluateCondition(parsed, contextWrongDistance, { strict: false }) === false,
    'non-strict: course_distance TIDAK cocok -> invalid (mustahil aktif di sini)'
  );
}

console.log('\n=== TEST 8: evaluateCondition - strict mode (Tahap 2, simulasi penuh) ===');
{
  const parsed = parseCondition('distance_rate>=50&distance_rate<=60&order_rate>50');

  const contextIncomplete = { distance_rate: 55 }; // order_rate belum ada
  assert(
    evaluateCondition(parsed, contextIncomplete, { strict: true }) === false,
    'strict: variabel belum lengkap (order_rate hilang) -> gagal'
  );

  const contextComplete = { distance_rate: 55, order_rate: 60 };
  assert(
    evaluateCondition(parsed, contextComplete, { strict: true }) === true,
    'strict: semua variabel ada dan match -> valid'
  );

  const contextOutOfRange = { distance_rate: 80, order_rate: 60 };
  assert(
    evaluateCondition(parsed, contextOutOfRange, { strict: true }) === false,
    'strict: distance_rate di luar range -> invalid'
  );
}

console.log('\n=== TEST 9: getVariablesUsed ===');
{
  const parsed = parseCondition('track_id==10006&course_distance==2400@distance_type==3&ground_type==1');
  const vars = getVariablesUsed(parsed);
  assertEqual(
    vars.sort(),
    ['course_distance', 'distance_type', 'ground_type', 'track_id'].sort(),
    'semua variabel unik terdeteksi'
  );
}

console.log('\n=== TEST 10: Formula real dengan 3 OR-clause + banyak term (skill 100303111) ===');
{
  const formula = 'running_style==2&course_distance<2400&phase_firsthalf_random==2&order_rate<=50@running_style==2&course_distance>2500&phase_firsthalf_random==2&order_rate<=50@running_style==2&course_distance>=2400&course_distance<=2500&phase_firsthalf_random==2&order_rate<=50&base_stamina<1000';
  const parsed = parseCondition(formula);
  assertEqual(parsed.length, 3, 'harus ada 3 OR-clause');
  assertEqual(parsed[2].length, 6, 'clause ke-3 ada 6 term (paling kompleks)');
}

console.log(`\n\n=== HASIL: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  process.exitCode = 1;
}
