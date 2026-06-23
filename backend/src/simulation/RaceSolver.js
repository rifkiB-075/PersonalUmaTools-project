/**
 * RaceSolver.js
 *
 * Simulasi fisika race Uma Musume — single-horse, deterministik, MVP.
 *
 * Scope (sesuai PHYSICS_REFERENCE.md & keputusan sesi riset):
 *   ✅  EffectiveStat (cap 1200, mood, terrain modifier)
 *   ✅  MaxHP & HP consumption (per-frame)
 *   ✅  BaseSpeed & StylePhaseCoef → BaseTargetSpeed
 *   ✅  LastSpurtSpeed (Wit-check pakai expected value, bukan RNG)
 *   ✅  MinSpeed, StartingSpeed (3 m/s)
 *   ✅  Acceleration & Deceleration
 *   ✅  SlopeMod uphill (downhill skip — RNG)
 *   ✅  Terrain effect (ground type × condition)
 *   ✅  Stat threshold bonus per course (courseSpeedModifier)
 *   ✅  Phase detection (0-3) & corner/section detection
 *   ✅  Distance-relative variables: distance_rate, remain_distance, phase
 *   ❌  PositionKeepCoef → 1.0
 *   ❌  ForceInMod → 0 (efek minor, bisa ditambah nanti)
 *   ❌  Downhill boost → 0 (RNG)
 *   ❌  MoveLaneMod → 0
 *   ❌  order_rate/bashin_diff → diestimasi sebagai region (lihat RuntimeContext)
 *
 * FRAME RATE: 15 FPS (dt = 1/15 s per frame).
 * Simulasi berjalan frame-by-frame, merekam snapshot tiap 24 section
 * (setiap 1/24 jarak total) untuk efisiensi — bukan tiap frame.
 *
 * OUTPUT: array snapshot per section + ringkasan timing race.
 */

'use strict';

// ---------------------------------------------------------------------------
// Konstanta
// ---------------------------------------------------------------------------

const FPS = 15;
const DT = 1 / FPS; // ~0.0667 s

/** Mood modifier per level (0=worst, 4=best, 2=normal) */
const MOOD_MOD = [-0.04, -0.02, 0, 0.02, 0.04];

/** Style phase coefficient [0=Early, 1=Mid, 2=Late, 3=LastSpurt]
 *  Index Late-Race & Last Spurt sama (indeks 2 dipakai untuk keduanya).
 *  Gunakan styleCoef(style, phase).
 */
const STYLE_PHASE_COEF = {
  // [Early, Mid, Late/LastSpurt]
  runaway:      [1.063, 0.962, 0.950],
  frontrunner:  [1.000, 0.980, 0.962],
  pacechaser:   [0.978, 0.991, 0.975],
  latesurger:   [0.938, 0.998, 0.994],
  endcloser:    [0.931, 1.000, 1.000],
};

/** StyleHPModifier untuk MaxHP */
const STYLE_HP_MOD = {
  runaway:      1.0,   // tidak ada data eksplisit → pakai 1.0
  frontrunner:  0.95,
  pacechaser:   0.89,
  latesurger:   1.00,
  endcloser:    0.995,
};

/** Distance Proficiency Modifier */
const DIST_PROF_MOD = { S: 1.05, A: 1.0, B: 0.9, C: 0.8, D: 0.6, E: 0.4, F: 0.2, G: 0.1 };

/** Surface aptitude modifier untuk akselerasi */
const SURFACE_APT_MOD = { S: 1.05, A: 1.0, B: 0.9, C: 0.8, D: 0.6, E: 0.4, F: 0.2, G: 0.1 };

/** Terrain effect (groundType × groundCondition) → { speedMod, powerMod, hpMult }
 *  groundType: 1=turf, 2=dirt
 *  groundCondition: 1=firm(良), 2=good(稍重), 3=soft(重), 4=heavy(不良)
 */
const TERRAIN_EFFECT = {
  '1-1': { speedMod: 0,   powerMod: 0,    hpMult: 1.00 },
  '1-2': { speedMod: 0,   powerMod: -50,  hpMult: 1.00 },
  '1-3': { speedMod: 0,   powerMod: -50,  hpMult: 1.02 },
  '1-4': { speedMod: -50, powerMod: -50,  hpMult: 1.02 },
  '2-1': { speedMod: 0,   powerMod: 0,    hpMult: 1.00 },
  '2-2': { speedMod: 0,   powerMod: -50,  hpMult: 1.00 },
  '2-3': { speedMod: 0,   powerMod: -100, hpMult: 1.01 },
  '2-4': { speedMod: -50, powerMod: -100, hpMult: 1.02 },
};

