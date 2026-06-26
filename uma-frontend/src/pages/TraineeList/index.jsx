import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getCharacters, getCharacter } from '../../api/services';
import { SectionLabel, Card, Badge, Empty, Spinner } from '../../components/ui';
import { RARITY_COLORS, rarityLabel } from '../../utils/labels';
import styles from './TraineeList.module.css';

// Apt rank → warna
const APT_COLOR = {
  S: 'var(--accent)',
  A: '#a8cc8c',
  B: '#5b9bd5',
  C: 'var(--text)',
  D: 'var(--text2)',
  E: 'var(--text3)',
  F: 'var(--text3)',
  G: '#444860',
};

function AptBadge({ rank }) {
  return (
    <span className={styles.aptBadge} style={{ color: APT_COLOR[rank] || 'var(--text3)' }}>
      {rank}
    </span>
  );
}

function StatBar({ label, value, max = 1200 }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className={styles.statRow}>
      <span className={styles.statLabel}>{label}</span>
      <div className={styles.statBarWrap}>
        <div className={styles.statBarFill} style={{ width: `${pct}%` }} />
      </div>
      <span className={styles.statVal}>{value}</span>
    </div>
  );
}

// Pilih card default (is_default_rarity = true dan rarity tertinggi)
function pickDefaultCard(cards) {
  if (!cards || cards.length === 0) return null;
  const defaults = cards.filter(c => c.is_default_rarity);
  if (defaults.length === 0) return cards[cards.length - 1];
  return defaults.reduce((best, c) => (c.rarity > best.rarity ? c : best), defaults[0]);
}

// Format tanggal lahir
function formatBirthday(year, month, day) {
  if (!month && !day) return '—';
  return `${String(month).padStart(2,'0')}/${String(day).padStart(2,'0')}/${year || '?'}`;
}

