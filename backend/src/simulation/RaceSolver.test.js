/**
 * RaceSolver.test.js
 *
 * Unit test ringan untuk RaceSolver — tidak perlu DB, tidak perlu framework.
 * Jalankan: node backend/src/simulation/RaceSolver.test.js
 */

'use strict';

const {
  solveRace,
  validateInput,
  calcEffectiveStat,
  courseSpeedModifier,
  calcBaseTargetSpeed,
  getPhase,
  estimateOrderRateRegion,
} = require('./RaceSolver');

// ---------------------------------------------------------------------------
// Minimal test runner
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}`);
    failed++;
  }
}

function assertApprox(actual, expected, tolerance, label) {
  const ok = Math.abs(actual - expected) <= tolerance;
  if (ok) {
    console.log(`  ✅ ${label} (${actual})`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label} — got ${actual}, expected ~${expected} (±${tolerance})`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// Test 1: calcEffectiveStat
// ---------------------------------------------------------------------------
console.log('\n[1] calcEffectiveStat');

// Stat <= 1200 → tidak dipotong
assertApprox(calcEffectiveStat(1000, 2), 1000, 0.1, 'Stat 1000 mood normal = 1000');

// Stat > 1200 → sisanya dibagi 2
// 1400 → 1200 + (200/2) = 1300
assertApprox(calcEffectiveStat(1400, 2), 1300, 0.1, 'Stat 1400 mood normal = 1300');

// Mood level 4 (best) → +4%
assertApprox(calcEffectiveStat(1000, 4), 1040, 0.1, 'Stat 1000 mood 4 = 1040');

// Mood level 0 (worst) → -4%
assertApprox(calcEffectiveStat(1000, 0), 960, 0.1, 'Stat 1000 mood 0 = 960');

// ---------------------------------------------------------------------------
// Test 2: courseSpeedModifier
// ---------------------------------------------------------------------------
console.log('\n[2] courseSpeedModifier');

// Tidak ada threshold → 1.0
assertApprox(courseSpeedModifier([], { speed: 1000, stamina: 800, power: 900, guts: 700, wisdom: 800 }), 1.0, 0.0001, 'Tidak ada threshold → 1.0');

// Speed stat = 600 → floor(600/300.01) = 1 → (1+1)*0.05 = 0.10 → return 1.10
assertApprox(
  courseSpeedModifier([1], { speed: 600, stamina: 800, power: 900, guts: 700, wisdom: 800 }),
  1.10, 0.001, 'Speed=600, 1 threshold (Speed) → 1.10'
);

// Speed stat = 300 → floor(300/300.01) = 0 → (1+0)*0.05 = 0.05 → return 1.05
assertApprox(
  courseSpeedModifier([1], { speed: 300, stamina: 800, power: 900, guts: 700, wisdom: 800 }),
  1.05, 0.001, 'Speed=300, 1 threshold (Speed) → 1.05'
);

// Cap di 901: speed=1200 → capped 901 → floor(901/300.01)=3 → (1+3)*0.05=0.20 → 1.20
assertApprox(
  courseSpeedModifier([1], { speed: 1200, stamina: 800, power: 900, guts: 700, wisdom: 800 }),
  1.20, 0.001, 'Speed=1200 (capped 901), 1 threshold → 1.20'
);

// 2 threshold (Speed+Stamina), dirata-rata
// speed=600 → 0.10, stamina=600 → 0.10 → avg 0.10 → 1.10
assertApprox(
  courseSpeedModifier([1, 2], { speed: 600, stamina: 600, power: 900, guts: 700, wisdom: 800 }),
  1.10, 0.001, '2 threshold Speed+Stamina=600 → 1.10 (avg)'
);

// ---------------------------------------------------------------------------
// Test 3: getPhase
// ---------------------------------------------------------------------------
console.log('\n[3] getPhase');

assert(getPhase(0)    === 0, 'distance_rate=0 → phase 0');
assert(getPhase(0.16) === 0, 'distance_rate=0.16 → phase 0 (tepat sebelum 1/6)');
assert(getPhase(1/6)  === 1, 'distance_rate=1/6 → phase 1');
assert(getPhase(0.5)  === 1, 'distance_rate=0.5 → phase 1');
assert(getPhase(4/6)  === 2, 'distance_rate=4/6 → phase 2');
assert(getPhase(5/6)  === 3, 'distance_rate=5/6 → phase 3');
assert(getPhase(1.0)  === 3, 'distance_rate=1.0 → phase 3');

// ---------------------------------------------------------------------------
// Test 4: validateInput
// ---------------------------------------------------------------------------
console.log('\n[4] validateInput');

const validInput = {
  course: {
    distance: 2400,
    ground: 1,
    groundCondition: 1,
    thresholdStats: [1],
  },
  uma: {
    speed:    800,
    stamina:  700,
    power:    900,
    guts:     600,
    wisdom:   700,
    style:    'latesurger',
    distanceApt: 'A',
    surfaceApt:  'A',
    moodLevel: 2,
  },
};

let threw = false;
try {
  validateInput(validInput);
} catch {
  threw = true;
}
assert(!threw, 'Input valid tidak throw error');

