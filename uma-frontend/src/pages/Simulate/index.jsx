import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { simulate } from '../../api/services';
import { useAppStore } from '../../store/appStore';
import { Button, SectionLabel, Card, Empty, Spinner } from '../../components/ui';
import CourseSelector from '../../components/CourseSelector';
import UmaStatsForm from '../../components/UmaStatsForm';
import styles from './Simulate.module.css';

export default function SimulatePage() {
  const { selectedCourse, umaStats } = useAppStore();
  const [groundCondition, setGroundCondition] = useState(1);
  const [result, setResult] = useState(null);

  const mutation = useMutation({
    mutationFn: simulate,
    onSuccess: (data) => setResult(data),
  });

  const handleRun = () => {
    if (!selectedCourse) return;
    mutation.mutate({
      courseId: selectedCourse.id,
      groundCondition,
      uma: umaStats,
    });
  };

  return (
    <div className={styles.layout}>
      {/* Left */}
      <div className={styles.left}>
        <CourseSelector />

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

        <UmaStatsForm />

        <Button
          variant="primary"
          onClick={handleRun}
          disabled={!selectedCourse || mutation.isPending}
        >
          {mutation.isPending ? (
            <><Spinner size={14} /> Simulasi berjalan...</>
          ) : (
            '🏇 Jalankan Simulasi'
          )}
        </Button>

        {mutation.isError && (
          <p className={styles.errorMsg}>{mutation.error?.message}</p>
        )}
      </div>

      {/* Right: results */}
      <div className={styles.right}>
        <SectionLabel icon="📈">Hasil Simulasi</SectionLabel>

        {!result && !mutation.isPending && (
          <Empty icon="🏇" message="Pilih course & konfigurasi uma, lalu jalankan simulasi" />
        )}

        {mutation.isPending && (
          <div className={styles.loading}><Spinner size={32} /></div>
        )}

        {result && (
          <div className={styles.resultContent}>
            {/* Summary */}
            <Card className={styles.summaryCard}>
              <div className={styles.summaryGrid}>
                <Stat label="Jarak" value={`${result.courseInfo?.distance}m`} />
                <Stat label="Waktu" value={result.raceResult?.totalTime ? `${result.raceResult.totalTime.toFixed(2)}s` : '—'} />
                <Stat label="HP Sisa" value={result.raceResult?.hpRemaining != null ? result.raceResult.hpRemaining.toFixed(0) : '—'} />
                <Stat label="Sections" value={result.snapshots?.length ?? '—'} />
              </div>
            </Card>

            {/* Phase breakdown */}
            {result.raceResult?.phases && (
              <Card>
                <div className={styles.phaseHeader}>Phase Breakdown</div>
                <div className={styles.phaseList}>
                  {result.raceResult.phases.map((p, i) => (
                    <div key={i} className={styles.phaseRow}>
                      <span className={styles.phaseLabel}>Phase {i}</span>
                      <div className={styles.phaseBar}>
                        <div
                          className={styles.phaseBarFill}
                          style={{
                            width: `${((p.endDistance - p.startDistance) / result.courseInfo.distance) * 100}%`,
                          }}
                        />
                      </div>
                      <span className={styles.phaseDist}>
                        {p.startDistance}–{p.endDistance}m
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Snapshot table */}
            {result.snapshots && result.snapshots.length > 0 && (
              <Card>
                <div className={styles.phaseHeader}>Snapshot Per Section</div>
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
                      {result.snapshots.map((snap, i) => (
                        <tr key={i}>
                          <td className={styles.mono}>{i}</td>
                          <td className={styles.mono}>{snap.distance?.toFixed(0)}m</td>
                          <td className={styles.mono}>{snap.currentSpeed?.toFixed(2)}</td>
                          <td className={styles.mono}>{snap.currentHp?.toFixed(0)}</td>
                          <td className={styles.mono}>{snap.phase}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className={styles.statBox}>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>{value}</span>
    </div>
  );
}
