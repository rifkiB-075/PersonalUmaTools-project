import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { searchSkills, getSkill } from '../../api/services';
import { Card, Badge, Empty, Spinner } from '../../components/ui';
import { RARITY_COLORS, rarityLabel } from '../../utils/labels';

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
    <div className="grid h-full grid-cols-1 overflow-hidden md:grid-cols-editorial">
      {/* Left: list */}
      <div className="flex flex-col overflow-hidden border-charcoal-100 md:border-r">
        <div className="flex-shrink-0 border-b border-charcoal-100 bg-cream-50 px-4 py-4 md:px-6">
          <h2 className="font-serif text-xl font-semibold text-charcoal-800 mb-3">Daftar Skill</h2>
          <input
            type="text"
            placeholder="Cari nama skill (JP atau EN)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 md:px-6">
          {isLoading && <div className="flex justify-center py-8"><Spinner /></div>}

          {!isLoading && skills.length === 0 && (
            <Empty icon="🔍" message="Tidak ada skill ditemukan" />
          )}

          <div className="flex flex-col gap-2">
            {skills.map((s) => {
              const active = selectedId === s.id;
              return (
                <button
                  key={s.id}
                  className={[
                    'rounded-2xl border px-3.5 py-3 text-left transition-colors',
                    active ? 'border-sage-500 bg-sage-50' : 'border-charcoal-100 bg-cream-50 hover:border-charcoal-300',
                  ].join(' ')}
                  onClick={() => setSelectedId(s.id)}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <Badge color={RARITY_COLORS[s.rarity]} bg={`${RARITY_COLORS[s.rarity]}18`}>
                      {rarityLabel(s.rarity)}
                    </Badge>
                    <span className="font-mono text-[10px] text-charcoal-300">#{s.id}</span>
                  </div>
                  <div className="text-sm font-medium text-charcoal-800">
                    {s.name_en || s.name_ja || `Skill #${s.id}`}
                  </div>
                  {s.name_en && s.name_ja && (
                    <div className="mt-0.5 text-xs text-charcoal-400">{s.name_ja}</div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right: detail */}
      <div className="flex flex-col overflow-y-auto px-4 py-5 md:px-8 md:py-6">
        <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-charcoal-400">🔬 Detail Skill</div>

        {!selectedId && <Empty icon="👆" message="Klik skill untuk lihat detail" />}

        {loadingDetail && <div className="flex justify-center py-8"><Spinner size={28} /></div>}

        {skillDetail && !loadingDetail && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col gap-4"
          >
            <Card>
              <div className="mb-3">
                <div className="font-serif text-xl font-semibold text-charcoal-800">
                  {skillDetail.name_en || skillDetail.name_ja}
                </div>
                {skillDetail.name_en && skillDetail.name_ja && (
                  <div className="text-sm text-charcoal-400">{skillDetail.name_ja}</div>
                )}
                <div className="mt-2 flex items-center gap-2">
                  <Badge color={RARITY_COLORS[skillDetail.rarity]} bg={`${RARITY_COLORS[skillDetail.rarity]}18`}>
                    {rarityLabel(skillDetail.rarity)}
                  </Badge>
                  <span className="font-mono text-xs text-charcoal-300">ID: {skillDetail.id}</span>
                </div>
              </div>

              {skillDetail.description_en && (
                <p className="text-sm leading-relaxed text-charcoal-600">{skillDetail.description_en}</p>
              )}
              {skillDetail.description_ja && (
                <p className="mt-1.5 text-sm leading-relaxed text-charcoal-400">{skillDetail.description_ja}</p>
              )}
            </Card>

            {clauses.length > 0 && (
              <Card>
                <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-charcoal-500">Activation Conditions</div>
                {groupClauses(clauses).map((group, gi) => (
                  <div key={gi} className="mb-4 last:mb-0">
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-sage-600">Group {gi + 1}</div>
                    {group.map((clause, ci) => (
                      <div key={ci} className="mb-2 rounded-xl bg-cream-100 p-3 last:mb-0">
                        <div className="mb-1.5 text-xs font-medium text-charcoal-500">
                          {ci > 0 && <span className="mr-1.5 rounded bg-clay-100 px-1.5 py-0.5 text-[10px] font-semibold text-clay-600">OR</span>}
                          Clause {ci + 1}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {clause.map((term, ti) => (
                            <span key={ti} className="inline-flex items-center gap-1 rounded-lg bg-cream-50 px-2 py-1 font-mono text-[11px]">
                              <span className="text-sage-600">{term.variable_name}</span>
                              <span className="text-charcoal-300">{term.operator}</span>
                              <span className="text-charcoal-700">{term.term_value}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </Card>
            )}

            {(skillDetail.condition_1 || skillDetail.condition_2) && (
              <Card>
                <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-charcoal-500">Raw Conditions</div>
                {skillDetail.condition_1 && (
                  <div className="mb-2 flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-charcoal-400">condition_1:</span>
                    <code className="overflow-x-auto rounded-lg bg-cream-100 px-2.5 py-2 font-mono text-[11px] text-charcoal-600">{skillDetail.condition_1}</code>
                  </div>
                )}
                {skillDetail.condition_2 && (
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-charcoal-400">condition_2:</span>
                    <code className="overflow-x-auto rounded-lg bg-cream-100 px-2.5 py-2 font-mono text-[11px] text-charcoal-600">{skillDetail.condition_2}</code>
                  </div>
                )}
              </Card>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}

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
