import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { getCharacters, getCharacter } from '../../api/services';
import { Card, Badge, Empty, Spinner } from '../../components/ui';
import { RARITY_COLORS, rarityLabel } from '../../utils/labels';

const APT_COLOR = {
  S: 'var(--accent)',
  A: '#8ba87a',
  B: '#5b7f9b',
  C: 'var(--text)',
  D: 'var(--text2)',
  E: 'var(--text3)',
  F: 'var(--text3)',
  G: '#c9c3b6',
};

function AptBadge({ rank }) {
  return (
    <span className="font-mono text-xs font-semibold" style={{ color: APT_COLOR[rank] || 'var(--text3)' }}>
      {rank}
    </span>
  );
}

function StatBar({ label, value, max = 1200 }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="mb-2.5 flex items-center gap-3 last:mb-0">
      <span className="w-16 flex-shrink-0 text-xs font-medium text-charcoal-500">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-charcoal-100">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="h-full rounded-full bg-sage-500"
        />
      </div>
      <span className="w-10 flex-shrink-0 text-right font-mono text-xs text-charcoal-600">{value}</span>
    </div>
  );
}

function pickDefaultCard(cards) {
  if (!cards || cards.length === 0) return null;
  const defaults = cards.filter(c => c.is_default_rarity);
  if (defaults.length === 0) return cards[cards.length - 1];
  return defaults.reduce((best, c) => (c.rarity > best.rarity ? c : best), defaults[0]);
}

function formatBirthday(year, month, day) {
  if (!month && !day) return '—';
  return `${String(month).padStart(2,'0')}/${String(day).padStart(2,'0')}/${year || '?'}`;
}

