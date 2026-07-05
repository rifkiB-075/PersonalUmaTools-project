import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { simulate, analyzeUma } from '../../api/services';
import { useAppStore } from '../../store/appStore';
import { Button, SectionLabel, Card, Badge, Empty, Spinner } from '../../components/ui';
import { RARITY_COLORS, rarityLabel } from '../../utils/labels';
import CourseSelector from '../../components/CourseSelector';
import SavedTraineeManager from '../../components/SavedTraineeManager';

const PHASE_LABELS = ['Early', 'Mid', 'Late', 'Last Spurt'];
const PHASE_COLORS = ['#5b7f9b', '#8ba87a', 'var(--accent)', '#c17c56'];
const SKILL_STATUS_COLOR = {
  active: 'var(--green)',
  conditional: 'var(--accent)',
  invalid: 'var(--red)',
  unknown: 'var(--text3)',
  not_found: 'var(--text3)',
};

async function runOneParticipant({ courseId, groundCondition, trainee }) {
  const simRes = await simulate({ courseId, groundCondition, uma: trainee.stats });

  let skillsRes = null;
  if (trainee.skillIds && trainee.skillIds.length > 0) {
    try {
      skillsRes = await analyzeUma({
        courseId, groundCondition, uma: trainee.stats, skillIds: trainee.skillIds,
      });
    } catch {
      skillsRes = null;
    }
  }

  return { trainee, courseInfo: simRes.courseInfo, sim: simRes.simulation, skills: skillsRes };
}

