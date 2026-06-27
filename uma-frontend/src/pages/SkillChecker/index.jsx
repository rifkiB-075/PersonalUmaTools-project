import { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useAppStore } from '../../store/appStore';
import { getValidSkills, analyzeUma, getCharacters, getCharacter } from '../../api/services';
import { Button, Card, Badge, Empty, Spinner } from '../../components/ui';
import { RARITY_COLORS, rarityLabel, formatTrackName, formatCourseName } from '../../utils/labels';
import { getRacetracks, getCourses } from '../../api/services';
import { STYLE_OPTIONS, APT_OPTIONS, MOOD_OPTIONS } from '../../utils/labels';
import styles from './SkillChecker.module.css';

const STEPS = ['Track', 'Trainee', 'Stats', 'Skills', 'Result'];
const STATS = ['speed', 'stamina', 'power', 'guts', 'wisdom'];
const STAT_LABELS = { speed: 'Speed', stamina: 'Stamina', power: 'Power', guts: 'Guts', wisdom: 'Wisdom' };

// Unique skill = rarity 3 di tabel skills (1=normal, 2=gold, 3=unique)
const isUniqueRarity = (skill) => skill.rarity === 3;

export default function SkillCheckerPage() {
  const {
    selectedRacetrack, selectedCourse,
    setSelectedRacetrack, setSelectedCourse,
    umaStats, setUmaStats,
    selectedSkillIds, toggleSkill, clearSkills,
  } = useAppStore();

  const [step, setStep] = useState(0);
  const [groundCondition, setGroundCondition] = useState(1);
  const [skillSearch, setSkillSearch] = useState('');
  const [traineeSearch, setTraineeSearch] = useState('');
  const [selectedTrainee, setSelectedTrainee] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);

  const { data: racetracks = [], isLoading: loadingTracks } = useQuery({
    queryKey: ['racetracks'],
    queryFn: getRacetracks,
    staleTime: 60_000,
  });

  const { data: courses = [], isLoading: loadingCourses } = useQuery({
    queryKey: ['courses', selectedRacetrack?.id],
    queryFn: () => getCourses(selectedRacetrack.id),
    enabled: !!selectedRacetrack,
    staleTime: 60_000,
  });

  const { data: traineeListData, isLoading: loadingTrainees } = useQuery({
    queryKey: ['characters', traineeSearch],
    queryFn: () => getCharacters(traineeSearch, 80),
    staleTime: 30_000,
    enabled: step === 1,
  });
  const trainees = traineeListData?.characters || traineeListData || [];

  const { data: traineeDetail } = useQuery({
    queryKey: ['character-detail', selectedTrainee?.id],
    queryFn: () => getCharacter(selectedTrainee.id),
    enabled: !!selectedTrainee,
    staleTime: 60_000,
  });

  const traineeUniqueSkillIds = new Set();
  if (traineeDetail?.cards) {
    for (const card of traineeDetail.cards) {
      for (const sk of card.innate_skills || []) {
        // Semua innate skill dianggap "unique" milik trainee ini
        // (tidak filter rarity karena unique skill bisa punya rarity berbeda-beda)
        traineeUniqueSkillIds.add(sk.skill_id);
      }
    }
  }

  const { data: skillData, isLoading: loadingSkills } = useQuery({
    queryKey: ['valid-skills', selectedCourse?.id],
    queryFn: () => getValidSkills(selectedCourse.id, false),
    enabled: !!selectedCourse && step === 3,
    staleTime: 30_000,
  });
  const allSkills = skillData?.skills || [];

  const visibleSkills = allSkills.filter((s) => {
    // Unique skill (rarity 3): tampilkan HANYA jika milik trainee yang dipilih
    if (isUniqueRarity(s)) return traineeUniqueSkillIds.has(s.id);
    // Non-unique: selalu tampilkan
    return true;
  });

  const filteredSkills = visibleSkills.filter((s) => {
    if (!skillSearch.trim()) return true;
    const q = skillSearch.toLowerCase();
    return s.name_ja?.toLowerCase().includes(q) || s.name_en?.toLowerCase().includes(q);
  });

  useEffect(() => {
    if (!skillData || traineeUniqueSkillIds.size === 0) return;
    for (const id of traineeUniqueSkillIds) {
      const exists = allSkills.some((s) => s.id === id);
      if (exists && !selectedSkillIds.includes(id)) {
        toggleSkill(id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skillData, traineeDetail]);

  const analyzeMutation = useMutation({
    mutationFn: analyzeUma,
    onSuccess: (data) => {
      setAnalysisResult(data);
      setStep(4);
    },
  });

  const canGoNext = () => {
    if (step === 0) return !!selectedCourse;
    if (step === 1) return true;
    if (step === 2) return true;
    if (step === 3) return selectedSkillIds.length > 0;
    return false;
  };

  const handleCheck = () => {
    if (!selectedCourse || selectedSkillIds.length === 0) return;
    analyzeMutation.mutate({
      courseId: selectedCourse.id,
      groundCondition,
      uma: umaStats,
      skillIds: selectedSkillIds,
    });
  };

  const handleReset = () => {
    setStep(0);
    clearSkills();
    setAnalysisResult(null);
    setSelectedTrainee(null);
  };

  const handleSelectTrainee = (t) => {
    if (selectedTrainee && selectedTrainee.id !== t.id) {
      for (const id of traineeUniqueSkillIds) {
        if (selectedSkillIds.includes(id)) toggleSkill(id);
      }
    }
    setSelectedTrainee(selectedTrainee?.id === t.id ? null : t);
  };

  const statusColor = {
    active: 'var(--green)',
    conditional: 'var(--accent)',
    invalid: 'var(--red)',
    unknown: 'var(--text3)',
  };

  const renderStep0 = () => (
    <div className={styles.stepBody}>
      <h2 className={styles.stepTitle}>🏟️ Pilih Race Track & Course</h2>

      <div className={styles.formSection}>
        <label className={styles.label}>Racetrack</label>
        {loadingTracks ? <Spinner /> : (
          <select
            value={selectedRacetrack?.id ?? ''}
            onChange={(e) => {
              const rt = racetracks.find((r) => r.id === Number(e.target.value));
              setSelectedRacetrack(rt || null);
            }}
          >
            <option value="">-- Pilih racetrack --</option>
            {racetracks.map((rt) => (
              <option key={rt.id} value={rt.id}>{formatTrackName(rt)}</option>
            ))}
          </select>
        )}
      </div>

      <div className={styles.formSection}>
        <label className={styles.label}>Course</label>
        {loadingCourses && selectedRacetrack ? <Spinner /> : (
          <select
            value={selectedCourse?.id ?? ''}
            disabled={!selectedRacetrack}
            onChange={(e) => {
              const c = courses.find((x) => x.id === Number(e.target.value));
              setSelectedCourse(c || null);
            }}
          >
            <option value="">-- Pilih course --</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{formatCourseName(c)}</option>
            ))}
          </select>
        )}
      </div>

      {selectedCourse && (
        <div className={styles.formSection}>
          <label className={styles.label}>🌤️ Kondisi Lintasan</label>
          <select value={groundCondition} onChange={(e) => setGroundCondition(Number(e.target.value))}>
            <option value={1}>Firm</option>
            <option value={2}>Good</option>
            <option value={3}>Soft</option>
            <option value={4}>Heavy</option>
          </select>
        </div>
      )}

      {selectedCourse && (
        <div className={styles.selectedInfo}>
          <span>✅ {formatTrackName(selectedRacetrack)} — {formatCourseName(selectedCourse)}</span>
        </div>
      )}
    </div>
  );

  const renderStep1 = () => (
    <div className={styles.stepBody}>
      <h2 className={styles.stepTitle}>
        🐴 Pilih Trainee <span className={styles.optional}>(opsional)</span>
      </h2>
      <p className={styles.stepHint}>
        Unique skill milik trainee akan otomatis dipilih dan unique skill lainnya disembunyikan.
      </p>

      <div className={styles.formSection}>
        <label className={styles.label}>Cari trainee</label>
        <input
          type="text"
          placeholder="Ketik nama trainee..."
          value={traineeSearch}
          onChange={(e) => setTraineeSearch(e.target.value)}
        />
      </div>

      {selectedTrainee && (
        <div className={styles.selectedInfo}>
          <img
            src={`/images/uma_icons/Game_Playable_Icon_${selectedTrainee.id}01.png`}
            alt=""
            className={styles.traineeIconSmall}
            onError={(e) => { e.target.style.display = 'none'; }}
          />
          <span>✅ {selectedTrainee.name_en || selectedTrainee.name_ja}</span>
          {traineeUniqueSkillIds.size > 0 && (
            <span className={styles.uniqueBadge}>
              {traineeUniqueSkillIds.size} unique skill
            </span>
          )}
          <button className={styles.clearBtn} onClick={() => setSelectedTrainee(null)}>✕</button>
        </div>
      )}

      {loadingTrainees ? (
        <div className={styles.centerLoader}><Spinner size={28} /></div>
      ) : (
        <div className={styles.traineeGrid}>
          {trainees.map((t) => {
            const name = t.name_en || t.name_ja || '';
            const words = name.split(' ').filter(Boolean);
            // Konversi name_en ke nama file: spasi → underscore
            const raceImg = t.name_en
              ? `/images/uma_race/${t.name_en.replace(/ /g, '_')}_(Race).png`
              : null;
            return (
              <button
                key={t.id}
                className={[styles.traineeCard, selectedTrainee?.id === t.id ? styles.traineeSelected : ''].join(' ')}
                onClick={() => handleSelectTrainee(t)}
              >
                {/* Teks besar transparan di background */}
                <div className={styles.traineeNameBg}>
                  {words.map((w, i) => (
                    <span key={i} className={styles.traineeNameBgWord}>{w}</span>
                  ))}
                </div>
                {/* Gambar race trainee */}
                {raceImg && (
                  <img
                    src={raceImg}
                    alt=""
                    className={styles.traineeRaceImg}
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                )}
                {/* Badge nama di bawah */}
                <span className={styles.traineeName}>{name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderStep2 = () => (
    <div className={styles.stepBody}>
      <h2 className={styles.stepTitle}>📊 Input Stats Uma</h2>

      <div className={styles.statGrid}>
        {STATS.map((key) => (
          <div key={key} className={styles.statField}>
            <label className={styles.statLabel}>{STAT_LABELS[key]}</label>
            <input
              type="number"
              min={1}
              max={9999}
              value={umaStats[key]}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                if (!isNaN(n)) setUmaStats({ [key]: n });
              }}
            />
          </div>
        ))}
      </div>

      <div className={styles.formSection} style={{ marginTop: 20 }}>
        <label className={styles.label}>Running Style</label>
        <select value={umaStats.style} onChange={(e) => setUmaStats({ style: e.target.value })}>
          {STYLE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div className={styles.aptRow}>
        <div className={styles.formSection}>
          <label className={styles.label}>Distance Apt.</label>
          <select value={umaStats.distanceApt} onChange={(e) => setUmaStats({ distanceApt: e.target.value })}>
            {APT_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div className={styles.formSection}>
          <label className={styles.label}>Surface Apt.</label>
          <select value={umaStats.surfaceApt} onChange={(e) => setUmaStats({ surfaceApt: e.target.value })}>
            {APT_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      </div>

      <div className={styles.formSection}>
        <label className={styles.label}>Mood</label>
        <select value={umaStats.moodLevel} onChange={(e) => setUmaStats({ moodLevel: Number(e.target.value) })}>
          {MOOD_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
    </div>
  );

  const renderStep3 = () => {
    const uniqueAutoSelected = filteredSkills.filter(
      (s) => isUniqueRarity(s) && traineeUniqueSkillIds.has(s.id)
    );
    const nonUniqueSkills = filteredSkills.filter((s) => !isUniqueRarity(s));

    return (
      <div className={styles.stepBody}>
        <h2 className={styles.stepTitle}>🎯 Pilih Skill</h2>

        <div className={styles.skillHeader}>
          <span className={styles.skillCount}>
            {selectedSkillIds.length > 0
              ? `${selectedSkillIds.length} skill dipilih`
              : 'Belum ada skill dipilih'}
          </span>
          <input
            type="text"
            placeholder="Cari skill..."
            value={skillSearch}
            onChange={(e) => setSkillSearch(e.target.value)}
            className={styles.searchInput}
          />
          {selectedSkillIds.length > 0 && (
            <button className={styles.clearBtn} onClick={clearSkills}>Reset</button>
          )}
        </div>

        {uniqueAutoSelected.length > 0 && (
          <div className={styles.uniqueSection}>
            <div className={styles.uniqueSectionLabel}>
              ⭐ Unique Skill — {selectedTrainee?.name_en || selectedTrainee?.name_ja}
              <span className={styles.autoTag}>otomatis dipilih</span>
            </div>
            <div className={styles.skillGrid}>
              {uniqueAutoSelected.map((skill) => {
                const selected = selectedSkillIds.includes(skill.id);
                return (
                  <button
                    key={skill.id}
                    className={[styles.skillCard, styles.skillUnique, selected ? styles.skillSelected : ''].join(' ')}
                    onClick={() => toggleSkill(skill.id)}
                  >
                    <div className={styles.skillTop}>
                      <Badge color={RARITY_COLORS[skill.rarity]} bg={`${RARITY_COLORS[skill.rarity]}18`}>
                        {rarityLabel(skill.rarity)}
                      </Badge>
                      {selected && <span className={styles.checkmark}>✓</span>}
                    </div>
                    <div className={styles.skillName}>
                      {skill.name_en || skill.name_ja || `Skill #${skill.id}`}
                    </div>
                    {skill.name_en && skill.name_ja && (
                      <div className={styles.skillNameJa}>{skill.name_ja}</div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {loadingSkills ? (
          <div className={styles.centerLoader}><Spinner size={28} /></div>
        ) : nonUniqueSkills.length === 0 && uniqueAutoSelected.length === 0 ? (
          <Empty icon="🔍" message="Tidak ada skill yang cocok" />
        ) : (
          nonUniqueSkills.length > 0 && (
            <div className={styles.skillGrid}>
              {nonUniqueSkills.map((skill) => {
                const selected = selectedSkillIds.includes(skill.id);
                return (
                  <button
                    key={skill.id}
                    className={[styles.skillCard, selected ? styles.skillSelected : ''].join(' ')}
                    onClick={() => toggleSkill(skill.id)}
                  >
                    <div className={styles.skillTop}>
                      <Badge color={RARITY_COLORS[skill.rarity]} bg={`${RARITY_COLORS[skill.rarity]}18`}>
                        {rarityLabel(skill.rarity)}
                      </Badge>
                      {selected && <span className={styles.checkmark}>✓</span>}
                    </div>
                    <div className={styles.skillName}>
                      {skill.name_en || skill.name_ja || `Skill #${skill.id}`}
                    </div>
                    {skill.name_en && skill.name_ja && (
                      <div className={styles.skillNameJa}>{skill.name_ja}</div>
                    )}
                    {skill.isValid === false && (
                      <div className={styles.invalidBadge}>Possibly invalid</div>
                    )}
                  </button>
                );
              })}
            </div>
          )
        )}
      </div>
    );
  };

  const renderStep4 = () => (
    <div className={styles.stepBody}>
      <h2 className={styles.stepTitle}>📊 Hasil Analisis</h2>

      {analyzeMutation.isPending && (
        <div className={styles.centerLoader}><Spinner size={36} /></div>
      )}
      {analyzeMutation.isError && (
        <Empty icon="⚠️" message={analyzeMutation.error?.message || 'Gagal menganalisis'} />
      )}

      {analysisResult && (
        <div className={styles.resultList}>
          <Card className={styles.courseInfoCard}>
            <div className={styles.courseInfoGrid}>
              <span className={styles.infoLabel}>Course</span>
              <span>{analysisResult.courseInfo?.distance}m</span>
              <span className={styles.infoLabel}>Ground</span>
              <span>{analysisResult.courseInfo?.ground === 1 ? 'Turf' : 'Dirt'}</span>
              <span className={styles.infoLabel}>Sections</span>
              <span>{analysisResult.simulationMeta?.totalSections}</span>
              <span className={styles.infoLabel}>Trainee</span>
              <span>{selectedTrainee?.name_en || selectedTrainee?.name_ja || '—'}</span>
            </div>
          </Card>

          {analysisResult.skills?.map((s) => (
            <Card key={s.id} className={styles.resultCard}>
              <div className={styles.resultTop}>
                <span className={styles.resultName}>
                  {s.name_en || s.name_ja || `Skill #${s.id}`}
                </span>
                <span
                  className={styles.resultStatus}
                  style={{ color: statusColor[s.status] || 'var(--text3)' }}
                >
                  {s.status}
                </span>
              </div>

              {s.activeSections?.length > 0 && (
                <div className={styles.sectionBar}>
                  {Array.from({ length: analysisResult.simulationMeta?.totalSections || 24 }).map((_, i) => (
                    <span
                      key={i}
                      className={styles.sectionDot}
                      style={{
                        background: s.activeSections.includes(i) ? 'var(--green)' : 'var(--bg4)',
                      }}
                    />
                  ))}
                </div>
              )}

              <div className={styles.resultMeta}>
                {s.activationRate != null && (
                  <span>Rate: {(s.activationRate * 100).toFixed(0)}%</span>
                )}
                {s.score != null && (
                  <span style={{ color: 'var(--accent)' }}>Score: {s.score.toFixed(1)}</span>
                )}
              </div>
              {s.note && <div className={styles.resultNote}>{s.note}</div>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  const stepContent = [renderStep0, renderStep1, renderStep2, renderStep3, renderStep4];

  return (
    <div className={styles.wrapper}>
      <div className={styles.stepper}>
        {STEPS.map((label, i) => (
          <div key={i} className={styles.stepperItem}>
            <button
              className={[
                styles.stepDot,
                i === step ? styles.stepDotActive : '',
                i < step ? styles.stepDotDone : '',
              ].join(' ')}
              onClick={() => i < step && setStep(i)}
              disabled={i > step}
              title={label}
            >
              {i < step ? '✓' : i + 1}
            </button>
            <span className={[styles.stepLabel, i === step ? styles.stepLabelActive : ''].join(' ')}>
              {label}
            </span>
            {i < STEPS.length - 1 && (
              <div className={[styles.stepLine, i < step ? styles.stepLineDone : ''].join(' ')} />
            )}
          </div>
        ))}
      </div>

      <div className={styles.content}>
        {stepContent[step]?.()}
      </div>

      <div className={styles.footer}>
        {step > 0 && step < 4 && (
          <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>
            ← Kembali
          </Button>
        )}
        <div className={styles.footerRight}>
          {step < 3 && (
            <Button variant="primary" disabled={!canGoNext()} onClick={() => setStep((s) => s + 1)}>
              Lanjut →
            </Button>
          )}
          {step === 3 && (
            <Button
              variant="primary"
              disabled={selectedSkillIds.length === 0 || analyzeMutation.isPending}
              onClick={handleCheck}
            >
              {analyzeMutation.isPending
                ? <><Spinner size={14} /> Menganalisis...</>
                : '🔍 Check Skill'}
            </Button>
          )}
          {step === 4 && (
            <>
              <Button variant="ghost" onClick={() => setStep(3)}>← Ubah Skill</Button>
              <Button variant="primary" onClick={handleReset}>🔄 Mulai Ulang</Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}