// uma-frontend/src/pages/SkillChecker/index.jsx
import { useState, useEffect, useRef } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '../../store/appStore';
import { getValidSkills, analyzeUma, getCharacters, getCharacter } from '../../api/services';
import { Button, Card, Badge, Empty, Spinner } from '../../components/ui';
import { RARITY_COLORS, rarityLabel, formatTrackName, formatCourseName } from '../../utils/labels';
import { getRacetracks, getCourses } from '../../api/services';
import { STYLE_OPTIONS, APT_OPTIONS, MOOD_OPTIONS } from '../../utils/labels';

const STEPS = ['Track', 'Trainee', 'Stats', 'Skills', 'Result'];
const STATS = ['speed', 'stamina', 'power', 'guts', 'wisdom'];
const STAT_LABELS = { speed: 'Speed', stamina: 'Stamina', power: 'Power', guts: 'Guts', wisdom: 'Wisdom' };

const isUniqueRarity = (skill) => skill.rarity === 3;

function cardVersion(card_id, chara_id) {
  return card_id - chara_id * 100;
}

function cardLabel(card_id, chara_id) {
  const ver = cardVersion(card_id, chara_id);
  if (ver === 1) return 'Default';
  return `Alt ${ver}`;
}

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 },
};

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
  const [selectedCardId, setSelectedCardId] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);

  const autoSelectedIdsRef = useRef(new Set());

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

  const allCards = traineeDetail?.cards || [];

  const cardGroups = allCards.reduce((acc, c) => {
    if (!acc[c.card_id]) acc[c.card_id] = [];
    acc[c.card_id].push(c);
    return acc;
  }, {});

  const uniqueCardIds = Object.keys(cardGroups).map(Number).sort();
  const activeCardId = selectedCardId ?? uniqueCardIds[0] ?? null;

  useEffect(() => {
    if (!traineeDetail) return;
    const defaultCard = allCards
      .filter(c => c.is_default_rarity)
      .sort((a, b) => b.rarity - a.rarity)[0]
      ?? allCards.sort((a, b) => b.rarity - a.rarity)[0];
    setSelectedCardId(defaultCard?.card_id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traineeDetail?.character?.id]);

  const traineeUniqueSkillIds = new Set();
  if (activeCardId && cardGroups[activeCardId]) {
    for (const card of cardGroups[activeCardId]) {
      for (const sk of card.innate_skills || []) {
        traineeUniqueSkillIds.add(sk.skill_id);
      }
    }
  }

  const uniqueSkillsFromDetail = [];
  if (activeCardId && cardGroups[activeCardId]) {
    for (const card of cardGroups[activeCardId]) {
      for (const sk of card.innate_skills || []) {
        if (!uniqueSkillsFromDetail.find(x => x.skill_id === sk.skill_id)) {
          uniqueSkillsFromDetail.push(sk);
        }
      }
    }
  }

  const { data: skillData, isLoading: loadingSkills } = useQuery({
    queryKey: ['valid-skills', selectedCourse?.id],
    queryFn: () => getValidSkills(selectedCourse.id, false),
    enabled: !!selectedCourse,
    staleTime: 5 * 60_000,
  });
  const allSkills = skillData?.skills || [];

  const nonUniqueSkills = allSkills.filter((s) => !isUniqueRarity(s));

  const filteredNonUnique = nonUniqueSkills.filter((s) => {
    if (!skillSearch.trim()) return true;
    const q = skillSearch.toLowerCase();
    return s.name_ja?.toLowerCase().includes(q) || s.name_en?.toLowerCase().includes(q);
  });

  const filteredUnique = uniqueSkillsFromDetail.filter((sk) => {
    if (!skillSearch.trim()) return true;
    const q = skillSearch.toLowerCase();
    return sk.name_ja?.toLowerCase().includes(q) || sk.name_en?.toLowerCase().includes(q);
  });

  useEffect(() => {
    if (traineeUniqueSkillIds.size === 0) return;
    for (const id of traineeUniqueSkillIds) {
      if (!selectedSkillIds.includes(id)) {
        toggleSkill(id);
      }
      autoSelectedIdsRef.current.add(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCardId, traineeDetail]);

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
    setSelectedCardId(null);
    autoSelectedIdsRef.current = new Set();
  };

  const handleSelectTrainee = (t) => {
    for (const id of autoSelectedIdsRef.current) {
      if (selectedSkillIds.includes(id)) toggleSkill(id);
    }
    autoSelectedIdsRef.current = new Set();

    setSelectedTrainee(selectedTrainee?.id === t.id ? null : t);
    setSelectedCardId(null);
  };

  const handleSelectCard = (cardId) => {
    for (const id of autoSelectedIdsRef.current) {
      if (selectedSkillIds.includes(id)) toggleSkill(id);
    }
    autoSelectedIdsRef.current = new Set();
    setSelectedCardId(cardId);
  };

  const statusColor = {
    active: 'var(--green)',
    conditional: 'var(--accent)',
    invalid: 'var(--red)',
    unknown: 'var(--text3)',
  };

  const labelCls = 'mb-1.5 block text-xs font-medium text-charcoal-500';
  const formSection = 'mb-4';

  // ── Step 0: Track ──────────────────────────────────────────────────────────
  const renderStep0 = () => (
    <motion.div variants={fadeUp} initial="hidden" animate="show" className="max-w-xl">
      <h2 className="font-serif text-2xl font-semibold text-charcoal-800 mb-6">
        Pilih Race Track &amp; Course
      </h2>

      <div className={formSection}>
        <label className={labelCls}>Racetrack</label>
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

      <div className={formSection}>
        <label className={labelCls}>Course</label>
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
        <div className={formSection}>
          <label className={labelCls}>Kondisi Lintasan</label>
          <select value={groundCondition} onChange={(e) => setGroundCondition(Number(e.target.value))}>
            <option value={1}>Firm</option>
            <option value={2}>Good</option>
            <option value={3}>Soft</option>
            <option value={4}>Heavy</option>
          </select>
        </div>
      )}

      {selectedCourse && (
        <div className="mt-2 rounded-2xl border border-sage-200 bg-sage-50 px-4 py-3 text-sm font-medium text-sage-700">
          {formatTrackName(selectedRacetrack)} — {formatCourseName(selectedCourse)}
        </div>
      )}
    </motion.div>
  );

  // ── Step 1: Trainee ────────────────────────────────────────────────────────
  const renderStep1 = () => (
    <motion.div variants={fadeUp} initial="hidden" animate="show">
      <h2 className="font-serif text-2xl font-semibold text-charcoal-800 mb-1">
        Pilih Trainee <span className="font-sans text-sm italic font-normal text-charcoal-400">(opsional)</span>
      </h2>
      <p className="mb-5 text-sm text-charcoal-400 max-w-lg">
        Unique skill milik trainee akan otomatis dipilih dan unique skill lainnya disembunyikan.
      </p>

      <div className={`${formSection} max-w-sm`}>
        <label className={labelCls}>Cari trainee</label>
        <input
          type="text"
          placeholder="Ketik nama trainee..."
          value={traineeSearch}
          onChange={(e) => setTraineeSearch(e.target.value)}
        />
      </div>

      {selectedTrainee && (
        <div className="mb-4 flex flex-wrap items-center gap-2.5 rounded-2xl border border-sage-200 bg-sage-50 px-4 py-2.5">
          <img
            src={`/images/uma_icons/Game_Playable_Icon_${selectedTrainee.id}01.png`}
            alt=""
            className="h-7 w-7 rounded-full object-cover"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
          <span className="text-sm font-medium text-sage-700">{selectedTrainee.name_en || selectedTrainee.name_ja}</span>
          {traineeUniqueSkillIds.size > 0 && (
            <Badge color="var(--accent2)" bg="var(--accent-bg2)">{traineeUniqueSkillIds.size} unique skill</Badge>
          )}
          <button
            className="ml-auto text-charcoal-400 hover:text-charcoal-700"
            onClick={() => {
              for (const id of autoSelectedIdsRef.current) {
                if (selectedSkillIds.includes(id)) toggleSkill(id);
              }
              autoSelectedIdsRef.current = new Set();
              setSelectedTrainee(null);
              setSelectedCardId(null);
            }}
          >✕</button>
        </div>
      )}

      {selectedTrainee && uniqueCardIds.length > 1 && (
        <div className="mb-5">
          <label className={labelCls}>Versi Trainee</label>
          <div className="flex flex-wrap gap-2">
            {uniqueCardIds.map((cid) => {
              const isActive = cid === activeCardId;
              const ver = cardVersion(cid, selectedTrainee.id);
              const iconSuffix = String(ver).padStart(2, '0');
              return (
                <button
                  key={cid}
                  className={[
                    'flex items-center gap-2 rounded-2xl border px-3 py-1.5 text-xs font-medium transition-colors',
                    isActive
                      ? 'border-sage-500 bg-sage-50 text-sage-700'
                      : 'border-charcoal-200 text-charcoal-500 hover:border-charcoal-400',
                  ].join(' ')}
                  onClick={() => handleSelectCard(cid)}
                >
                  <img
                    src={`/images/uma_icons/Game_Playable_Icon_${selectedTrainee.id}${iconSuffix}.png`}
                    alt=""
                    className="h-5 w-5 rounded-full object-cover"
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                  <span>{cardLabel(cid, selectedTrainee.id)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {loadingTrainees ? (
        <div className="flex justify-center py-10"><Spinner size={28} /></div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
          {trainees.map((t) => {
            const name = t.name_en || t.name_ja || '';
            const isSel = selectedTrainee?.id === t.id;
            const raceImg = t.name_en
              ? `/images/uma_race/${t.name_en.replace(/ /g, '_')}_(Race).png`
              : null;
            return (
              <motion.button
                key={t.id}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={{ duration: 0.15 }}
                className={[
                  'relative flex aspect-[4/5] flex-col items-center justify-end overflow-hidden rounded-2xl border p-2 text-center shadow-soft',
                  isSel ? 'border-sage-500 ring-2 ring-sage-200' : 'border-charcoal-100 hover:border-charcoal-300',
                  'bg-cream-50',
                ].join(' ')}
                onClick={() => handleSelectTrainee(t)}
              >
                {raceImg && (
                  <img
                    src={raceImg}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover opacity-90"
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-charcoal-900/80 via-charcoal-900/20 to-transparent px-2 py-2">
                  <span className="text-[11px] font-medium leading-tight text-cream-50">{name}</span>
                </div>
              </motion.button>
            );
          })}
        </div>
      )}
    </motion.div>
  );

  // ── Step 2: Stats ──────────────────────────────────────────────────────────
  const renderStep2 = () => (
    <motion.div variants={fadeUp} initial="hidden" animate="show" className="max-w-2xl">
      <h2 className="font-serif text-2xl font-semibold text-charcoal-800 mb-6">Input Stats Uma</h2>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        {STATS.map((key) => (
          <div key={key}>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-charcoal-400">{STAT_LABELS[key]}</label>
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

      <div className={formSection}>
        <label className={labelCls}>Running Style</label>
        <select value={umaStats.style} onChange={(e) => setUmaStats({ style: e.target.value })}>
          {STYLE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Distance Apt.</label>
          <select value={umaStats.distanceApt} onChange={(e) => setUmaStats({ distanceApt: e.target.value })}>
            {APT_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Surface Apt.</label>
          <select value={umaStats.surfaceApt} onChange={(e) => setUmaStats({ surfaceApt: e.target.value })}>
            {APT_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      </div>

      <div className={formSection}>
        <label className={labelCls}>Mood</label>
        <select value={umaStats.moodLevel} onChange={(e) => setUmaStats({ moodLevel: Number(e.target.value) })}>
          {MOOD_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
    </motion.div>
  );

  // ── Step 3: Skills ─────────────────────────────────────────────────────────
  const skillCardCls = (selected, unique) =>
    [
      'relative flex flex-col rounded-2xl border p-3.5 text-left transition-colors shadow-soft',
      selected
        ? unique ? 'border-gold-500 bg-gold-100/40' : 'border-sage-500 bg-sage-50'
        : 'border-charcoal-100 bg-cream-50 hover:border-charcoal-300',
    ].join(' ');

  const renderStep3 = () => (
    <motion.div variants={fadeUp} initial="hidden" animate="show">
      <h2 className="font-serif text-2xl font-semibold text-charcoal-800 mb-4">Pilih Skill</h2>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-charcoal-500">
          {selectedSkillIds.length > 0
            ? `${selectedSkillIds.length} skill dipilih`
            : 'Belum ada skill dipilih'}
        </span>
        <input
          type="text"
          placeholder="Cari skill..."
          value={skillSearch}
          onChange={(e) => setSkillSearch(e.target.value)}
          className="max-w-xs"
        />
        {selectedSkillIds.length > 0 && (
          <button className="text-xs font-medium text-clay-500 hover:underline" onClick={clearSkills}>Reset</button>
        )}
      </div>

      {filteredUnique.length > 0 && (
        <div className="mb-6">
          <div className="mb-2.5 flex flex-wrap items-center gap-2 text-xs font-semibold text-gold-700">
            <span>⭐ Unique Skill — {selectedTrainee?.name_en || selectedTrainee?.name_ja}</span>
            {uniqueCardIds.length > 1 && (
              <Badge color="var(--accent2)" bg="var(--accent-bg2)">{cardLabel(activeCardId, selectedTrainee?.id)}</Badge>
            )}
            <span className="font-normal italic text-charcoal-400">otomatis dipilih</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {filteredUnique.map((sk) => {
              const selected = selectedSkillIds.includes(sk.skill_id);
              return (
                <button
                  key={sk.skill_id}
                  className={skillCardCls(selected, true)}
                  onClick={() => toggleSkill(sk.skill_id)}
                >
                  <div className="mb-1.5 flex items-center justify-between">
                    <Badge color={RARITY_COLORS[sk.rarity]} bg={`${RARITY_COLORS[sk.rarity]}18`}>
                      {rarityLabel(sk.rarity)}
                    </Badge>
                    {selected && <span className="text-sage-600">✓</span>}
                  </div>
                  <div className="text-sm font-medium text-charcoal-800">
                    {sk.name_en || sk.name_ja || `Skill #${sk.skill_id}`}
                  </div>
                  {sk.name_en && sk.name_ja && (
                    <div className="mt-0.5 text-xs text-charcoal-400">{sk.name_ja}</div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {loadingSkills ? (
        <div className="flex justify-center py-10"><Spinner size={28} /></div>
      ) : filteredNonUnique.length === 0 && filteredUnique.length === 0 ? (
        <Empty icon="🔍" message="Tidak ada skill yang cocok" />
      ) : (
        filteredNonUnique.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {filteredNonUnique.map((skill) => {
              const selected = selectedSkillIds.includes(skill.id);
              return (
                <button
                  key={skill.id}
                  className={skillCardCls(selected, false)}
                  onClick={() => toggleSkill(skill.id)}
                >
                  <div className="mb-1.5 flex items-center justify-between">
                    <Badge color={RARITY_COLORS[skill.rarity]} bg={`${RARITY_COLORS[skill.rarity]}18`}>
                      {rarityLabel(skill.rarity)}
                    </Badge>
                    {selected && <span className="text-sage-600">✓</span>}
                  </div>
                  <div className="text-sm font-medium text-charcoal-800">
                    {skill.name_en || skill.name_ja || `Skill #${skill.id}`}
                  </div>
                  {skill.name_en && skill.name_ja && (
                    <div className="mt-0.5 text-xs text-charcoal-400">{skill.name_ja}</div>
                  )}
                  {skill.isValid === false && (
                    <div className="mt-1.5 text-[10px] font-medium text-clay-500">Possibly invalid</div>
                  )}
                </button>
              );
            })}
          </div>
        )
      )}
    </motion.div>
  );

  // ── Step 4: Result ─────────────────────────────────────────────────────────
  const renderStep4 = () => (
    <motion.div variants={fadeUp} initial="hidden" animate="show" className="max-w-2xl">
      <h2 className="font-serif text-2xl font-semibold text-charcoal-800 mb-5">Hasil Analisis</h2>

      {analyzeMutation.isPending && (
        <div className="flex justify-center py-10"><Spinner size={36} /></div>
      )}
      {analyzeMutation.isError && (
        <Empty icon="⚠️" message={analyzeMutation.error?.message || 'Gagal menganalisis'} />
      )}

      {analysisResult && (
        <div className="flex flex-col gap-3">
          <Card>
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <span className="text-charcoal-400">Course</span>
              <span>{analysisResult.courseInfo?.distance}m</span>
              <span className="text-charcoal-400">Ground</span>
              <span>{analysisResult.courseInfo?.ground === 1 ? 'Turf' : 'Dirt'}</span>
              <span className="text-charcoal-400">Sections</span>
              <span>{analysisResult.simulationMeta?.totalSections}</span>
              <span className="text-charcoal-400">Trainee</span>
              <span>
                {selectedTrainee?.name_en || selectedTrainee?.name_ja || '—'}
                {uniqueCardIds.length > 1 && activeCardId && (
                  <Badge color="var(--accent2)" bg="var(--accent-bg2)">
                    {cardLabel(activeCardId, selectedTrainee?.id)}
                  </Badge>
                )}
              </span>
            </div>
          </Card>

          {analysisResult.skills?.map((s) => (
            <Card key={s.id}>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-charcoal-800">
                  {s.name_en || s.name_ja || `Skill #${s.id}`}
                </span>
                <span className="text-xs font-semibold" style={{ color: statusColor[s.status] || 'var(--text3)' }}>
                  {s.status}
                </span>
              </div>

              {s.activeSections?.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-[3px]">
                  {Array.from({ length: analysisResult.simulationMeta?.totalSections || 24 }).map((_, i) => (
                    <span
                      key={i}
                      className="h-2 w-2 rounded-full"
                      style={{
                        background: s.activeSections.includes(i) ? 'var(--green)' : 'var(--bg4)',
                      }}
                    />
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-4 text-xs text-charcoal-400">
                {s.activationRate != null && (
                  <span>Rate: {(s.activationRate * 100).toFixed(0)}%</span>
                )}
                {s.score != null && (
                  <span className="text-sage-600 font-medium">Score: {s.score.toFixed(1)}</span>
                )}
              </div>
              {s.note && <div className="mt-2 text-xs italic text-charcoal-400">{s.note}</div>}
            </Card>
          ))}
        </div>
      )}
    </motion.div>
  );

  const stepContent = [renderStep0, renderStep1, renderStep2, renderStep3, renderStep4];

  return (
    <div className="flex h-full flex-col">
      {/* Stepper */}
      <div className="flex flex-shrink-0 items-center gap-1 overflow-x-auto border-b border-charcoal-100 bg-cream-50 px-4 py-3.5 md:px-8">
        {STEPS.map((label, i) => (
          <div key={i} className="flex flex-shrink-0 items-center">
            <button
              className={[
                'flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold transition-colors',
                i === step
                  ? 'border-sage-600 bg-sage-600 text-cream-50'
                  : i < step
                  ? 'border-sage-300 bg-sage-100 text-sage-700 cursor-pointer'
                  : 'border-charcoal-200 text-charcoal-300',
              ].join(' ')}
              onClick={() => i < step && setStep(i)}
              disabled={i > step}
              title={label}
            >
              {i < step ? '✓' : i + 1}
            </button>
            <span className={[
              'ml-2 mr-3 hidden text-xs font-medium sm:inline',
              i === step ? 'text-charcoal-800' : 'text-charcoal-300',
            ].join(' ')}>
              {label}
            </span>
            {i < STEPS.length - 1 && (
              <div className={[
                'mr-3 h-px w-6 sm:w-10',
                i < step ? 'bg-sage-400' : 'bg-charcoal-200',
              ].join(' ')} />
            )}
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8">
        <AnimatePresence mode="wait">
          <div key={step}>{stepContent[step]?.()}</div>
        </AnimatePresence>
      </div>

      <div className="flex flex-shrink-0 items-center gap-3 border-t border-charcoal-100 bg-cream-50 px-4 py-3.5 md:px-8">
        {step > 0 && step < 4 && (
          <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>
            ← Kembali
          </Button>
        )}
        <div className="ml-auto flex gap-3">
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
