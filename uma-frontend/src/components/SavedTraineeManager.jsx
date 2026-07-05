import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '../store/appStore';
import { SectionLabel, Empty, Button } from './ui';
import AddTraineeForm from './AddTraineeForm';

// mode "manage": tampilkan semua trainee + tombol tambah/edit/hapus (tanpa perlu pilih track dulu)
// selectable=true: item bisa diklik untuk dipilih sebagai peserta race (multi-select / checkbox)
export default function SavedTraineeManager({ mode = 'manage', selectable = false }) {
  const {
    savedTrainees, addSavedTrainee, updateSavedTrainee, removeSavedTrainee,
    selectedSavedTraineeIds, toggleSelectedSavedTrainee,
  } = useAppStore();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');

  const editingTrainee = editingId ? savedTrainees.find((t) => t.id === editingId) : null;

  const filteredTrainees = savedTrainees.filter((t) =>
    t.label.toLowerCase().includes(search.trim().toLowerCase())
  );

  const handleSave = (trainee) => {
    if (editingId) {
      updateSavedTrainee(editingId, trainee);
    } else {
      addSavedTrainee(trainee);
    }
    setShowForm(false);
    setEditingId(null);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
  };

  const handleEdit = (id) => {
    setEditingId(id);
    setShowForm(true);
  };

  const handleAddNew = () => {
    setEditingId(null);
    setShowForm(true);
  };

  return (
    <div className="mb-2">
      <div className="mb-1 flex items-center justify-between">
        <SectionLabel icon="🐴">
          {mode === 'pick'
            ? `Pilih Peserta Race${selectedSavedTraineeIds.length > 0 ? ` (${selectedSavedTraineeIds.length} dipilih)` : ''}`
            : 'Trainee Tersimpan'}
        </SectionLabel>
        {!showForm && (
          <Button variant="secondary" size="sm" onClick={handleAddNew}>+ Tambah Trainee</Button>
        )}
      </div>

      {mode === 'pick' && !showForm && (
        <p className="mb-3 -mt-1 text-xs text-charcoal-400">Centang minimal 2 trainee supaya terasa seperti race sungguhan.</p>
      )}

      {!showForm && savedTrainees.length > 0 && (
        <input
          type="text"
          placeholder="Cari nama simpanan..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-3"
        />
      )}

      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mb-2 rounded-2xl border border-charcoal-100 bg-cream-50 p-4">
              <AddTraineeForm
                editingTrainee={editingTrainee}
                onSave={handleSave}
                onCancel={handleCancel}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!showForm && savedTrainees.length === 0 && (
        <Empty icon="🐴" message="Belum ada trainee tersimpan. Klik 'Tambah Trainee' untuk membuat." />
      )}

      {!showForm && savedTrainees.length > 0 && filteredTrainees.length === 0 && (
        <Empty icon="🔍" message={`Tidak ada trainee dengan nama "${search}"`} />
      )}

      {!showForm && filteredTrainees.length > 0 && (
        <div className="flex flex-col gap-2">
          {filteredTrainees.map((t) => {
            const isActive = selectedSavedTraineeIds.includes(t.id);
            const skillCount = t.skillIds?.length ?? 0;
            return (
              <div
                key={t.id}
                className={[
                  'flex items-center gap-3 rounded-2xl border px-3.5 py-2.5 transition-colors',
                  isActive && selectable
                    ? 'border-sage-500 bg-sage-50 cursor-pointer'
                    : selectable
                    ? 'border-charcoal-100 bg-cream-50 cursor-pointer hover:border-charcoal-300'
                    : 'border-charcoal-100 bg-cream-50',
                ].join(' ')}
                onClick={() => selectable && toggleSelectedSavedTrainee(t.id)}
                role={selectable ? 'button' : undefined}
              >
                {selectable && (
                  <input
                    type="checkbox"
                    checked={isActive}
                    readOnly
                    className="h-4 w-4 flex-shrink-0 accent-sage-600"
                  />
                )}
                <img
                  src={`/images/uma_icons/Game_Playable_Icon_${t.characterId}01.png`}
                  alt=""
                  className="h-9 w-9 flex-shrink-0 rounded-full object-cover"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-charcoal-800">{t.label}</div>
                  <div className="truncate text-xs text-charcoal-400">
                    {t.characterName}
                    {t.cardLabel ? ` · ${t.cardLabel}` : ''}
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[10px] text-charcoal-300">
                    SPD {t.stats.speed} · STA {t.stats.stamina} · PWR {t.stats.power} · GUT {t.stats.guts} · WIT {t.stats.wisdom}
                  </div>
                  <div className="mt-0.5 text-[10px] text-charcoal-400">
                    🎯 {skillCount > 0 ? `${skillCount} skill` : 'Belum ada skill'}
                  </div>
                </div>
                <div className="flex flex-shrink-0 gap-1" onClick={(e) => e.stopPropagation()}>
                  <button className="rounded-lg p-1.5 text-charcoal-400 hover:bg-charcoal-100 hover:text-charcoal-700" title="Edit" onClick={() => handleEdit(t.id)}>✏️</button>
                  <button className="rounded-lg p-1.5 text-charcoal-400 hover:bg-clay-50 hover:text-clay-500" title="Hapus" onClick={() => removeSavedTrainee(t.id)}>🗑️</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