export default function SimulatePage() {
  const { selectedCourse, savedTrainees, selectedSavedTraineeIds } = useAppStore();
  const [groundCondition, setGroundCondition] = useState(1);
  const [expandedId, setExpandedId] = useState(null);

  const participants = savedTrainees.filter((t) => selectedSavedTraineeIds.includes(t.id));

  const mutation = useMutation({
    mutationFn: async ({ courseId, groundCondition, trainees }) => {
      const results = await Promise.all(
        trainees.map((trainee) => runOneParticipant({ courseId, groundCondition, trainee }))
      );
      return [...results].sort((a, b) => {
        if (a.sim.ranOutOfHp !== b.sim.ranOutOfHp) return a.sim.ranOutOfHp ? 1 : -1;
        return a.sim.finishTimeSeconds - b.sim.finishTimeSeconds;
      });
    },
    onSuccess: () => setExpandedId(null),
  });

  const handleRun = () => {
    if (!selectedCourse || participants.length === 0) return;
    mutation.mutate({ courseId: selectedCourse.id, groundCondition, trainees: participants });
  };

  const leaderboard = mutation.data || null;

  return (
    <div className="grid h-full grid-cols-1 overflow-hidden md:grid-cols-editorial">
      {/* Left */}
      <div className="flex flex-col gap-1 overflow-y-auto border-charcoal-100 px-4 py-5 md:border-r md:px-6 md:py-6">
        <SavedTraineeManager mode="manage" selectable={false} />

        <div className="my-2 h-px bg-charcoal-100" />

        <CourseSelector />

        {selectedCourse && (
          <SavedTraineeManager mode="pick" selectable />
        )}

        {selectedCourse && (
          <div className="mb-4">
            <SectionLabel icon="🌤️">Ground Condition</SectionLabel>
            <select
              value={groundCondition}
              onChange={(e) => setGroundCondition(Number(e.target.value))}
            >
              <option value={1}>Firm</option>
              <option value={2}>Good</option>
              <option value={3}>Soft</option>
              <option value={4}>Heavy</option>
            </select>
          </div>
        )}

        <Button
          variant="primary"
          onClick={handleRun}
          disabled={!selectedCourse || participants.length === 0 || mutation.isPending}
        >
          {mutation.isPending ? (
            <><Spinner size={14} /> Race berjalan...</>
          ) : (
            `🏇 Jalankan Race (${participants.length} peserta)`
          )}
        </Button>

        {selectedCourse && participants.length === 0 && (
          <p className="mt-2 text-xs text-charcoal-400">Centang trainee tersimpan di atas untuk ikut race.</p>
        )}

        {mutation.isError && (
          <p className="mt-2 text-xs font-medium text-clay-500">{mutation.error?.message}</p>
        )}
      </div>

      {/* Right: results */}
      <div className="flex flex-col overflow-y-auto px-4 py-5 md:px-8 md:py-6">
        <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-charcoal-400">🏁 Hasil Race</div>

        {!leaderboard && !mutation.isPending && (
          <Empty icon="🏇" message="Simpan trainee (boleh lebih dari satu), pilih track, lalu jalankan race" />
        )}

        {mutation.isPending && (
          <div className="flex justify-center py-12"><Spinner size={32} /></div>
        )}

        {leaderboard && (
          <div className="flex flex-col gap-3">
            {leaderboard.map((entry, i) => (
              <RaceResultRow
                key={entry.trainee.id}
                rank={i + 1}
                entry={entry}
                expanded={expandedId === entry.trainee.id}
                onToggle={() =>
                  setExpandedId((id) => (id === entry.trainee.id ? null : entry.trainee.id))
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const MEDALS = ['🥇', '🥈', '🥉'];

function RaceResultRow({ rank, entry, expanded, onToggle }) {
  const { trainee, sim, skills } = entry;
  const medal = MEDALS[rank - 1] || `#${rank}`;

  const skillSummary = skills
    ? skills.skills.reduce(
        (acc, s) => {
          acc[s.status] = (acc[s.status] || 0) + 1;
          return acc;
        },
        {}
      )
    : null;

  const phaseCounts = [0, 0, 0, 0];
  for (const snap of sim.snapshots || []) {
    if (phaseCounts[snap.phase] != null) phaseCounts[snap.phase]++;
  }
  const totalSections = sim.snapshots?.length || 1;

  return (
    <Card className="!p-0 overflow-hidden">
      <div
        className="flex cursor-pointer items-center gap-3 px-4 py-3.5"
        onClick={onToggle}
        role="button"
      >
        <span className="w-6 flex-shrink-0 text-center text-lg">{medal}</span>
        <img
          src={`/images/uma_icons/Game_Playable_Icon_${trainee.characterId}01.png`}
          alt=""
          className="h-9 w-9 flex-shrink-0 rounded-full object-cover"
          onError={(e) => { e.target.style.display = 'none'; }}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-charcoal-800">{trainee.label}</div>
          <div className="truncate text-xs text-charcoal-400">
            {trainee.characterName}{trainee.cardLabel ? ` · ${trainee.cardLabel}` : ''}
          </div>
        </div>
        <div className="flex-shrink-0 font-mono text-sm">
          {sim.ranOutOfHp ? (
            <span className="font-semibold text-clay-500">HP Habis</span>
          ) : (
            <span className="text-charcoal-700">{sim.finishTimeSeconds.toFixed(2)}s</span>
          )}
        </div>
        <span className="flex-shrink-0 text-xs text-charcoal-300">{expanded ? '▲' : '▼'}</span>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-charcoal-100 bg-cream-100 px-4 py-2 text-xs text-charcoal-400">
        <span>HP Sisa: {sim.finalHp.toFixed(0)} / {sim.maxHp.toFixed(0)}</span>
        {skillSummary && (
          <span>🎯 {skillSummary.active || 0} aktif · {skillSummary.conditional || 0} kondisional · {skillSummary.invalid || 0} invalid</span>
        )}
        {!skills && trainee.skillIds?.length > 0 && (
          <span>🎯 Analisis skill gagal dimuat</span>
        )}
        {(!trainee.skillIds || trainee.skillIds.length === 0) && (
          <span>🎯 Tanpa skill</span>
        )}
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-charcoal-100 p-4">
              {/* Phase bar */}
              <div className="mb-2 flex h-2 overflow-hidden rounded-full">
                {PHASE_LABELS.map((label, idx) => {
                  const pct = (phaseCounts[idx] / totalSections) * 100;
                  if (pct === 0) return null;
                  return (
                    <div
                      key={idx}
                      style={{ width: `${pct}%`, background: PHASE_COLORS[idx] }}
                      title={`${label}: ${phaseCounts[idx]} section`}
                    />
                  );
                })}
              </div>
              <div className="mb-4 flex flex-wrap gap-3 text-[11px] text-charcoal-400">
                {PHASE_LABELS.map((label, idx) => (
                  <span key={idx} className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full" style={{ background: PHASE_COLORS[idx] }} />
                    {label}
                  </span>
                ))}
              </div>

              {skills && skills.skills.length > 0 && (
                <div className="mb-4 flex flex-col gap-1.5">
                  {skills.skills.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 rounded-lg bg-cream-100 px-2.5 py-1.5 text-xs">
                      <Badge color={RARITY_COLORS[s.rarity]} bg={`${RARITY_COLORS[s.rarity]}18`}>
                        {rarityLabel(s.rarity)}
                      </Badge>
                      <span className="flex-1 truncate text-charcoal-700">{s.name_en || s.name_ja || `#${s.id}`}</span>
                      <span className="flex-shrink-0 font-semibold" style={{ color: SKILL_STATUS_COLOR[s.status] || 'var(--text3)' }}>
                        {s.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="overflow-x-auto rounded-xl border border-charcoal-100">
                <table className="w-full font-mono text-[11px]">
                  <thead>
                    <tr className="border-b border-charcoal-100 bg-cream-100 text-charcoal-400">
                      <th className="px-2.5 py-1.5 text-left font-medium">#</th>
                      <th className="px-2.5 py-1.5 text-left font-medium">Dist</th>
                      <th className="px-2.5 py-1.5 text-left font-medium">Speed</th>
                      <th className="px-2.5 py-1.5 text-left font-medium">HP</th>
                      <th className="px-2.5 py-1.5 text-left font-medium">Phase</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(sim.snapshots || []).map((snap, i) => (
                      <tr key={i} className="border-b border-charcoal-50 last:border-0">
                        <td className="px-2.5 py-1 text-charcoal-400">{i}</td>
                        <td className="px-2.5 py-1">{snap.distanceTraveled?.toFixed(0)}m</td>
                        <td className="px-2.5 py-1">{snap.currentSpeed?.toFixed(2)}</td>
                        <td className="px-2.5 py-1">{snap.hp?.toFixed(0)}</td>
                        <td className="px-2.5 py-1">{PHASE_LABELS[snap.phase] ?? snap.phase}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
