# Formula Referensi — Race Physics (Tahap 2)

Dikonsolidasi dari beberapa sumber komunitas yang saling konsisten:
- uma.guide/guides/target-speed, race-mechanics, race-hp
- gametora.com/umamusume/race-mechanics
- umamusu.wiki/Game:Mechanics
- umareference.com/guide/stats

**Status akurasi**: well-documented & konsisten antar sumber. Tidak termasuk
mekanisme RNG/belum-diketahui (Position Keep detail, Rushing, Spot Struggle,
Dueling, Power Conservation/Release, Stamina Contest, Repositioning, Securing
the Lead) — itu di luar scope MVP Tahap 2 sesuai keputusan.

---

## 1. Konstanta Dasar

- Track dibagi 24 section (1/24 jarak masing-masing).
- Frame rate: 15 FPS → 1 frame = ~66ms (1/15 detik).
- Phase (4 fase, dipakai juga di skill condition `phase`):
  - Phase 0 (Early-Race / 序盤): section 1-4 (0 ~ 1/6 jarak)
  - Phase 1 (Mid-Race / 中盤): section 5-16 (1/6 ~ 4/6 jarak)
  - Phase 2 (Late-Race / 終盤): section 17-20 (4/6 ~ 5/6 jarak)
  - Phase 3 (Last Spurt / ラストスパート): section 21-24 (5/6 ~ 6/6 jarak)

## 2. Base Speed (sama untuk semua strategi di course yang sama)

```
BaseSpeed = 20.0 - (CourseDistance - 2000) / 1000   [m/s]
```

## 3. Style/Strategy Phase Coefficient

| Strategy | Early-race | Mid-race | Late-race & Last Spurt |
|---|---|---|---|
| Runaway (大逃げ) | 1.063 | 0.962 | 0.95 |
| Front Runner (逃げ) | 1.0 | 0.98 | 0.962 |
| Pace Chaser (先行) | 0.978 | 0.991 | 0.975 |
| Late Surger (差し) | 0.938 | 0.998 | 0.994 |
| End Closer (追込) | 0.931 | 1.0 | 1.0 |

## 4. Distance Proficiency Modifier (aptitude jarak, S/A/B/C/D/E/F/G)

| Rank | S | A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|---|---|
| Modifier | 1.05 | 1.0 | 0.9 | 0.8 | 0.6 | 0.4 | 0.2 | 0.1 |

## 5. Base Target Speed

```
BaseTargetSpeed = BaseSpeed * StylePhaseCoef
                  + IsLateRace * sqrt(500 * SpeedStat) * DistanceProf * 0.002   [m/s]
```
`IsLateRace` = 1 kalau phase >= 2 (Late-Race/Last Spurt), 0 kalau tidak.
Speed stat HANYA berpengaruh mulai phase 2 ke atas.

## 6. Last Spurt Speed (dihitung sebelum masuk Late-Race)

```
LastSpurtSpeedMax = (BaseTargetSpeedLateRace + 0.01 * BaseSpeed) * 1.05
                     + sqrt(500 * EffectiveSpeed) * DistanceProf * 0.002
                     + (450 * EffectiveGuts)^0.597 * 0.0001   [m/s]
```

Kalau HP tidak cukup untuk full last spurt: turunkan target speed 0.1 m/s per
step sampai HP cukup atau sampai mencapai BaseTargetSpeed phase 2. Tiap
kandidat diurutkan dari waktu tercepat, lalu di-roll:
```
SpurtRecalcAcceptChance = 15 + 0.05 * EffectiveWit   [%]
```
Kalau semua kandidat gagal wit-check, pakai kandidat paling lambat (selalu
berhasil). Perhitungan ini TIDAK menghitung 60m terakhir race (uma masih bisa
kehabisan HP di 60m terakhir).

## 7. Modifier Tambahan ke Target Speed

```
TargetSpeed = (BaseTargetSpeed | LastSpurtSpeed) * PositionKeepCoef
              + ForceInMod + SkillMod + SlopeMod + MoveLaneMod
```

PositionKeepCoef: DI LUAR SCOPE MVP (perlu data multi-horse/RNG) → pakai 1.0
(netral) untuk MVP.

ForceInMod (early-race lane positioning, minor):
```
ForceInMod = Random(0, 0.1) + StrategyMod   [m/s]
```
StrategyMod: Front Runner 0.02, Pace Chaser 0.01, Late Surger 0.01, End Closer 0.03.
→ DI LUAR SCOPE MVP awal (efeknya minor, bisa skip / set 0 dulu).

