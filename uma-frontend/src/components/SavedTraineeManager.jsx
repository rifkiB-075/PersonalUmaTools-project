import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { SectionLabel, Empty } from './ui';
import AddTraineeForm from './AddTraineeForm';
import styles from './SavedTraineeManager.module.css';

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
    <div className={styles.wrap}>
      <div className={styles.header}>
        <SectionLabel icon="🐴">
          {mode === 'pick'
            ? `Pilih Peserta Race${selectedSavedTraineeIds.length > 0 ? ` (${selectedSavedTraineeIds.length} dipilih)` : ''}`
            : 'Trainee Tersimpan'}
        </SectionLabel>
        {!showForm && (
          <button className={styles.addBtn} onClick={handleAddNew}>+ Tambah Trainee</button>
        )}
      </div>

      {mode === 'pick' && !showForm && (
        <p className={styles.hint}>Centang minimal 2 trainee supaya terasa seperti race sungguhan.</p>
      )}

      {!showForm && savedTrainees.length > 0 && (
        <input
          type="text"
          placeholder="Cari nama simpanan..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={styles.searchInput}
        />
      )}

      {showForm && (
        <div className={styles.formWrap}>
          <AddTraineeForm
            editingTrainee={editingTrainee}
            onSave={handleSave}
            onCancel={handleCancel}
          />
        </div>
      )}

      {!showForm && savedTrainees.length === 0 && (
        <Empty icon="🐴" message="Belum ada trainee tersimpan. Klik 'Tambah Trainee' untuk membuat." />
      )}

      {!showForm && savedTrainees.length > 0 && filteredTrainees.length === 0 && (
        <Empty icon="🔍" message={`Tidak ada trainee dengan nama "${search}"`} />
      )}

      {!showForm && filteredTrainees.length > 0 && (
        <div className={styles.list}>
          {filteredTrainees.map((t) => {
            const isActive = selectedSavedTraineeIds.includes(t.id);
            const skillCount = t.skillIds?.length ?? 0;
            return (
              <div
                key={t.id}
                className={[styles.item, isActive && selectable ? styles.itemActive : ''].join(' ')}
                onClick={() => selectable && toggleSelectedSavedTrainee(t.id)}
                role={selectable ? 'button' : undefined}
              >
                {selectable && (
                  <input
                    type="checkbox"
                    checked={isActive}
                    readOnly
                    className={styles.checkbox}
                  />
                )}
                <img
                  src={`/images/uma_icons/Game_Playable_Icon_${t.characterId}01.png`}
                  alt=""
                  className={styles.icon}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
                <div className={styles.info}>
                  <div className={styles.label}>{t.label}</div>
                  <div className={styles.sub}>
                    {t.characterName}
                    {t.cardLabel ? ` · ${t.cardLabel}` : ''}
                  </div>
                  <div className={styles.statLine}>
                    SPD {t.stats.speed} · STA {t.stats.stamina} · PWR {t.stats.power} · GUT {t.stats.guts} · WIT {t.stats.wisdom}
                  </div>
                  <div className={styles.skillLine}>
                    🎯 {skillCount > 0 ? `${skillCount} skill` : 'Belum ada skill'}
                  </div>
                </div>
                <div className={styles.actions} onClick={(e) => e.stopPropagation()}>
                  <button className={styles.iconBtn} title="Edit" onClick={() => handleEdit(t.id)}>✏️</button>
                  <button className={styles.iconBtn} title="Hapus" onClick={() => removeSavedTrainee(t.id)}>🗑️</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
