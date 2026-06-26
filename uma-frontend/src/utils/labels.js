// Ground type labels
export const GROUND_LABELS = { 1: 'Turf', 2: 'Dirt' };
export const GROUND_CONDITION_LABELS = { 1: 'Firm', 2: 'Good', 3: 'Soft', 4: 'Heavy' };
export const DISTANCE_CATEGORY_LABELS = {
  short: 'Short',
  mile: 'Mile',
  medium: 'Medium',
  long: 'Long',
};
export const RARITY_LABELS = { 1: 'Normal', 2: 'Rare', 3: 'Unique', 4: 'Event' };
export const RARITY_COLORS = {
  1: 'var(--text2)',
  2: 'var(--blue)',
  3: 'var(--accent)',
  4: 'var(--purple)',
};

export const STYLE_OPTIONS = [
  { value: 'frontrunner', label: '逃げ (Front Runner)' },
  { value: 'pacechaser', label: '先行 (Pace Chaser)' },
  { value: 'latesurger', label: '差し (Late Surger)' },
  { value: 'endcloser', label: '追込 (End Closer)' },
  { value: 'runaway', label: '大逃げ (Runaway)' },
];

export const APT_OPTIONS = ['S', 'A', 'B', 'C', 'D', 'E', 'F', 'G'];

export const MOOD_OPTIONS = [
  { value: 0, label: '絶不調 (Very Bad)' },
  { value: 1, label: '不調 (Bad)' },
  { value: 2, label: '普通 (Normal)' },
  { value: 3, label: '好調 (Good)' },
  { value: 4, label: '絶好調 (Excellent)' },
];

export function formatCourseName(course) {
  const ground = GROUND_LABELS[course.ground] || '?';
  const cat = DISTANCE_CATEGORY_LABELS[course.distance_category] || '';
  return `${course.distance}m ${ground}${cat ? ` (${cat})` : ''}`;
}

export function formatTrackName(track) {
  if (!track) return '';
  return track.name_en || track.name_ja || `Track #${track.id}`;
}

export function rarityLabel(r) {
  return RARITY_LABELS[r] || `Rarity ${r}`;
}