SlopeMod (uphill):
```
UphillSpeed = SlopePercent * 200 / EffectivePower   [m/s, dikurangi dari speed]
```

SlopeMod (downhill, ada elemen RNG — DI LUAR SCOPE MVP, treat sebagai 0):
```
DownhillCheck = EffectiveWit * 0.04%  (chance per check)
DownhillSpeed = 0.3 + SlopePercent / 10   [m/s, kalau check berhasil]
```

MoveLaneMod: DI LUAR SCOPE MVP (butuh skill navigasi + lane logic).

## 8. Minimum Speed

```
MinSpeed = 0.85 * BaseSpeed + sqrt(200 * EffectiveGuts) * 0.001   [m/s]
```
Uma tidak akan melambat di bawah ini (kecuali start dash awal).

## 9. Starting Speed

Current speed keluar gerbang start = 3 m/s.

## 10. Acceleration

```
BaseAcceleration = 0.0006 normal, 0.0004 saat uphill   [unit dasar]
Acceleration = BaseAcceleration * sqrt(500 * EffectivePower) * PhaseModifier * SurfaceAptitude
```
Flat +24 acceleration di awal race (start dash), berlaku sampai mencapai 85%
dari BaseSpeed atau exit setelah 1 frame.

## 11. Deceleration (saat current speed > target speed)

Berdasarkan phase:
- Early-race (phase 0): -1.2 m/s²
- Mid-race (phase 1): -0.8 m/s²
- Late-race/Last Spurt (phase 2,3): -1.0 m/s²
- Out of HP (override semua di atas): -1.2 m/s²

(Pace Down mode -0.5 m/s² → DI LUAR SCOPE MVP, butuh Position Keep penuh)

## 12. Stamina → Max HP

```
MaxHP = (CourseDistance) + (StaminaStat * 0.8) * StyleHPModifier
```
StyleHPModifier: Front Runner 0.95, Pace Chaser 0.89, Late Surger 1.0, End Closer 0.995.

(Catatan: ada 2 formula MaxHP yang sedikit beda format di sumber berbeda,
tapi keduanya konsisten secara struktur: distance + stamina*0.8*style_coef.
Pakai versi umareference.com karena lebih eksplisit.)

## 13. HP Consumption (per detik)

```
BaseHPConsumption = 20 * (CurrentSpeed - BaseSpeed + 12)^2 / 144
```
Modifier tambahan:
- Final Leg (phase 2,3): dikali (1.0 + 200/sqrt(600 * EffectiveGuts))
- Ground condition non-firm/non-good: +1-2% (lihat tabel section 14)
- Rushed (DI LUAR SCOPE): x1.6
- Downhill boost aktif (DI LUAR SCOPE): x0.4
- Pace down mode (DI LUAR SCOPE): x0.6

## 14. Terrain Effect (Ground Type x Ground Condition)

| Ground | Condition | Speed mod | Power mod | HP consumption mult |
|---|---|---|---|---|
| Turf | Firm (良) | 0 | 0 | 1.0 |
| Turf | Good (稍重) | 0 | -50 | 1.0 |
| Turf | Soft (重) | 0 | -50 | 1.02 |
| Turf | Heavy (不良) | -50 | -50 | 1.02 |
| Dirt | Firm (良) | 0 | 0 | 1.0 |
| Dirt | Good (稍重) | 0 | -50 | 1.0 |
| Dirt | Soft (重) | 0 | -100 | 1.01 |
| Dirt | Heavy (不良) | -50 | -100 | 1.02 |

(Speed mod dikurangi langsung dari SpeedStat sebelum dipakai di formula lain;
Power mod sama, dikurangi dari PowerStat → hasil "EffectiveSpeed"/"EffectivePower")

## 15. Stat Threshold Bonus (course-specific) — TERVERIFIKASI

**Sumber**: source code `CourseData.ts` dari `alpha123/uma-skill-tools` (maintainer
RaceSolver yang dipakai seluruh komunitas Umalator). Dikonfirmasi cocok dengan
data `master.mdb` kita sendiri (`race_course_set_status`).

