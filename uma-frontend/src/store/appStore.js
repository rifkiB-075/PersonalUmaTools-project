import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useAppStore = create(
  persist(
    (set) => ({
  // API status
  apiOnline: null,
  setApiOnline: (v) => set({ apiOnline: v }),

  // Selected course context (shared between pages)
  selectedRacetrack: null,
  selectedCourse: null,
  setSelectedRacetrack: (rt) => set({ selectedRacetrack: rt, selectedCourse: null }),
  setSelectedCourse: (c) => set({ selectedCourse: c }),

  // Uma stats (shared between Skill Checker & Simulate)
  umaStats: {
    speed: 1200,
    stamina: 800,
    power: 900,
    guts: 600,
    wisdom: 700,
    style: 'pacechaser',
    distanceApt: 'A',
    surfaceApt: 'A',
    moodLevel: 2,
  },
  setUmaStats: (stats) =>
    set((s) => ({ umaStats: { ...s.umaStats, ...stats } })),

  // Selected skills for analysis
  selectedSkillIds: [],
  toggleSkill: (id) =>
    set((s) => ({
      selectedSkillIds: s.selectedSkillIds.includes(id)
        ? s.selectedSkillIds.filter((x) => x !== id)
        : [...s.selectedSkillIds, id],
    })),
  clearSkills: () => set({ selectedSkillIds: [] }),

  // ── Trainee tersimpan (untuk Simulasi Race) ──
  // Tiap item: { id, label, characterId, characterName, cardId, cardLabel, stats }
  savedTrainees: [],
  addSavedTrainee: (trainee) =>
    set((s) => ({ savedTrainees: [...s.savedTrainees, trainee] })),
  updateSavedTrainee: (id, patch) =>
    set((s) => ({
      savedTrainees: s.savedTrainees.map((t) =>
        t.id === id ? { ...t, ...patch } : t
      ),
    })),
  removeSavedTrainee: (id) =>
    set((s) => ({
      savedTrainees: s.savedTrainees.filter((t) => t.id !== id),
      selectedSavedTraineeIds: s.selectedSavedTraineeIds.filter((x) => x !== id),
    })),

  // Trainee tersimpan yang dipilih untuk dijalankan simulasinya (multi-select, untuk race)
  selectedSavedTraineeIds: [],
  toggleSelectedSavedTrainee: (id) =>
    set((s) => ({
      selectedSavedTraineeIds: s.selectedSavedTraineeIds.includes(id)
        ? s.selectedSavedTraineeIds.filter((x) => x !== id)
        : [...s.selectedSavedTraineeIds, id],
    })),
  clearSelectedSavedTrainees: () => set({ selectedSavedTraineeIds: [] }),
    }),
    {
      name: 'uma-app-store',
      partialize: (state) => ({
        savedTrainees: state.savedTrainees,
        selectedSavedTraineeIds: state.selectedSavedTraineeIds,
      }),
    }
  )
);
