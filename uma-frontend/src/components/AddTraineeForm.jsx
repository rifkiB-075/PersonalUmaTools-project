import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getCharacters, getCharacter, searchSkills } from '../api/services';
import { Button, FormGroup, Spinner, Empty, Badge } from './ui';
import { STYLE_OPTIONS, APT_OPTIONS, MOOD_OPTIONS, RARITY_COLORS, rarityLabel } from '../utils/labels';

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

  // Melacak skill_id unique yang di-auto-select untuk versi card yang sedang aktif,
  // supaya waktu ganti versi (Default <-> Alt) skill unique versi lama ikut dilepas,
  // bukan nyangkut terus di skillIds.
  const autoSelectedIdsRef = useRef(new Set());
  const prevCardIdRef = useRef(undefined);

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

  useEffect(() => {
    if (!detail || editingTrainee) return;
    const defaultCard =
      cards.filter((c) => c.is_default_rarity).sort((a, b) => b.rarity - a.rarity)[0] ??
      cards.sort((a, b) => b.rarity - a.rarity)[0];
    setSelectedCardId(defaultCard?.card_id ?? null);
    if (!label) setLabel(selectedChara.name_en || selectedChara.name_ja || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.character?.id]);

  // Sinkronkan skillIds tiap kali versi card aktif berubah (termasuk waktu
  // pertama kali dipilih). Skill unique milik versi SEBELUMNYA dilepas dulu,
  // baru skill unique versi yang baru dipasang — jadi unique skill dari versi
  // Alt tidak nyangkut waktu pindah ke Default (atau sebaliknya).
  useEffect(() => {
    if (!activeCardId || !cardGroups[activeCardId]) return;

    const newUniqueIds = [];
    for (const card of cardGroups[activeCardId]) {
      for (const sk of card.innate_skills || []) {
        if (!newUniqueIds.includes(sk.skill_id)) newUniqueIds.push(sk.skill_id);
      }
    }

    const isFirstRun = prevCardIdRef.current === undefined;
    prevCardIdRef.current = activeCardId;

    if (isFirstRun) {
      // Mode edit: jangan ubah skillIds yang sudah tersimpan, cukup catat
      // mana yang kebetulan sudah cocok dengan unique skill versi ini,
      // supaya bisa dilepas dengan benar kalau nanti versi diganti.
      // Mode tambah baru: auto-select unique skill versi default.
      if (editingTrainee) {
        autoSelectedIdsRef.current = new Set(newUniqueIds.filter((id) => skillIds.includes(id)));
      } else if (newUniqueIds.length > 0) {
        setSkillIds((prev) => [...new Set([...prev, ...newUniqueIds])]);
        autoSelectedIdsRef.current = new Set(newUniqueIds);
      }
      return;
    }

    setSkillIds((prev) => {
      const withoutOldVersion = prev.filter((id) => !autoSelectedIdsRef.current.has(id));
      return [...new Set([...withoutOldVersion, ...newUniqueIds])];
    });
    autoSelectedIdsRef.current = new Set(newUniqueIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCardId]);

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

  const skillBtnCls = (selected, unique) =>
    [
      'flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs transition-colors',
      selected
        ? unique ? 'border-gold-500 bg-gold-100/40' : 'border-sage-500 bg-sage-50'
        : 'border-charcoal-100 bg-cream-50 hover:border-charcoal-300',
    ].join(' ');

  return (
    <div>
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
          <div className="flex items-center gap-2.5 rounded-2xl border border-sage-200 bg-sage-50 px-3.5 py-2.5">
            <img
              src={`/images/uma_icons/Game_Playable_Icon_${selectedChara.id}01.png`}
              alt=""
              className="h-7 w-7 rounded-full object-cover"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
            <span className="text-sm font-medium text-sage-700">{selectedChara.name_en || selectedChara.name_ja}</span>
            <button
              type="button"
              className="ml-auto text-xs font-medium text-charcoal-400 hover:text-charcoal-700"
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
              className="mb-2"
            />
            {loadingList ? (
              <div className="flex justify-center py-4"><Spinner size={24} /></div>
            ) : characters.length === 0 ? (
              <Empty icon="🔍" message="Trainee tidak ditemukan" />
            ) : (
              <div className="grid max-h-56 grid-cols-2 gap-1.5 overflow-y-auto sm:grid-cols-3">
                {characters.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="flex items-center gap-2 rounded-xl border border-charcoal-100 bg-cream-50 px-2 py-1.5 text-left text-xs hover:border-charcoal-300"
                    onClick={() => handleSelectChara(c)}
                  >
                    <img
                      src={`/images/uma_icons/Game_Playable_Icon_${c.id}01.png`}
                      alt=""
                      className="h-5 w-5 flex-shrink-0 rounded-full object-cover"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                    <span className="truncate">{c.name_en || c.name_ja || `#${c.id}`}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </FormGroup>

      {selectedChara && uniqueCardIds.length > 1 && (
        <FormGroup label="Versi Card">
          <div className="flex flex-wrap gap-2">
            {uniqueCardIds.map((cid) => (
              <button
                type="button"
                key={cid}
                className={[
                  'rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors',
                  selectedCardId === cid ? 'border-sage-500 bg-sage-50 text-sage-700' : 'border-charcoal-200 text-charcoal-500 hover:border-charcoal-400',
                ].join(' ')}
                onClick={() => setSelectedCardId(cid)}
              >
                {cardLabel(cid, selectedChara.id)}
              </button>
            ))}
          </div>
        </FormGroup>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {STATS.map((key) => (
          <div key={key}>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-charcoal-400">{STAT_LABELS[key]}</label>
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

      <div className="mb-4 grid grid-cols-2 gap-3">
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
            <div className="mb-3">
              <div className="mb-1.5 text-xs font-semibold text-gold-700">⭐ Unique Skill — {selectedChara.name_en || selectedChara.name_ja}</div>
              <div className="flex flex-wrap gap-1.5">
                {uniqueSkills.map((sk) => {
                  const selected = skillIds.includes(sk.skill_id);
                  return (
                    <button
                      type="button"
                      key={sk.skill_id}
                      className={skillBtnCls(selected, true)}
                      onClick={() => toggleSkill(sk.skill_id)}
                    >
                      <Badge color={RARITY_COLORS[sk.rarity]} bg={`${RARITY_COLORS[sk.rarity]}18`}>
                        {rarityLabel(sk.rarity)}
                      </Badge>
                      <span>{sk.name_en || sk.name_ja || `#${sk.skill_id}`}</span>
                      {selected && <span className="text-sage-600">✓</span>}
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
            className="mb-2"
          />
          {loadingSkillList ? (
            <div className="flex justify-center py-3"><Spinner size={20} /></div>
          ) : filteredGeneralSkills.length === 0 ? (
            <Empty icon="🔍" message="Tidak ada skill yang cocok" />
          ) : (
            <div className="flex max-h-56 flex-wrap gap-1.5 overflow-y-auto">
              {filteredGeneralSkills.map((sk) => {
                const selected = skillIds.includes(sk.id);
                return (
                  <button
                    type="button"
                    key={sk.id}
                    className={skillBtnCls(selected, false)}
                    onClick={() => toggleSkill(sk.id)}
                  >
                    <Badge color={RARITY_COLORS[sk.rarity]} bg={`${RARITY_COLORS[sk.rarity]}18`}>
                      {rarityLabel(sk.rarity)}
                    </Badge>
                    <span>{sk.name_en || sk.name_ja || `#${sk.id}`}</span>
                    {selected && <span className="text-sage-600">✓</span>}
                  </button>
                );
              })}
            </div>
          )}
        </FormGroup>
      )}

      <div className="mt-5 flex justify-end gap-3">
        <Button variant="ghost" type="button" onClick={onCancel}>Batal</Button>
        <Button variant="primary" type="button" disabled={!canSave} onClick={handleSave}>
          💾 Simpan Trainee
        </Button>
      </div>
    </div>
  );
}