export default function TraineeListPage() {
  const [search, setSearch]       = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [activeCard, setActiveCard] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['characters', search],
    queryFn:  () => getCharacters(search, 150),
    staleTime: 60_000,
  });
  const characters = data?.characters || [];

  const { data: detail, isLoading: loadingDetail } = useQuery({
    queryKey: ['character-detail', selectedId],
    queryFn:  () => getCharacter(selectedId),
    enabled:  !!selectedId,
    staleTime: 120_000,
  });

  const chara = detail?.character;
  const cards = detail?.cards || [];

  const defaultCard = pickDefaultCard(cards);
  const selectedCard = cards.find(c =>
    c.card_id === (activeCard?.card_id) && c.rarity === (activeCard?.rarity)
  ) || defaultCard;

  function selectCharacter(id) {
    setSelectedId(id);
    setActiveCard(null);
  }

  const cardGroups = cards.reduce((acc, c) => {
    if (!acc[c.card_id]) acc[c.card_id] = [];
    acc[c.card_id].push(c);
    return acc;
  }, {});

  return (
    <div className="grid h-full grid-cols-1 overflow-hidden md:grid-cols-editorial">
      {/* Left: search + list */}
      <div className="flex flex-col overflow-hidden border-charcoal-100 md:border-r">
        <div className="flex-shrink-0 border-b border-charcoal-100 bg-cream-50 px-4 py-4 md:px-6">
          <h2 className="font-serif text-xl font-semibold text-charcoal-800 mb-3">Trainee List</h2>
          <input
            type="text"
            placeholder="Cari nama trainee (JP atau EN)..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 md:px-6">
          {isLoading && <div className="flex justify-center py-8"><Spinner /></div>}

          {!isLoading && characters.length === 0 && (
            <Empty icon="🐴" message="Tidak ada trainee ditemukan" />
          )}

          <div className="flex flex-col gap-2">
            {characters.map(c => {
              const raceImg = c.name_en
                ? `/images/uma_race/${c.name_en.replace(/ /g, '_')}_(Race).png`
                : null;
              const active = selectedId === c.id;
              return (
                <button
                  key={c.id}
                  className={[
                    'relative flex items-center gap-3 overflow-hidden rounded-2xl border pl-4 pr-3 py-2.5 text-left transition-colors',
                    active ? 'border-sage-500 bg-sage-50' : 'border-charcoal-100 bg-cream-50 hover:border-charcoal-300',
                  ].join(' ')}
                  onClick={() => selectCharacter(c.id)}
                >
                  <span
                    className="absolute left-0 top-0 h-full w-1"
                    style={{ background: `#${c.image_color_main || '888'}` }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-charcoal-800">
                      {c.name_en || c.name_ja || `Trainee #${c.id}`}
                    </div>
                    {c.name_en && c.name_ja && (
                      <div className="truncate text-xs text-charcoal-400">{c.name_ja}</div>
                    )}
                    <div className="mt-0.5 flex items-center gap-2 font-mono text-[10px] text-charcoal-300">
                      <span>#{c.id}</span>
                      {c.birth_month && (
                        <span>🎂 {String(c.birth_month).padStart(2,'0')}/{String(c.birth_day).padStart(2,'0')}</span>
                      )}
                    </div>
                  </div>
                  {raceImg && (
                    <img
                      src={raceImg}
                      alt=""
                      className="h-10 w-14 flex-shrink-0 rounded-lg object-cover"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right: detail */}
      <div className="flex flex-col overflow-y-auto px-4 py-5 md:px-8 md:py-6">
        <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-charcoal-400">🐎 Detail Trainee</div>

        {!selectedId && <Empty icon="👆" message="Klik trainee untuk lihat detail" />}
        {loadingDetail && <div className="flex justify-center py-8"><Spinner size={28} /></div>}

        {chara && !loadingDetail && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col gap-4"
          >
            <Card>
              <div className="flex items-center gap-3">
                <img
                  src={`/images/uma_icons/Game_Playable_Icon_${chara.id}01.png`}
                  alt=""
                  className="h-14 w-14 rounded-full object-cover"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
                <div>
                  <div className="font-serif text-xl font-semibold text-charcoal-800">
                    {chara.name_en || chara.name_ja}
                  </div>
                  {chara.name_en && chara.name_ja && (
                    <div className="text-sm text-charcoal-400">{chara.name_ja}</div>
                  )}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-charcoal-400">
                <span>#{chara.id}</span>
                <span>🎂 {formatBirthday(chara.birth_year, chara.birth_month, chara.birth_day)}</span>
                {chara.height && <span>📏 {chara.height} cm</span>}
                {chara.sex && <span>{chara.sex === 1 ? '♀' : '♂'}</span>}
              </div>
            </Card>

            {Object.keys(cardGroups).length > 1 && (
              <div className="flex flex-wrap gap-2">
                {Object.keys(cardGroups).map(cid => {
                  const group = cardGroups[cid];
                  const isActive = selectedCard && String(selectedCard.card_id) === cid;
                  return (
                    <button
                      key={cid}
                      className={[
                        'rounded-2xl border px-3 py-1.5 text-xs font-medium transition-colors',
                        isActive ? 'border-sage-500 bg-sage-50 text-sage-700' : 'border-charcoal-200 text-charcoal-500 hover:border-charcoal-400',
                      ].join(' ')}
                      onClick={() => setActiveCard({ card_id: Number(cid), rarity: group[group.length - 1].rarity })}
                    >
                      Card {cid}
                    </button>
                  );
                })}
              </div>
            )}

            {selectedCard && (
              <>
                <div className="flex flex-wrap gap-2">
                  {(cardGroups[selectedCard.card_id] || []).map(c => (
                    <button
                      key={c.rarity}
                      className={[
                        'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                        selectedCard.rarity === c.rarity
                          ? 'border-gold-500 bg-gold-100/50 text-gold-700'
                          : 'border-charcoal-200 text-charcoal-400 hover:border-charcoal-400',
                      ].join(' ')}
                      onClick={() => setActiveCard({ card_id: c.card_id, rarity: c.rarity })}
                    >
                      {c.rarity === 3 ? 'R' : c.rarity === 4 ? 'SR' : 'SSR'}
                      {c.is_default_rarity ? ' ★' : ''}
                    </button>
                  ))}
                </div>

                <Card>
                  <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-charcoal-500">Base Stats</div>
                  <StatBar label="Speed"   value={selectedCard.speed}   />
                  <StatBar label="Stamina" value={selectedCard.stamina} />
                  <StatBar label="Power"   value={selectedCard.power}   />
                  <StatBar label="Guts"    value={selectedCard.guts}    />
                  <StatBar label="Wit"     value={selectedCard.wit}     />
                  <div className="mt-3 text-[11px] text-charcoal-300">
                    Max: {selectedCard.speed_max} / {selectedCard.stamina_max} / {selectedCard.power_max} / {selectedCard.guts_max} / {selectedCard.wit_max}
                  </div>
                </Card>

                <Card>
                  <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-charcoal-500">Aptitudes</div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div>
                      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-charcoal-300">Surface</div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        <span className="text-charcoal-400">Turf</span><AptBadge rank={selectedCard.apt_turf} />
                        <span className="text-charcoal-400">Dirt</span><AptBadge rank={selectedCard.apt_dirt} />
                      </div>
                    </div>
                    <div>
                      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-charcoal-300">Distance</div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        <span className="text-charcoal-400">Short</span><AptBadge rank={selectedCard.apt_short} />
                        <span className="text-charcoal-400">Mile</span><AptBadge rank={selectedCard.apt_mile} />
                        <span className="text-charcoal-400">Middle</span><AptBadge rank={selectedCard.apt_middle} />
                        <span className="text-charcoal-400">Long</span><AptBadge rank={selectedCard.apt_long} />
                      </div>
                    </div>
                    <div>
                      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-charcoal-300">Running Style</div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        <span className="text-charcoal-400">逃げ</span><AptBadge rank={selectedCard.apt_nige} />
                        <span className="text-charcoal-400">先行</span><AptBadge rank={selectedCard.apt_senko} />
                        <span className="text-charcoal-400">差し</span><AptBadge rank={selectedCard.apt_sashi} />
                        <span className="text-charcoal-400">追込</span><AptBadge rank={selectedCard.apt_oikomi} />
                      </div>
                    </div>
                  </div>
                </Card>

                {selectedCard.innate_skills && selectedCard.innate_skills.length > 0 && (
                  <Card>
                    <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-charcoal-500">Innate Skills</div>
                    <div className="flex flex-col gap-2.5">
                      {selectedCard.innate_skills.map(sk => (
                        <div key={sk.skill_id} className="rounded-xl bg-cream-100 p-3">
                          <div className="mb-1 flex items-center gap-2">
                            <Badge color={RARITY_COLORS[sk.rarity]} bg={`${RARITY_COLORS[sk.rarity]}18`}>
                              {rarityLabel(sk.rarity)}
                            </Badge>
                            <span className="font-mono text-[10px] text-charcoal-400">Lv.{sk.skill_level}</span>
                            <span className="ml-auto font-mono text-[10px] text-charcoal-300">#{sk.skill_id}</span>
                          </div>
                          <div className="text-sm font-medium text-charcoal-800">
                            {sk.name_en || sk.name_ja || `Skill #${sk.skill_id}`}
                          </div>
                          {sk.name_en && sk.name_ja && (
                            <div className="text-xs text-charcoal-400">{sk.name_ja}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
