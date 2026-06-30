import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getCharacters, getCharacter, searchSkills } from '../api/services';
import { Button, FormGroup, Spinner, Empty, Badge } from './ui';
import { STYLE_OPTIONS, APT_OPTIONS, MOOD_OPTIONS, RARITY_COLORS, rarityLabel } from '../utils/labels';
import styles from './AddTraineeForm.module.css';

const STATS = ['speed', 'stamina', 'power', 'guts', 'wisdom'];
const STAT_LABELS = { speed: 'Speed', stamina: 'Stamina', power: 'Power', guts: 'Guts', wisdom: 'Wisdom' };

const DEFAULT_STATS = {
  speed: 1200,
  stamina: 800,
  power: 900,
  guts: 600,
  wisdom: 700,
  style: 'pacechaser',
  distanceApt: 'A',
  surfaceApt: 'A',
  moodLevel: 2,
};

function cardVersion(cardId, charaId) {
  return cardId - charaId * 100;
}
function cardLabel(cardId, charaId) {
  const ver = cardVersion(cardId, charaId);
  return ver === 1 ? 'Default' : `Alt ${ver}`;
}

// editingTrainee: kalau diisi, form jadi mode edit
export default function AddTraineeForm({ editingTrainee, onSave, onCancel }) {
  const [search, setSearch] = useState('');
  const [selectedChara, setSelectedChara] = useState(
    editingTrainee
      ? { id: editingTrainee.characterId, name_en: editingTrainee.characterName }
      : null
  );
  const [selectedCardId, setSelectedCardId] = useState(editingTrainee?.cardId ?? null);
  const [label, setLabel] = useState(editingTrainee?.label ?? '');
  const [stats, setStats] = useState(editingTrainee?.stats ?? DEFAULT_STATS);
  const [skillIds, setSkillIds] = useState(editingTrainee?.skillIds ?? []);
  const [skillSearch, setSkillSearch] = useState('');

  const { data: listData, isLoading: loadingList } = useQuery({
    queryKey: ['characters', search],
    queryFn: () => getCharacters(search, 60),
    staleTime: 30_000,
  });
  const characters = listData?.characters || listData || [];

  const { data: detail } = useQuery({
    queryKey: ['character-detail', selectedChara?.id],
    queryFn: () => getCharacter(selectedChara.id),
    enabled: !!selectedChara,
    staleTime: 60_000,
  });

  const cards = detail?.cards || [];
  const cardGroups = cards.reduce((acc, c) => {
    if (!acc[c.card_id]) acc[c.card_id] = [];
    acc[c.card_id].push(c);
    return acc;
  }, {});
  const uniqueCardIds = Object.keys(cardGroups).map(Number).sort();

  // Unique skill (innate) dari card yang sedang aktif
  const activeCardId = selectedCardId ?? uniqueCardIds[0] ?? null;
  const uniqueSkills = [];
  if (activeCardId && cardGroups[activeCardId]) {
    for (const card of cardGroups[activeCardId]) {
      for (const sk of card.innate_skills || []) {
        if (!uniqueSkills.find((x) => x.skill_id === sk.skill_id)) uniqueSkills.push(sk);
      }
    }
  }

  const { data: skillListData, isLoading: loadingSkillList } = useQuery({
    queryKey: ['skills-search', skillSearch],
    queryFn: () => searchSkills(skillSearch, 60),
    staleTime: 30_000,
  });
  const generalSkills = skillListData || [];
  const uniqueSkillIdSet = new Set(uniqueSkills.map((s) => s.skill_id));
  const filteredGeneralSkills = generalSkills.filter((s) => !uniqueSkillIdSet.has(s.id));

  const toggleSkill = (id) => {
    setSkillIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  // Saat trainee baru dipilih, auto pilih card default + unique skill-nya
  useEffect(() => {
    if (!detail || editingTrainee) return;
    const defaultCard =
      cards.filter((c) => c.is_default_rarity).sort((a, b) => b.rarity - a.rarity)[0] ??
      cards.sort((a, b) => b.rarity - a.rarity)[0];
    setSelectedCardId(defaultCard?.card_id ?? null);
    if (!label) setLabel(selectedChara.name_en || selectedChara.name_ja || '');
    const initialUniqueIds = (defaultCard?.innate_skills || []).map((s) => s.skill_id);
    if (initialUniqueIds.length > 0) {
      setSkillIds((prev) => [...new Set([...prev, ...initialUniqueIds])]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.character?.id]);

  const handleStat = (key, val) => {
    const n = parseInt(val, 10);
    if (!isNaN(n)) setStats((s) => ({ ...s, [key]: n }));
  };

  const handleSelectChara = (c) => {
    setSelectedChara(c);
    setSelectedCardId(null);
    setLabel(c.name_en || c.name_ja || '');
  };

  const canSave = !!selectedChara && label.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    const trainee = {
      id: editingTrainee?.id ?? crypto.randomUUID(),
      label: label.trim(),
      characterId: selectedChara.id,
      characterName: selectedChara.name_en || selectedChara.name_ja || `Trainee #${selectedChara.id}`,
      cardId: selectedCardId,
      cardLabel: selectedCardId ? cardLabel(selectedCardId, selectedChara.id) : null,
      stats,
      skillIds,
    };
    onSave(trainee);
  };

  return (
    <div className={styles.form}>
      <FormGroup label="Nama Simpanan">
        <input
          type="text"
          placeholder="mis. Special Week (Build Speed)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </FormGroup>

      <FormGroup label="Pilih Trainee">
        {selectedChara ? (
          <div className={styles.selectedChara}>
            <img
              src={`/images/uma_icons/Game_Playable_Icon_${selectedChara.id}01.png`}
              alt=""
              className={styles.charaIcon}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
            <span>{selectedChara.name_en || selectedChara.name_ja}</span>
            <button
              type="button"
              className={styles.clearBtn}
              onClick={() => { setSelectedChara(null); setSelectedCardId(null); }}
            >
              Ganti
            </button>
          </div>
        ) : (
          <>
            <input
              type="text"
              placeholder="Cari nama trainee..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={styles.searchInput}
            />
            {loadingList ? (
              <div className={styles.centerLoader}><Spinner size={24} /></div>
            ) : characters.length === 0 ? (
              <Empty icon="🔍" message="Trainee tidak ditemukan" />
            ) : (
              <div className={styles.charaList}>
                {characters.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={styles.charaItem}
                    onClick={() => handleSelectChara(c)}
                  >
                    <img
                      src={`/images/uma_icons/Game_Playable_Icon_${c.id}01.png`}
                      alt=""
                      className={styles.charaIcon}
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                    <span>{c.name_en || c.name_ja || `#${c.id}`}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </FormGroup>

      {selectedChara && uniqueCardIds.length > 1 && (
        <FormGroup label="Versi Card">
          <div className={styles.cardVersionTabs}>
            {uniqueCardIds.map((cid) => (
              <button
                type="button"
                key={cid}
                className={[
                  styles.cardVersionTab,
                  selectedCardId === cid ? styles.cardVersionTabActive : '',
                ].join(' ')}
                onClick={() => setSelectedCardId(cid)}
              >
                {cardLabel(cid, selectedChara.id)}
              </button>
            ))}
          </div>
        </FormGroup>
      )}

      <div className={styles.statGrid}>
        {STATS.map((key) => (
          <div key={key} className={styles.statField}>
            <label>{STAT_LABELS[key]}</label>
            <input
              type="number"
              min={1}
              max={9999}
              value={stats[key]}
              onChange={(e) => handleStat(key, e.target.value)}
            />
          </div>
        ))}
      </div>

      <FormGroup label="Running Style">
        <select value={stats.style} onChange={(e) => setStats((s) => ({ ...s, style: e.target.value }))}>
          {STYLE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </FormGroup>

      <div className={styles.aptGrid}>
        <FormGroup label="Distance Apt.">
          <select value={stats.distanceApt} onChange={(e) => setStats((s) => ({ ...s, distanceApt: e.target.value }))}>
            {APT_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </FormGroup>
        <FormGroup label="Surface Apt.">
          <select value={stats.surfaceApt} onChange={(e) => setStats((s) => ({ ...s, surfaceApt: e.target.value }))}>
            {APT_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </FormGroup>
      </div>

      <FormGroup label="Mood">
        <select value={stats.moodLevel} onChange={(e) => setStats((s) => ({ ...s, moodLevel: Number(e.target.value) }))}>
          {MOOD_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </FormGroup>

      {selectedChara && (
        <FormGroup label={`Skill (${skillIds.length} dipilih)`}>
          {uniqueSkills.length > 0 && (
            <div className={styles.skillBlock}>
              <div className={styles.skillBlockLabel}>⭐ Unique Skill — {selectedChara.name_en || selectedChara.name_ja}</div>
              <div className={styles.skillGrid}>
                {uniqueSkills.map((sk) => {
                  const selected = skillIds.includes(sk.skill_id);
                  return (
                    <button
                      type="button"
                      key={sk.skill_id}
                      className={[styles.skillItem, styles.skillUnique, selected ? styles.skillSelected : ''].join(' ')}
                      onClick={() => toggleSkill(sk.skill_id)}
                    >
                      <Badge color={RARITY_COLORS[sk.rarity]} bg={`${RARITY_COLORS[sk.rarity]}18`}>
                        {rarityLabel(sk.rarity)}
                      </Badge>
                      <span className={styles.skillName}>{sk.name_en || sk.name_ja || `#${sk.skill_id}`}</span>
                      {selected && <span className={styles.checkmark}>✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <input
            type="text"
            placeholder="Cari skill lain (normal/gold)..."
            value={skillSearch}
            onChange={(e) => setSkillSearch(e.target.value)}
            className={styles.searchInput}
          />
          {loadingSkillList ? (
            <div className={styles.centerLoader}><Spinner size={20} /></div>
          ) : filteredGeneralSkills.length === 0 ? (
            <Empty icon="🔍" message="Tidak ada skill yang cocok" />
          ) : (
            <div className={styles.skillGrid}>
              {filteredGeneralSkills.map((sk) => {
                const selected = skillIds.includes(sk.id);
                return (
                  <button
                    type="button"
                    key={sk.id}
                    className={[styles.skillItem, selected ? styles.skillSelected : ''].join(' ')}
                    onClick={() => toggleSkill(sk.id)}
                  >
                    <Badge color={RARITY_COLORS[sk.rarity]} bg={`${RARITY_COLORS[sk.rarity]}18`}>
                      {rarityLabel(sk.rarity)}
                    </Badge>
                    <span className={styles.skillName}>{sk.name_en || sk.name_ja || `#${sk.id}`}</span>
                    {selected && <span className={styles.checkmark}>✓</span>}
                  </button>
                );
              })}
            </div>
          )}
        </FormGroup>
      )}

      <div className={styles.formActions}>
        <Button variant="ghost" type="button" onClick={onCancel}>Batal</Button>
        <Button variant="primary" type="button" disabled={!canSave} onClick={handleSave}>
          💾 Simpan Trainee
        </Button>
      </div>
    </div>
  );
}