/** Phase acceleration modifier (dari uma.guide/gametora) */
const PHASE_ACCEL_MOD = {
  0: 1.0,   // Early-Race
  1: 1.0,   // Mid-Race
  2: 1.0,   // Late-Race
  3: 1.0,   // Last Spurt (no reduction documented for this)
};

/** Deceleration per phase (m/s²) */
const DECEL_BY_PHASE = {
  0: -1.2,
  1: -0.8,
  2: -1.0,
  3: -1.0,
};

// ---------------------------------------------------------------------------
// Helper — stat & terrain
// ---------------------------------------------------------------------------

/**
 * Terapkan cap 1200 + mood modifier ke raw stat.
 * @param {number} rawStat
 * @param {number} moodLevel - 0..4 (2 = normal)
 * @returns {number}
 */
function calcEffectiveStat(rawStat, moodLevel = 2) {
  const capped = rawStat <= 1200 ? rawStat : 1200 + (rawStat - 1200) / 2;
  return capped * (1 + MOOD_MOD[moodLevel]);
}

/**
 * Terapkan terrain modifier ke effective Speed & Power.
 * @param {number} effSpeed
 * @param {number} effPower
 * @param {number} groundType - 1=turf, 2=dirt
 * @param {number} groundCondition - 1=firm, 2=good, 3=soft, 4=heavy
 * @returns {{ speed: number, power: number, hpMult: number }}
 */
function applyTerrainEffect(effSpeed, effPower, groundType, groundCondition) {
  const key = `${groundType}-${groundCondition}`;
  const t = TERRAIN_EFFECT[key] || { speedMod: 0, powerMod: 0, hpMult: 1.0 };
  return {
    speed: effSpeed + t.speedMod,
    power: effPower + t.powerMod,
    hpMult: t.hpMult,
  };
}

// ---------------------------------------------------------------------------
// Helper — course speed modifier (stat threshold)
// ---------------------------------------------------------------------------

/**
 * @param {number[]} thresholdStats - array of stat IDs (1-5), filter != 0
 * @param {{ speed, stamina, power, guts, wisdom }} stats - EFFECTIVE stats
 * @returns {number} multiplier (mis. 1.05 = +5% ke speed)
 */
function courseSpeedModifier(thresholdStats, stats) {
  if (!thresholdStats || thresholdStats.length === 0) return 1;

  const statValues = [0, stats.speed, stats.stamina, stats.power, stats.guts, stats.wisdom]
    .map((x) => Math.min(x, 901)); // cap 901

  const sum = thresholdStats
    .map((stat) => (1 + Math.floor(statValues[stat] / 300.01)) * 0.05)
    .reduce((a, b) => a + b, 0);

  return 1 + sum / thresholdStats.length;
}

// ---------------------------------------------------------------------------
// Helper — phase detection
// ---------------------------------------------------------------------------

/**
 * Deteksi fase race dari distance_rate (0-1, berjalan dari 0 ke 1).
 * Phase 0: 0 ~ 1/6
 * Phase 1: 1/6 ~ 4/6
 * Phase 2: 4/6 ~ 5/6
 * Phase 3: 5/6 ~ 1.0
 */
function getPhase(distanceRate) {
  if (distanceRate < 1 / 6) return 0;
  if (distanceRate < 4 / 6) return 1;
  if (distanceRate < 5 / 6) return 2;
  return 3;
}

/** StylePhaseCoef: phase 3 (Last Spurt) pakai indeks 2, sama dengan Late-Race. */
function getStylePhaseCoef(style, phase) {
  const coefs = STYLE_PHASE_COEF[style];
  if (!coefs) throw new Error(`Style tidak dikenal: ${style}`);
  return coefs[phase === 0 ? 0 : phase === 1 ? 1 : 2];
}

// ---------------------------------------------------------------------------
// Helper — BaseTargetSpeed
// ---------------------------------------------------------------------------

/**
 * @param {number} baseSpeed
 * @param {string} style
 * @param {number} phase
 * @param {number} effSpeed - effective Speed stat (setelah terrain)
 * @param {number} distProfMod - DistanceProf modifier (0.1 - 1.05)
 * @param {number} courseSpeedMult - dari courseSpeedModifier()
 * @returns {number} m/s
 */
