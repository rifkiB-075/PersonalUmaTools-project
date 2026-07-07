import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { searchSkills, getSkill } from '../../api/services';
import { SectionLabel, Card, Badge, Empty, Spinner } from '../../components/ui';
import { RARITY_COLORS, rarityLabel } from '../../utils/labels';
import styles from './Skills.module.css';

export default function SkillsPage() {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const { data: skills = [], isLoading } = useQuery({
    queryKey: ['skills-search', search],
    queryFn: () => searchSkills(search, 100),
    staleTime: 30_000,
  });

  const { data: detail, isLoading: loadingDetail } = useQuery({
    queryKey: ['skill-detail', selectedId],
    queryFn: () => getSkill(selectedId),
    enabled: !!selectedId,
    staleTime: 60_000,
  });

  const skillDetail = detail?.skill;
  const clauses = detail?.conditionClauses || [];

  return (
    <div className={styles.layout}>
      {/* Left: list */}
      <div className={styles.left}>
        <div className={styles.searchWrap}>
          <input
            type="text"
            placeholder="Cari nama skill (JP atau EN)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {isLoading && <div className={styles.loading}><Spinner /></div>}

        {!isLoading && skills.length === 0 && (
          <Empty icon="🔍" message="Tidak ada skill ditemukan" />
        )}

        <div className={styles.list}>
          {skills.map((s) => (
            <button
              key={s.id}
              className={[styles.listItem, selectedId === s.id ? styles.listItemActive : ''].join(' ')}
              onClick={() => setSelectedId(s.id)}
            >
              <div className={styles.itemTop}>
                <Badge color={RARITY_COLORS[s.rarity]} bg={`${RARITY_COLORS[s.rarity]}18`}>
                  {rarityLabel(s.rarity)}
                </Badge>
                <span className={styles.itemId}>#{s.id}</span>
              </div>
              <div className={styles.itemName}>
                {s.name_en || s.name_ja || `Skill #${s.id}`}
              </div>
              {s.name_en && s.name_ja && (
                <div className={styles.itemNameJa}>{s.name_ja}</div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Right: detail */}
      <div className={styles.right}>
        <SectionLabel icon="🔬">Detail Skill</SectionLabel>

        {!selectedId && <Empty icon="👆" message="Klik skill untuk lihat detail" />}

        {loadingDetail && <div className={styles.loading}><Spinner size={28} /></div>}

        {skillDetail && !loadingDetail && (
          <div className={styles.detailContent}>
            <Card>
              <div className={styles.detailHeader}>
                <div className={styles.detailName}>
                  {skillDetail.name_en || skillDetail.name_ja}
                </div>
                {skillDetail.name_en && skillDetail.name_ja && (
                  <div className={styles.detailNameJa}>{skillDetail.name_ja}</div>
                )}
                <div className={styles.detailMeta}>
                  <Badge color={RARITY_COLORS[skillDetail.rarity]} bg={`${RARITY_COLORS[skillDetail.rarity]}18`}>
                    {rarityLabel(skillDetail.rarity)}
                  </Badge>
                  <span className={styles.detailId}>ID: {skillDetail.id}</span>
                </div>
              </div>

              {skillDetail.description_en && (
                <p className={styles.desc}>{skillDetail.description_en}</p>
              )}
              {skillDetail.description_ja && (
                <p className={styles.descJa}>{skillDetail.description_ja}</p>
              )}
            </Card>

            {/* Condition clauses */}
            {clauses.length > 0 && (
              <Card>
                <div className={styles.clauseHeader}>Activation Conditions</div>
                {groupClauses(clauses).map((group, gi) => (
                  <div key={gi} className={styles.clauseGroup}>
                    <div className={styles.clauseGroupLabel}>Group {gi + 1}</div>
                    {group.map((clause, ci) => (
                      <div key={ci} className={styles.clause}>
                        <div className={styles.clauseLabel}>
                          {ci > 0 && <span className={styles.orLabel}>OR</span>}
                          Clause {ci + 1}
                        </div>
                        <div className={styles.termList}>
                          {clause.map((term, ti) => (
                            <span key={ti} className={styles.term}>
                              <span className={styles.termVar}>{term.variable_name}</span>
                              <span className={styles.termOp}>{term.operator}</span>
                              <span className={styles.termVal}>{term.term_value}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </Card>
            )}

            {/* Raw conditions */}
            {(skillDetail.condition_1 || skillDetail.condition_2) && (
              <Card>
                <div className={styles.clauseHeader}>Raw Conditions</div>
                {skillDetail.condition_1 && (
                  <div className={styles.rawCond}>
                    <span className={styles.rawLabel}>condition_1:</span>
                    <code className={styles.rawCode}>{skillDetail.condition_1}</code>
                  </div>
                )}
                {skillDetail.condition_2 && (
                  <div className={styles.rawCond}>
                    <span className={styles.rawLabel}>condition_2:</span>
                    <code className={styles.rawCode}>{skillDetail.condition_2}</code>
                  </div>
                )}
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Group flat clause rows by group_index → clause_index → terms
function groupClauses(rows) {
  const groups = {};
  for (const row of rows) {
    if (!groups[row.group_index]) groups[row.group_index] = {};
    if (!groups[row.group_index][row.clause_index])
      groups[row.group_index][row.clause_index] = [];
    groups[row.group_index][row.clause_index].push(row);
  }
  return Object.values(groups).map((g) => Object.values(g));
}