export default function TraineeListPage() {
  const [search, setSearch]       = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [activeCard, setActiveCard] = useState(null); // card_id yang dipilih di panel detail

  // ── List karakter ──
  const { data, isLoading } = useQuery({
    queryKey: ['characters', search],
    queryFn:  () => getCharacters(search, 150),
    staleTime: 60_000,
  });
  const characters = data?.characters || [];

  // ── Detail karakter ──
  const { data: detail, isLoading: loadingDetail } = useQuery({
    queryKey: ['character-detail', selectedId],
    queryFn:  () => getCharacter(selectedId),
    enabled:  !!selectedId,
    staleTime: 120_000,
  });

  const chara = detail?.character;
  const cards = detail?.cards || [];

  // Ketika detail baru dimuat, reset activeCard ke default
  const defaultCard = pickDefaultCard(cards);
  const selectedCard = cards.find(c =>
    c.card_id === (activeCard?.card_id) && c.rarity === (activeCard?.rarity)
  ) || defaultCard;

  // Pilih karakter → reset panel card
  function selectCharacter(id) {
    setSelectedId(id);
    setActiveCard(null);
  }

  // Group card by card_id (tiap card_id punya 3 rarity)
  const cardGroups = cards.reduce((acc, c) => {
    if (!acc[c.card_id]) acc[c.card_id] = [];
    acc[c.card_id].push(c);
    return acc;
  }, {});

  return (
    <div className={styles.layout}>

      {/* ── Kolom kiri: search + list ── */}
      <div className={styles.left}>
        <div className={styles.searchWrap}>
          <input
            type="text"
            placeholder="Cari nama trainee (JP atau EN)..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {isLoading && <div className={styles.loading}><Spinner /></div>}

        {!isLoading && characters.length === 0 && (
          <Empty icon="🐴" message="Tidak ada trainee ditemukan" />
        )}

        <div className={styles.list}>
          {characters.map(c => (
            <button
              key={c.id}
              className={[styles.listItem, selectedId === c.id ? styles.listItemActive : ''].join(' ')}
              onClick={() => selectCharacter(c.id)}
            >
              {/* Warna strip dari image_color_main */}
              <span
                className={styles.colorStrip}
                style={{ background: `#${c.image_color_main || '888'}` }}
              />
              <div className={styles.listItemContent}>
                <div className={styles.itemName}>
                  {c.name_en || c.name_ja || `Trainee #${c.id}`}
                </div>
                {c.name_en && c.name_ja && (
                  <div className={styles.itemNameJa}>{c.name_ja}</div>
                )}
                <div className={styles.itemMeta}>
                  <span className={styles.itemId}>#{c.id}</span>
                  {c.birth_month && (
                    <span className={styles.itemBirth}>
                      🎂 {String(c.birth_month).padStart(2,'0')}/{String(c.birth_day).padStart(2,'0')}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Kolom kanan: detail ── */}
      <div className={styles.right}>
        <SectionLabel icon="🐎">Detail Trainee</SectionLabel>

        {!selectedId && <Empty icon="👆" message="Klik trainee untuk lihat detail" />}
        {loadingDetail && <div className={styles.loading}><Spinner size={28} /></div>}

        {chara && !loadingDetail && (
          <div className={styles.detailContent}>

            {/* ── Header karakter ── */}
            <Card>
              <div className={styles.charaHeader}>
                <div
                  className={styles.charaColorDot}
                  style={{ background: `#${chara.image_color_main || '888'}` }}
                />
                <div>
                  <div className={styles.charaName}>
                    {chara.name_en || chara.name_ja}
                  </div>
                  {chara.name_en && chara.name_ja && (
                    <div className={styles.charaNameJa}>{chara.name_ja}</div>
                  )}
                </div>
              </div>
              <div className={styles.charaMeta}>
                <span>#{chara.id}</span>
                <span>🎂 {formatBirthday(chara.birth_year, chara.birth_month, chara.birth_day)}</span>
                {chara.height && <span>📏 {chara.height} cm</span>}
                {chara.sex && <span>{chara.sex === 1 ? '♀' : '♂'}</span>}
              </div>
            </Card>

            {/* ── Tab pilih card_id ── */}
            {Object.keys(cardGroups).length > 1 && (
              <div className={styles.cardTabs}>
                {Object.keys(cardGroups).map(cid => {
                  const group = cardGroups[cid];
                  const isActive = selectedCard && String(selectedCard.card_id) === cid;
                  return (
                    <button
                      key={cid}
                      className={[styles.cardTab, isActive ? styles.cardTabActive : ''].join(' ')}
                      onClick={() => setActiveCard({ card_id: Number(cid), rarity: group[group.length - 1].rarity })}
                    >
                      Card {cid}
                    </button>
                  );
                })}
              </div>
            )}

            {/* ── Tab pilih rarity di dalam card yang dipilih ── */}
            {selectedCard && (
              <>
                <div className={styles.rarityTabs}>
                  {(cardGroups[selectedCard.card_id] || []).map(c => (
                    <button
                      key={c.rarity}
                      className={[
                        styles.rarityTab,
                        selectedCard.rarity === c.rarity ? styles.rarityTabActive : '',
                      ].join(' ')}
                      onClick={() => setActiveCard({ card_id: c.card_id, rarity: c.rarity })}
                    >
                      {c.rarity === 3 ? 'R' : c.rarity === 4 ? 'SR' : 'SSR'}
                      {c.is_default_rarity ? ' ★' : ''}
                    </button>
                  ))}
                </div>

                {/* Stats */}
                <Card>
                  <div className={styles.cardSectionTitle}>Base Stats</div>
                  <div className={styles.statsGrid}>
                    <StatBar label="Speed"   value={selectedCard.speed}   />
                    <StatBar label="Stamina" value={selectedCard.stamina} />
                    <StatBar label="Power"   value={selectedCard.power}   />
                    <StatBar label="Guts"    value={selectedCard.guts}    />
                    <StatBar label="Wit"     value={selectedCard.wit}     />
                  </div>
                  <div className={styles.maxStatsNote}>
                    Max: {selectedCard.speed_max} / {selectedCard.stamina_max} / {selectedCard.power_max} / {selectedCard.guts_max} / {selectedCard.wit_max}
                  </div>
                </Card>

                {/* Aptitudes */}
                <Card>
                  <div className={styles.cardSectionTitle}>Aptitudes</div>
                  <div className={styles.aptGrid}>
                    <div className={styles.aptGroup}>
                      <div className={styles.aptGroupLabel}>Surface</div>
                      <div className={styles.aptRow}>
                        <span className={styles.aptKey}>Turf</span>
                        <AptBadge rank={selectedCard.apt_turf} />
                        <span className={styles.aptKey}>Dirt</span>
                        <AptBadge rank={selectedCard.apt_dirt} />
                      </div>
                    </div>
                    <div className={styles.aptGroup}>
                      <div className={styles.aptGroupLabel}>Distance</div>
                      <div className={styles.aptRow}>
                        <span className={styles.aptKey}>Short</span>
                        <AptBadge rank={selectedCard.apt_short} />
                        <span className={styles.aptKey}>Mile</span>
                        <AptBadge rank={selectedCard.apt_mile} />
                        <span className={styles.aptKey}>Middle</span>
                        <AptBadge rank={selectedCard.apt_middle} />
                        <span className={styles.aptKey}>Long</span>
                        <AptBadge rank={selectedCard.apt_long} />
                      </div>
                    </div>
                    <div className={styles.aptGroup}>
                      <div className={styles.aptGroupLabel}>Running Style</div>
                      <div className={styles.aptRow}>
                        <span className={styles.aptKey}>逃げ</span>
                        <AptBadge rank={selectedCard.apt_nige} />
                        <span className={styles.aptKey}>先行</span>
                        <AptBadge rank={selectedCard.apt_senko} />
                        <span className={styles.aptKey}>差し</span>
                        <AptBadge rank={selectedCard.apt_sashi} />
                        <span className={styles.aptKey}>追込</span>
                        <AptBadge rank={selectedCard.apt_oikomi} />
                      </div>
                    </div>
                  </div>
                </Card>

                {/* Innate Skills */}
                {selectedCard.innate_skills && selectedCard.innate_skills.length > 0 && (
                  <Card>
                    <div className={styles.cardSectionTitle}>Innate Skills</div>
                    <div className={styles.skillList}>
                      {selectedCard.innate_skills.map(sk => (
                        <div key={sk.skill_id} className={styles.skillItem}>
                          <div className={styles.skillTop}>
                            <Badge
                              color={RARITY_COLORS[sk.rarity]}
                              bg={`${RARITY_COLORS[sk.rarity]}18`}
                            >
                              {rarityLabel(sk.rarity)}
                            </Badge>
                            <span className={styles.skillLv}>Lv.{sk.skill_level}</span>
                            <span className={styles.skillId}>#{sk.skill_id}</span>
                          </div>
                          <div className={styles.skillName}>
                            {sk.name_en || sk.name_ja || `Skill #${sk.skill_id}`}
                          </div>
                          {sk.name_en && sk.name_ja && (
                            <div className={styles.skillNameJa}>{sk.name_ja}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