Mapping `target_status_1`/`target_status_2` (dari `race_course_set_status`):
```
1 = Speed
2 = Stamina
3 = Power
4 = Guts
5 = Int (Wit)
0 = (tidak ada threshold / unused slot)
```

Formula (TypeScript asli, di-port ke JS):
```js
function courseSpeedModifier(thresholdStats, stats) {
  // thresholdStats: array ThresholdStat (1-5), dari course_set_status_id
  //   yang match (target_status_1, target_status_2), filter yang != 0
  // stats: { speed, stamina, power, guts, wisdom } -- EFFECTIVE stat (sudah
  //   melalui EffectiveStat calc di section 16, BUKAN raw stat)
  const statvalues = [0, stats.speed, stats.stamina, stats.power, stats.guts, stats.wisdom]
    .map(x => Math.min(x, 901));  // cap di 901 (bukan 900!)

  if (thresholdStats.length === 0) return 1; // tidak ada threshold

  const sum = thresholdStats
    .map(stat => (1 + Math.floor(statvalues[stat] / 300.01)) * 0.05)
    .reduce((a, b) => a + b, 0);

  return 1 + sum / thresholdStats.length;  // DIRATA-RATA kalau 2 threshold
}
```

Hasil dari fungsi ini adalah MULTIPLIER ke Speed (mis. 1.05 = +5%), dikalikan
ke BaseTargetSpeed atau EffectiveSpeed (perlu ditentukan di titik mana dalam
formula chain — kemungkinan dikali ke base speed sebelum dipakai di formula
lain, konsisten dengan deskripsi GameTora "increase the Speed stat").

Catatan: thresholdStats per course di-extract dari `race_course_set.course_set_status_id`
→ JOIN `race_course_set_status` → ambil `target_status_1`, `target_status_2`,
filter yang `!= 0`. Course dengan status_id=0 (default, paling umum) → array kosong
→ courseSpeedModifier = 1 (tidak ada bonus).

## 16. Stat Calculation Umum (semua stat: Speed, Stamina, Power, Guts, Wit)

```
EffectiveStat = min(RawStat, 1200) + max(0, RawStat - 1200) / 2
```
(stat di atas 1200 dipotong setengah)

Lalu dimodifikasi oleh:
- Mood: ±2% per level dari Normal (mood rendah/tinggi)
- Career run flat bonus +400 (TIDAK relevan untuk kalkulator ini — ini bukan career mode)
- Terrain modifier (section 14, untuk Speed & Power)

## 17. Wit-only formulas (relevan untuk skill activation chance, BUKAN posisi)

Section randomness per section (mempengaruhi Target Speed sedikit, ada elemen
RNG → untuk MVP, treat sebagai 0 / netral, atau pakai nilai tengah):
```
ModifierMax = (EffectiveWit / 5500) * log10(EffectiveWit * 0.1)   [%]
ModifierMin = ModifierMax - 0.65%
```

---

## RINGKASAN: Yang MASUK scope MVP RaceSolver

✅ BaseSpeed, StylePhaseCoef, DistanceProf → BaseTargetSpeed
✅ LastSpurtSpeed + Wit-check acceptance (deterministik pakai expected value,
   bukan actual RNG roll — atau pakai threshold 50% sebagai estimasi tengah)
✅ MinSpeed, Starting Speed
✅ Acceleration & Deceleration (formula inti, tanpa Pace Down)
✅ MaxHP, HP Consumption (formula inti, tanpa Rushed/Downhill/Pace-down modifier)
✅ Terrain effect (ground type x condition)
✅ SlopeMod uphill (downhill di-skip karena RNG)
✅ EffectiveStat calculation (cap 1200, mood)
✅ Stat Threshold Bonus per course (TERVERIFIKASI dari source code asli +
   data race_course_set_status di master.mdb kita sendiri)

## RINGKASAN: Yang DI LUAR scope MVP (treat sebagai netral/0, atau skip)

❌ PositionKeepCoef → set 1.0
❌ ForceInMod → set 0 (opsional ditambah nanti, efeknya minor)
❌ Downhill speed boost → set 0 (skip, RNG)
❌ MoveLaneMod → set 0 (butuh skill navigasi khusus)
❌ Section randomness → set 0 (RNG)
❌ Rushed, Spot Struggle, Dueling, Power Conservation/Release, Stamina
   Contest, Repositioning, Securing the Lead → semua di luar scope
❌ Blocking (butuh multi-horse posisi presisi) → di luar scope
