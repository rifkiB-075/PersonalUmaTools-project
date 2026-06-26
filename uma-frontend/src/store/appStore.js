import { create } from 'zustand';

export const useAppStore = create((set) => ({
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
}));