function calcBaseTargetSpeed(baseSpeed, style, phase, effSpeed, distProfMod, courseSpeedMult) {
  const styleCoef = getStylePhaseCoef(style, phase);
  const isLateRace = phase >= 2 ? 1 : 0;

  // courseSpeedMult diterapkan ke effSpeed (sama dengan "meningkatkan Speed stat")
  const effectiveSpeedWithThreshold = effSpeed * courseSpeedMult;

  return (
    baseSpeed * styleCoef +
    isLateRace * Math.sqrt(500 * effectiveSpeedWithThreshold) * distProfMod * 0.002
  );
}

// ---------------------------------------------------------------------------
// Helper — LastSpurtSpeed
// ---------------------------------------------------------------------------

/**
 * Hitung LastSpurtSpeedMax.
 * @param {number} baseTargetSpeedLateRace - BaseTargetSpeed saat phase 2
 * @param {number} baseSpeed
 * @param {number} effSpeed
 * @param {number} effGuts
 * @param {number} distProfMod
 * @param {number} courseSpeedMult
 * @returns {number} m/s
 */
function calcLastSpurtSpeedMax(
  baseTargetSpeedLateRace,
  baseSpeed,
  effSpeed,
  effGuts,
  distProfMod,
  courseSpeedMult
) {
  const esWithThresh = effSpeed * courseSpeedMult;
  return (
    (baseTargetSpeedLateRace + 0.01 * baseSpeed) * 1.05 +
    Math.sqrt(500 * esWithThresh) * distProfMod * 0.002 +
    Math.pow(450 * effGuts, 0.597) * 0.0001
  );
}

// ---------------------------------------------------------------------------
// Helper — Acceleration
// ---------------------------------------------------------------------------

/**
 * @param {number} phase
 * @param {number} effPower
 * @param {number} surfaceAptMod - dari aptitude surface (S/A/B/C/D/E/F/G)
 * @param {boolean} isUphill
 * @returns {number} m/s per frame (delta velocity per step)
 */
function calcAcceleration(phase, effPower, surfaceAptMod, isUphill = false) {
  const base = isUphill ? 0.0004 : 0.0006;
  return base * Math.sqrt(500 * effPower) * PHASE_ACCEL_MOD[phase] * surfaceAptMod;
}

// ---------------------------------------------------------------------------
// Helper — HP consumption (per second)
// ---------------------------------------------------------------------------

/**
 * @param {number} currentSpeed - m/s
 * @param {number} baseSpeed - m/s
 * @param {number} phase
 * @param {number} effGuts
 * @param {number} terrainHpMult - dari terrain effect
 * @returns {number} HP per detik
 */
function calcHpConsumption(currentSpeed, baseSpeed, phase, effGuts, terrainHpMult) {
  const base = (20 * Math.pow(currentSpeed - baseSpeed + 12, 2)) / 144;
  const phaseMult =
    phase >= 2 ? 1.0 + 200 / Math.sqrt(600 * effGuts) : 1.0;
  return base * phaseMult * terrainHpMult;
}

// ---------------------------------------------------------------------------
// Helper — slope data (dari input course)
// ---------------------------------------------------------------------------

/**
 * Cari slope section aktif dari array slope data course.
 * @param {Array<{start: number, end: number, slope: number}>} slopes
 *        slope < 0 = uphill, slope > 0 = downhill (konvensi game)
 *        Atau bisa gunakan konvensi berbeda — yang penting konsisten.
 * @param {number} traveledDistance - jarak yang sudah ditempuh (m)
 * @returns {number} slope percent aktif (0 kalau tidak ada)
 */
