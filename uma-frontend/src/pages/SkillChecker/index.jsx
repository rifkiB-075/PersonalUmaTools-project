import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useAppStore } from '../../store/appStore';
import { getValidSkills, analyzeUma } from '../../api/services';
import { Button, SectionLabel, Card, Badge, Empty, Spinner } from '../../components/ui';
import CourseSelector from '../../components/CourseSelector';
import UmaStatsForm from '../../components/UmaStatsForm';
import { RARITY_COLORS, rarityLabel } from '../../utils/labels';
import styles from './SkillChecker.module.css';

export default function SkillCheckerPage() {
  const { selectedCourse, umaStats, selectedSkillIds, toggleSkill, clearSkills } = useAppStore();
  const [groundCondition, setGroundCondition] = useState(1);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [skillSearch, setSkillSearch] = useState('');

  // Fetch valid skills for selected course
  const {
    data: skillData,
    isLoading: loadingSkills,
    isError: skillError,
  } = useQuery({
    queryKey: ['valid-skills', selectedCourse?.id],
    queryFn: () => getValidSkills(selectedCourse.id, false),
    enabled: !!selectedCourse,
    staleTime: 30_000,
  });

  const skills = skillData?.skills || [];
  const filtered = skills.filter((s) => {
    if (!skillSearch.trim()) return true;
    const q = skillSearch.toLowerCase();
    return (
      s.name_ja?.toLowerCase().includes(q) ||
      s.name_en?.toLowerCase().includes(q)
    );
  });

  // Analyze mutation
  const analyzeMutation = useMutation({
    mutationFn: analyzeUma,
    onSuccess: (data) => setAnalysisResult(data),
  });

  const handleAnalyze = () => {
    if (!selectedCourse || selectedSkillIds.length === 0) return;
    analyzeMutation.mutate({
      courseId: selectedCourse.id,
      groundCondition,
      uma: umaStats,
      skillIds: selectedSkillIds,
    });
  };

  const statusColor = {
    active: 'var(--green)',
    conditional: 'var(--accent)',
    invalid: 'var(--red)',
    unknown: 'var(--text3)',
  };

  return (
    <div className={styles.layout}>
      {/* Left panel */}
      <div className={styles.left}>
        <CourseSelector />

        {selectedCourse && (
          <>
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
          </>
        )}

        <UmaStatsForm />

        {selectedSkillIds.length > 0 && (
          <div>
            <SectionLabel icon="✅">Skill Dipilih ({selectedSkillIds.length})</SectionLabel>
            <div className={styles.selectedSkillCount}>
              <Button
                variant="primary"
                disabled={!selectedCourse || analyzeMutation.isPending}
                onClick={handleAnalyze}
              >
                {analyzeMutation.isPending ? (
                  <><Spinner size={14} /> Menganalisis...</>
                ) : (
                  '🔍 Analisis Skill'
                )}
              </Button>
              <Button variant="ghost" size="sm" onClick={clearSkills}>
                Reset
              </Button>
            </div>
            {analyzeMutation.isError && (
              <p className={styles.errorMsg}>{analyzeMutation.error?.message}</p>
            )}
          </div>
        )}
      </div>

      {/* Center: skill list */}
      <div className={styles.center}>
        <div className={styles.centerHeader}>
          <SectionLabel icon="📋">
            {selectedCourse
              ? `Skill untuk course ini (${skills.length})`
              : 'Pilih course untuk melihat skill'}
          </SectionLabel>
          {selectedCourse && (
            <input
              type="text"
              placeholder="Cari skill..."
              value={skillSearch}
              onChange={(e) => setSkillSearch(e.target.value)}
              className={styles.searchInput}
            />
          )}
        </div>

        {!selectedCourse && (
          <Empty icon="🏟️" message="Pilih racetrack & course di panel kiri dulu" />
        )}

        {selectedCourse && loadingSkills && (
          <div className={styles.loading}><Spinner size={28} /></div>
        )}

        {selectedCourse && skillError && (
          <Empty icon="⚠️" message="Gagal memuat skill. Pastikan backend berjalan." />
        )}

        {selectedCourse && !loadingSkills && filtered.length === 0 && (
          <Empty icon="🔍" message="Tidak ada skill yang cocok" />
        )}

        <div className={styles.skillGrid}>
          {filtered.map((skill) => {
            const selected = selectedSkillIds.includes(skill.id);
            return (
              <button
                key={skill.id}
                className={[styles.skillCard, selected ? styles.skillSelected : ''].join(' ')}
                onClick={() => toggleSkill(skill.id)}
              >
                <div className={styles.skillTop}>
                  <Badge
                    color={RARITY_COLORS[skill.rarity]}
                    bg={`${RARITY_COLORS[skill.rarity]}18`}
                  >
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
      </div>

      {/* Right: analysis result */}
      <div className={styles.right}>
        <SectionLabel icon="📊">Hasil Analisis</SectionLabel>

        {!analysisResult && !analyzeMutation.isPending && (
          <Empty icon="📊" message="Pilih skill & klik Analisis" />
        )}

        {analyzeMutation.isPending && (
          <div className={styles.loading}><Spinner size={28} /></div>
        )}

        {analysisResult && (
          <div className={styles.resultList}>
            {/* Course info */}
            <Card className={styles.courseInfoCard}>
              <div className={styles.courseInfoGrid}>
                <span className={styles.infoLabel}>Course</span>
                <span>{analysisResult.courseInfo?.distance}m</span>
                <span className={styles.infoLabel}>Ground</span>
                <span>{analysisResult.courseInfo?.ground === 1 ? 'Turf' : 'Dirt'}</span>
                <span className={styles.infoLabel}>Sections</span>
                <span>{analysisResult.simulationMeta?.totalSections}</span>
              </div>
            </Card>

            {/* Skill results ordered by score */}
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
                    {Array.from({ length: analysisResult.simulationMeta?.totalSections || 24 }).map(
                      (_, i) => (
                        <span
                          key={i}
                          className={styles.sectionDot}
                          style={{
                            background: s.activeSections.includes(i)
                              ? 'var(--green)'
                              : 'var(--bg4)',
                          }}
                        />
                      )
                    )}
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
    </div>
  );
}