// Invalid style
threw = false;
try {
  validateInput({ ...validInput, uma: { ...validInput.uma, style: 'invalid' } });
} catch {
  threw = true;
}
assert(threw, 'Invalid style throw error');

// Distance di luar range
threw = false;
try {
  validateInput({ ...validInput, course: { ...validInput.course, distance: 100 } });
} catch {
  threw = true;
}
assert(threw, 'Distance 100 throw error');

// ---------------------------------------------------------------------------
// Test 5: solveRace — smoke test
// ---------------------------------------------------------------------------
console.log('\n[5] solveRace — smoke test (2400m turf firm, Late Surger A/A)');

const result = solveRace(validInput);

assert(Array.isArray(result.snapshots), 'Snapshots adalah array');
assert(result.snapshots.length === 24, 'Ada tepat 24 snapshots');
assert(result.finishTimeSeconds > 0, 'Finish time > 0');
assert(result.maxHp > 0, 'maxHp > 0');
assert(result.baseSpeed > 0, 'baseSpeed > 0');

// BaseSpeed untuk 2400m: 20 - (2400-2000)/1000 = 20 - 0.4 = 19.6
assertApprox(result.baseSpeed, 19.6, 0.01, 'BaseSpeed 2400m = 19.6');

// Snapshot pertama (section 0): distance_rate = 1/24 ≈ 0.0417
assertApprox(result.snapshots[0].distance_rate, 1 / 24, 0.001, 'Snapshot[0] distance_rate = 1/24');
assert(result.snapshots[0].phase === 0, 'Snapshot[0] phase = 0 (Early)');
assert(result.snapshots[0].hp > 0, 'Snapshot[0] HP > 0');

// Snapshot terakhir (section 23): distanceTraveled = 2400
assertApprox(result.snapshots[23].distanceTraveled, 2400, 1, 'Snapshot[23] distanceTraveled ≈ 2400');
assert(result.snapshots[23].phase === 3, 'Snapshot[23] phase = 3 (Last Spurt)');
assert(result.snapshots[23].isLastSpurt, 'Snapshot[23] isLastSpurt = true');

// Finish time range masuk akal (kuda 2400m ~2.5-3.5 menit = 150-210 detik)
assert(result.finishTimeSeconds >= 100 && result.finishTimeSeconds <= 250,
  `Finish time masuk akal: ${result.finishTimeSeconds}s`
);

// ---------------------------------------------------------------------------
// Test 6: estimateOrderRateRegion
// ---------------------------------------------------------------------------
console.log('\n[6] estimateOrderRateRegion');

const runawayEarly  = estimateOrderRateRegion('runaway', 0);
const endcloserLast = estimateOrderRateRegion('endcloser', 3);

assert(runawayEarly.max <= 30,   'Runaway early → order_rate max <= 30 (posisi depan)');
assert(endcloserLast.min <= 30,  'EndCloser last spurt → min bisa rendah (bisa sudah maju)');

// ---------------------------------------------------------------------------
// Test 7: solveRace — mode berbeda hasilkan waktu berbeda
// ---------------------------------------------------------------------------
console.log('\n[7] solveRace — perbandingan strategi');

const baseUma = { ...validInput.uma, speed: 800, stamina: 1000, guts: 700, power: 900, wisdom: 700 };

const resultFront = solveRace({ course: validInput.course, uma: { ...baseUma, style: 'frontrunner' } });
const resultEnd   = solveRace({ course: validInput.course, uma: { ...baseUma, style: 'endcloser'  } });

// Front runner cenderung speed lebih tinggi di early race (styleCoef 1.0 vs 0.931)
const frontEarlySpeed = resultFront.snapshots[0].currentSpeed;
const endEarlySpeed   = resultEnd.snapshots[0].currentSpeed;

// Keduanya mulai dari 3 m/s dan akselerasi, tapi target berbeda
// Ini hanya memastikan keduanya jalan dan menghasilkan hasil yang reasonable
assert(resultFront.finishTimeSeconds > 0, 'Front runner selesai');
assert(resultEnd.finishTimeSeconds   > 0, 'End closer selesai');

console.log(`  ℹ  Front runner finish: ${resultFront.finishTimeSeconds}s`);
console.log(`  ℹ  End closer finish:   ${resultEnd.finishTimeSeconds}s`);

// ---------------------------------------------------------------------------
// Test 8: terrain effect
// ---------------------------------------------------------------------------
console.log('\n[8] solveRace — terrain effect (heavy turf)');

const heavyInput = {
  course: { ...validInput.course, groundCondition: 4 }, // heavy = 不良
  uma:    validInput.uma,
};
const heavyResult = solveRace(heavyInput);

assert(heavyResult.finishTimeSeconds > result.finishTimeSeconds,
  `Heavy turf lebih lambat dari firm (${heavyResult.finishTimeSeconds}s vs ${result.finishTimeSeconds}s)`
);

// ---------------------------------------------------------------------------
// Ringkasan
// ---------------------------------------------------------------------------
console.log(`\n${'='.repeat(50)}`);
console.log(`Hasil: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