function getActiveSlopePercent(slopes, traveledDistance) {
  if (!slopes || slopes.length === 0) return 0;
  for (const s of slopes) {
    if (traveledDistance >= s.start && traveledDistance < s.end) {
      return s.slope;
    }
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Estimasi region order_rate/bashin_diff (pendekatan komunitas)
// ---------------------------------------------------------------------------

/**
 * Estimasi rentang order_rate berdasarkan style & phase.
 * Ini bukan kalkulasi presisi — ini "region estimasi" untuk skill evaluation.
 * Ikuti pendekatan ActivationSamplePolicy ala uma-skill-tools.
 *
 * Nilai-nilai ini berdasarkan distribusi empiris komunitas:
 * - Runaway/FrontRunner → order kecil (posisi depan), order_rate rendah
 * - EndCloser → order_rate tinggi di early-mid, rendah di last spurt
 *
 * @returns {{ min: number, max: number }} rentang order_rate (0-100)
 */
function estimateOrderRateRegion(style, phase) {
  const regions = {
    runaway:     [[0, 20],  [0, 20],  [0, 15],  [0, 10]],
    frontrunner: [[0, 30],  [0, 30],  [0, 25],  [0, 20]],
    pacechaser:  [[10, 50], [10, 50], [10, 45], [5, 40]],
    latesurger:  [[30, 70], [30, 70], [20, 60], [10, 50]],
    endcloser:   [[50, 90], [50, 90], [30, 70], [10, 60]],
  };
  const r = regions[style]?.[phase] ?? [0, 100];
  return { min: r[0], max: r[1] };
}

/**
 * Estimasi rentang bashin_diff_infront/behind berdasarkan style & phase.
 * @returns {{ infront: { min: number, max: number }, behind: { min: number, max: number } }}
 */
function estimateBashinDiffRegion(style, phase) {
  // Bashin diff = jarak ke kuda depan/belakang dalam satuan "bashin" (~1 bashin ≈ 1 badan kuda)
  // Estimasi kasar berdasarkan posisi order_rate
  const orderRegion = estimateOrderRateRegion(style, phase);
  const midOrder = (orderRegion.min + orderRegion.max) / 2;

  // Kuda di depan → bashin_diff_infront kecil; kuda di belakang → bashin_diff_behind kecil
  return {
    infront: {
      min: midOrder < 30 ? 0 : 1,
      max: midOrder < 30 ? 3 : 8,
    },
    behind: {
      min: midOrder > 70 ? 0 : 1,
      max: midOrder > 70 ? 3 : 8,
    },
  };
}

// ---------------------------------------------------------------------------
// MAIN: RaceSolver
// ---------------------------------------------------------------------------

/**
 * Input utama untuk RaceSolver.
 *
 * @typedef {Object} RaceInput
 * @property {Object} course - data course dari DB
 * @property {number} course.distance - meter
 * @property {number} course.ground - 1=turf, 2=dirt
 * @property {number} course.groundCondition - 1=firm, 2=good, 3=soft, 4=heavy
 * @property {number[]} [course.thresholdStats] - array stat ID (1-5) dari race_course_set_status
 * @property {Array<{start:number,end:number,slope:number}>} [course.slopes] - data lereng
 * @property {Object} uma - stat & aptitude uma musume yang disimulasikan
 * @property {number} uma.speed
 * @property {number} uma.stamina
 * @property {number} uma.power
 * @property {number} uma.guts
 * @property {number} uma.wisdom  (Wit / Int)
 * @property {string} uma.style  - 'runaway'|'frontrunner'|'pacechaser'|'latesurger'|'endcloser'
 * @property {string} uma.distanceApt - 'S'|'A'|'B'|'C'|'D'|'E'|'F'|'G'
 * @property {string} uma.surfaceApt  - 'S'|'A'|'B'|'C'|'D'|'E'|'F'|'G'
 * @property {number} [uma.moodLevel] - 0..4, default 2 (normal)
 */

/**
 * @typedef {Object} FrameSnapshot
 * @property {number} sectionIndex - 0..23
 * @property {number} distanceTraveled - meter
 * @property {number} distance_rate - 0..1
 * @property {number} remain_distance - meter
 * @property {number} phase - 0..3
 * @property {number} currentSpeed - m/s
 * @property {number} targetSpeed - m/s
 * @property {number} hp - HP sisa
 * @property {number} maxHp
 * @property {boolean} isLastSpurt
 * @property {boolean} isHpDepleted
 * @property {number} timeElapsed - detik
 * @property {{ min: number, max: number }} orderRateRegion
 * @property {{ infront: { min:number, max:number }, behind: { min:number, max:number } }} bashinDiffRegion
 */

/**
 * @typedef {Object} RaceResult
 * @property {FrameSnapshot[]} snapshots - 24 snapshot (satu per section)
 * @property {number} finishTimeSeconds
 * @property {number} finalHp
 * @property {number} maxHp
 * @property {boolean} ranOutOfHp
 * @property {Object} effectiveStats - stat efektif yang dipakai simulasi
 * @property {number} lastSpurtSpeedMax
 * @property {number} baseSpeed
 * @property {Object} meta - ringkasan debug
 */

/**
 * Jalankan simulasi race.
 * @param {RaceInput} input
 * @returns {RaceResult}
 */
function solveRace(input) {
  const { course, uma } = input;
  const moodLevel = uma.moodLevel ?? 2;

  // ------------------------------------------------------------------
  // 1. Hitung effective stats (cap 1200, mood)
  // ------------------------------------------------------------------
  const rawStats = {
    speed:   uma.speed,
    stamina: uma.stamina,
    power:   uma.power,
    guts:    uma.guts,
    wisdom:  uma.wisdom,
  };

  const effBase = {
    speed:   calcEffectiveStat(rawStats.speed,   moodLevel),
    stamina: calcEffectiveStat(rawStats.stamina,  moodLevel),
    power:   calcEffectiveStat(rawStats.power,    moodLevel),
    guts:    calcEffectiveStat(rawStats.guts,     moodLevel),
    wisdom:  calcEffectiveStat(rawStats.wisdom,   moodLevel),
  };

  // ------------------------------------------------------------------
  // 2. Terrain modifier → effective speed & power (setelah terrain)
  // ------------------------------------------------------------------
  const groundType      = course.ground;
  const groundCondition = course.groundCondition ?? 1;

  const terrainResult = applyTerrainEffect(
    effBase.speed,
    effBase.power,
    groundType,
    groundCondition
  );

  const eff = {
    speed:   terrainResult.speed,
    stamina: effBase.stamina,
    power:   terrainResult.power,
    guts:    effBase.guts,
    wisdom:  effBase.wisdom,
  };
  const terrainHpMult = terrainResult.hpMult;

  // ------------------------------------------------------------------
  // 3. Course speed modifier (stat threshold)
  // ------------------------------------------------------------------
  const thresholdStats  = course.thresholdStats ?? [];
  const courseSpeedMult = courseSpeedModifier(thresholdStats, eff);

  // ------------------------------------------------------------------
  // 4. Base race values
  // ------------------------------------------------------------------
  const courseDistance = course.distance;
  const baseSpeed      = 20.0 - (courseDistance - 2000) / 1000;
  const distProfMod    = DIST_PROF_MOD[uma.distanceApt] ?? 1.0;
  const surfaceAptMod  = SURFACE_APT_MOD[uma.surfaceApt] ?? 1.0;
  const style          = uma.style;

  // MaxHP
  const styleHpMod = STYLE_HP_MOD[style] ?? 1.0;
  const maxHp      = courseDistance + eff.stamina * 0.8 * styleHpMod;

  // MinSpeed
  const minSpeed = 0.85 * baseSpeed + Math.sqrt(200 * eff.guts) * 0.001;

  // BaseTargetSpeed per phase (untuk referensi & last spurt)
  const btsPhase2 = calcBaseTargetSpeed(baseSpeed, style, 2, eff.speed, distProfMod, courseSpeedMult);
  const btsPhase3 = calcBaseTargetSpeed(baseSpeed, style, 3, eff.speed, distProfMod, courseSpeedMult);

  // LastSpurtSpeedMax
  const lastSpurtSpeedMax = calcLastSpurtSpeedMax(
    btsPhase2,
    baseSpeed,
    eff.speed,
    eff.guts,
    distProfMod,
    courseSpeedMult
  );

  // Wit-check acceptance chance untuk last spurt (expected value, bukan RNG roll)
  const spurtAcceptChance = Math.min(1, (15 + 0.05 * eff.wisdom) / 100);
  // Target last spurt = weighted average dari speed max & phase 2 target
  const effectiveLastSpurtSpeed =
    lastSpurtSpeedMax * spurtAcceptChance + btsPhase3 * (1 - spurtAcceptChance);

  // ------------------------------------------------------------------
  // 5. Inisialisasi state simulasi
  // ------------------------------------------------------------------
  const sectionLength  = courseDistance / 24;
  const snapshots      = [];
  const slopes         = course.slopes ?? [];

  let currentSpeed   = 3.0;  // starting speed 3 m/s
  let distTraveled   = 0.0;
  let hp             = maxHp;
  let timeElapsed    = 0.0;
  let isHpDepleted   = false;
  let isLastSpurt    = false;
  let startDashActive = true;
  let frameCount     = 0;

  // Threshold section untuk snapshot (setiap 1/24 distance)
  const snapshotThresholds = Array.from({ length: 24 }, (_, i) => (i + 1) * sectionLength);
  let   nextSnapshotIdx    = 0;

  // ------------------------------------------------------------------
  // 6. Main simulation loop
  // ------------------------------------------------------------------
  while (distTraveled < courseDistance) {
    frameCount++;
    const distanceRate   = distTraveled / courseDistance;
    const remainDistance = courseDistance - distTraveled;
    const phase          = getPhase(distanceRate);

    // Transition ke last spurt
    if (phase === 3 && !isLastSpurt) {
      isLastSpurt = true;
    }

    // Target speed untuk frame ini
    let targetSpeed;
    if (isLastSpurt && !isHpDepleted) {
      targetSpeed = effectiveLastSpurtSpeed;
    } else {
      targetSpeed = calcBaseTargetSpeed(
        baseSpeed, style, phase, eff.speed, distProfMod, courseSpeedMult
      );
    }

    // Slope modifier (uphill only; downhill skip — RNG)
    const slopePercent = getActiveSlopePercent(slopes, distTraveled);
    const isUphill     = slopePercent < 0; // slope negatif = naik
    if (isUphill) {
      const uphillMod = (Math.abs(slopePercent) * 200) / eff.power;
      targetSpeed = Math.max(minSpeed, targetSpeed - uphillMod);
    }

    // HP depleted override
    if (isHpDepleted) {
      targetSpeed = minSpeed;
    }

    // Enforce minSpeed
    targetSpeed = Math.max(minSpeed, targetSpeed);

    // Hitung delta speed
    let newSpeed;
    if (currentSpeed < targetSpeed) {
      // Akselerasi
      const accel = calcAcceleration(phase, eff.power, surfaceAptMod, isUphill);
      // Start dash: flat +24 per-frame di awal (berlaku 1 frame atau sampai 85% baseSpeed)
      const startDashBonus =
        startDashActive && currentSpeed < 0.85 * baseSpeed ? 24 * DT : 0;
      if (startDashActive && currentSpeed >= 0.85 * baseSpeed) {
        startDashActive = false;
      }
      newSpeed = Math.min(currentSpeed + accel * DT + startDashBonus, targetSpeed);
    } else if (currentSpeed > targetSpeed) {
      // Deselerasi
      const decel = isHpDepleted ? -1.2 : DECEL_BY_PHASE[phase];
      newSpeed = Math.max(currentSpeed + decel * DT, targetSpeed);
    } else {
      newSpeed = currentSpeed;
    }

    newSpeed = Math.max(minSpeed, newSpeed);

    // Update distance & time
    distTraveled += newSpeed * DT;
    timeElapsed  += DT;

    // HP consumption
    const hpConsumed = calcHpConsumption(newSpeed, baseSpeed, phase, eff.guts, terrainHpMult) * DT;
    hp -= hpConsumed;

    if (hp <= 0 && !isHpDepleted) {
      hp           = 0;
      isHpDepleted = true;
    }

    currentSpeed = newSpeed;

    // ------------------------------------------------------------------
    // Ambil snapshot pada tiap section boundary
    // ------------------------------------------------------------------
    while (
      nextSnapshotIdx < 24 &&
      distTraveled >= snapshotThresholds[nextSnapshotIdx]
    ) {
      const snapDistRate   = snapshotThresholds[nextSnapshotIdx] / courseDistance;
      const snapPhase      = getPhase(snapDistRate);
      const snapRemain     = courseDistance - snapshotThresholds[nextSnapshotIdx];

      snapshots.push({
        sectionIndex:       nextSnapshotIdx,          // 0-based
        distanceTraveled:   snapshotThresholds[nextSnapshotIdx],
        distance_rate:      Math.round(snapDistRate * 10000) / 10000,
        remain_distance:    Math.round(snapRemain * 10) / 10,
        phase:              snapPhase,
        currentSpeed:       Math.round(currentSpeed * 1000) / 1000,
        targetSpeed:        Math.round(targetSpeed * 1000) / 1000,
        hp:                 Math.round(Math.max(0, hp) * 10) / 10,
        maxHp:              Math.round(maxHp * 10) / 10,
        isLastSpurt:        snapPhase === 3,
        isHpDepleted,
        timeElapsed:        Math.round(timeElapsed * 1000) / 1000,
        orderRateRegion:    estimateOrderRateRegion(style, snapPhase),
        bashinDiffRegion:   estimateBashinDiffRegion(style, snapPhase),
      });

      nextSnapshotIdx++;
    }

    // Guard: jangan looping selamanya kalau ada bug
    if (frameCount > 100000) {
      console.warn('RaceSolver: frame limit hit — possible infinite loop');
      break;
    }
  }

  return {
    snapshots,
    finishTimeSeconds: Math.round(timeElapsed * 1000) / 1000,
    finalHp:           Math.round(Math.max(0, hp) * 10) / 10,
    maxHp:             Math.round(maxHp * 10) / 10,
    ranOutOfHp:        isHpDepleted,
    effectiveStats:    eff,
    lastSpurtSpeedMax: Math.round(lastSpurtSpeedMax * 1000) / 1000,
    baseSpeed:         Math.round(baseSpeed * 1000) / 1000,
    meta: {
      frameCount,
      courseSpeedMult:   Math.round(courseSpeedMult * 10000) / 10000,
      terrainHpMult,
      btsPhase2:         Math.round(btsPhase2 * 1000) / 1000,
      effectiveLastSpurtSpeed: Math.round(effectiveLastSpurtSpeed * 1000) / 1000,
      spurtAcceptChance: Math.round(spurtAcceptChance * 1000) / 1000,
      minSpeed:          Math.round(minSpeed * 1000) / 1000,
    },
  };
}

// ---------------------------------------------------------------------------
// Validator input
// ---------------------------------------------------------------------------

const VALID_STYLES = new Set(['runaway', 'frontrunner', 'pacechaser', 'latesurger', 'endcloser']);
const VALID_APT    = new Set(['S', 'A', 'B', 'C', 'D', 'E', 'F', 'G']);

/**
 * Validasi input sebelum di-pass ke solveRace.
 * @param {RaceInput} input
 * @throws {Error} kalau ada field yang invalid
 */
function validateInput(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('Input harus berupa object');
  }

  const { course, uma } = input;

  // Validasi course
  if (!course) throw new Error('course wajib ada');
  if (!Number.isInteger(course.distance) || course.distance < 800 || course.distance > 4000) {
    throw new Error('course.distance harus integer antara 800-4000');
  }
  if (![1, 2].includes(course.ground)) {
    throw new Error('course.ground harus 1 (turf) atau 2 (dirt)');
  }
  if (course.groundCondition !== undefined && ![1, 2, 3, 4].includes(course.groundCondition)) {
    throw new Error('course.groundCondition harus 1-4');
  }
  if (course.thresholdStats !== undefined) {
    if (!Array.isArray(course.thresholdStats)) {
      throw new Error('course.thresholdStats harus array');
    }
    for (const s of course.thresholdStats) {
      if (![1, 2, 3, 4, 5].includes(s)) {
        throw new Error('course.thresholdStats elemen harus 1-5');
      }
    }
  }

  // Validasi uma
  if (!uma) throw new Error('uma wajib ada');
  for (const stat of ['speed', 'stamina', 'power', 'guts', 'wisdom']) {
    if (!Number.isFinite(uma[stat]) || uma[stat] < 0 || uma[stat] > 2500) {
      throw new Error(`uma.${stat} harus angka 0-2500`);
    }
  }
  if (!VALID_STYLES.has(uma.style)) {
    throw new Error(`uma.style harus salah satu dari: ${[...VALID_STYLES].join(', ')}`);
  }
  if (!VALID_APT.has(uma.distanceApt)) {
    throw new Error(`uma.distanceApt harus S/A/B/C/D/E/F/G`);
  }
  if (!VALID_APT.has(uma.surfaceApt)) {
    throw new Error(`uma.surfaceApt harus S/A/B/C/D/E/F/G`);
  }
  if (uma.moodLevel !== undefined) {
    if (!Number.isInteger(uma.moodLevel) || uma.moodLevel < 0 || uma.moodLevel > 4) {
      throw new Error('uma.moodLevel harus integer 0-4');
    }
  }
}

module.exports = {
  solveRace,
  validateInput,
  // Ekspor helper untuk testing
  calcEffectiveStat,
  courseSpeedModifier,
  calcBaseTargetSpeed,
  calcLastSpurtSpeedMax,
  estimateOrderRateRegion,
  estimateBashinDiffRegion,
  getPhase,
};
