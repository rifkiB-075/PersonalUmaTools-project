import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { simulate, analyzeUma } from '../../api/services';
import { useAppStore } from '../../store/appStore';
import { Button, SectionLabel, Card, Badge, Empty, Spinner } from '../../components/ui';
import { RARITY_COLORS, rarityLabel } from '../../utils/labels';
import CourseSelector from '../../components/CourseSelector';
import SavedTraineeManager from '../../components/SavedTraineeManager';
import styles from './Simulate.module.css';

const PHASE_LABELS = ['Early', 'Mid', 'Late', 'Last Spurt'];
const PHASE_COLORS = ['#5b9bd5', '#a8cc8c', 'var(--accent)', '#e08a3c'];
const SKILL_STATUS_COLOR = {
  active: 'var(--green, #6fbf73)',
  conditional: 'var(--accent)',
  invalid: 'var(--red)',
  unknown: 'var(--text3)',
  not_found: 'var(--text3)',
};

// Jalankan simulasi fisika untuk satu trainee, + analisis skill kalau ada skillIds
async function runOneParticipant({ courseId, groundCondition, trainee }) {
  const simRes = await simulate({ courseId, groundCondition, uma: trainee.stats });

  let skillsRes = null;
  if (trainee.skillIds && trainee.skillIds.length > 0) {
    try {
      skillsRes = await analyzeUma({
        courseId, groundCondition, uma: trainee.stats, skillIds: trainee.skillIds,
      });
    } catch {
      skillsRes = null; // analisis skill gagal tidak boleh menggagalkan keseluruhan race
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
      // Ranking: yang finish (HP tidak habis) duluan, lalu waktu tercepat menang
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
    <div className={styles.layout}>
      {/* Left */}
      <div className={styles.left}>
        {/* 1. Kelola trainee tersimpan — independen dari pilihan track */}
        <SavedTraineeManager mode="manage" selectable={false} />

        <div className={styles.divider} />

        {/* 2. Pilih track dulu */}
        <CourseSelector />

        {/* 3. Setelah track dipilih, baru pilih peserta race (boleh lebih dari satu) */}
        {selectedCourse && (
          <SavedTraineeManager mode="pick" selectable />
        )}

        {selectedCourse && (
          <div>
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
          <p className={styles.hintMsg}>Centang trainee tersimpan di atas untuk ikut race.</p>
        )}

        {mutation.isError && (
          <p className={styles.errorMsg}>{mutation.error?.message}</p>
        )}
      </div>

      {/* Right: results */}
      <div className={styles.right}>
        <SectionLabel icon="🏁">Hasil Race</SectionLabel>

        {!leaderboard && !mutation.isPending && (
          <Empty icon="🏇" message="Simpan trainee (boleh lebih dari satu), pilih track, lalu jalankan race" />
        )}

        {mutation.isPending && (
          <div className={styles.loading}><Spinner size={32} /></div>
        )}

        {leaderboard && (
          <div className={styles.resultContent}>
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

  // Distribusi section per phase, untuk bar fase sederhana
  const phaseCounts = [0, 0, 0, 0];
  for (const snap of sim.snapshots || []) {
    if (phaseCounts[snap.phase] != null) phaseCounts[snap.phase]++;
  }
  const totalSections = sim.snapshots?.length || 1;

  return (
    <Card className={styles.raceRow}>
      <div className={styles.raceRowHeader} onClick={onToggle} role="button">
        <span className={styles.raceMedal}>{medal}</span>
        <img
          src={`/images/uma_icons/Game_Playable_Icon_${trainee.characterId}01.png`}
          alt=""
          className={styles.raceIcon}
          onError={(e) => { e.target.style.display = 'none'; }}
        />
        <div className={styles.raceInfo}>
          <div className={styles.raceLabel}>{trainee.label}</div>
          <div className={styles.raceSub}>
            {trainee.characterName}{trainee.cardLabel ? ` · ${trainee.cardLabel}` : ''}
          </div>
        </div>
        <div className={styles.raceTime}>
          {sim.ranOutOfHp ? (
            <span className={styles.dnf}>HP Habis</span>
          ) : (
            <span>{sim.finishTimeSeconds.toFixed(2)}s</span>
          )}
        </div>
        <span className={styles.expandArrow}>{expanded ? '▲' : '▼'}</span>
      </div>

      <div className={styles.raceStatLine}>
        <span>HP Sisa: {sim.finalHp.toFixed(0)} / {sim.maxHp.toFixed(0)}</span>
        {skillSummary && (
          <span className={styles.skillSummaryLine}>
            🎯 {skillSummary.active || 0} aktif · {skillSummary.conditional || 0} kondisional · {skillSummary.invalid || 0} invalid
          </span>
        )}
        {!skills && trainee.skillIds?.length > 0 && (
          <span className={styles.skillSummaryLine}>🎯 Analisis skill gagal dimuat</span>
        )}
        {(!trainee.skillIds || trainee.skillIds.length === 0) && (
          <span className={styles.skillSummaryLine}>🎯 Tanpa skill</span>
        )}
      </div>

      {expanded && (
        <div className={styles.raceDetail}>
          {/* Phase bar */}
          <div className={styles.phaseBarWrap}>
            {PHASE_LABELS.map((label, idx) => {
              const pct = (phaseCounts[idx] / totalSections) * 100;
              if (pct === 0) return null;
              return (
                <div
                  key={idx}
                  className={styles.phaseSeg}
                  style={{ width: `${pct}%`, background: PHASE_COLORS[idx] }}
                  title={`${label}: ${phaseCounts[idx]} section`}
                />
              );
            })}
          </div>
          <div className={styles.phaseLegend}>
            {PHASE_LABELS.map((label, idx) => (
              <span key={idx} className={styles.phaseLegendItem}>
                <span className={styles.phaseDotLegend} style={{ background: PHASE_COLORS[idx] }} />
                {label}
              </span>
            ))}
          </div>

          {/* Skill list */}
          {skills && skills.skills.length > 0 && (
            <div className={styles.skillDetailList}>
              {skills.skills.map((s) => (
                <div key={s.id} className={styles.skillDetailItem}>
                  <Badge color={RARITY_COLORS[s.rarity]} bg={`${RARITY_COLORS[s.rarity]}18`}>
                    {rarityLabel(s.rarity)}
                  </Badge>
                  <span className={styles.skillDetailName}>{s.name_en || s.name_ja || `#${s.id}`}</span>
                  <span
                    className={styles.skillDetailStatus}
                    style={{ color: SKILL_STATUS_COLOR[s.status] || 'var(--text3)' }}
                  >
                    {s.status}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Snapshot table */}
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Dist</th>
                  <th>Speed</th>
                  <th>HP</th>
                  <th>Phase</th>
                </tr>
              </thead>
              <tbody>
                {(sim.snapshots || []).map((snap, i) => (
                  <tr key={i}>
                    <td className={styles.mono}>{i}</td>
                    <td className={styles.mono}>{snap.distanceTraveled?.toFixed(0)}m</td>
                    <td className={styles.mono}>{snap.currentSpeed?.toFixed(2)}</td>
                    <td className={styles.mono}>{snap.hp?.toFixed(0)}</td>
                    <td className={styles.mono}>{PHASE_LABELS[snap.phase] ?? snap.phase}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}
