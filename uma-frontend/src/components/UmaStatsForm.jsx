import { useAppStore } from '../store/appStore';
import { SectionLabel } from './ui';
import { STYLE_OPTIONS, APT_OPTIONS, MOOD_OPTIONS } from '../utils/labels';

const STATS = ['speed', 'stamina', 'power', 'guts', 'wisdom'];
const STAT_LABELS = { speed: 'Speed', stamina: 'Stamina', power: 'Power', guts: 'Guts', wisdom: 'Wisdom' };

export default function UmaStatsForm() {
  const { umaStats, setUmaStats } = useAppStore();

  const handleStat = (key, val) => {
    const n = parseInt(val, 10);
    if (!isNaN(n)) setUmaStats({ [key]: n });
  };

  return (
    <div>
      <SectionLabel icon="📊">Stats Uma</SectionLabel>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {STATS.map((key) => (
          <div key={key}>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-charcoal-400">{STAT_LABELS[key]}</label>
            <input
              type="number"
              min={1}
              max={9999}
              value={umaStats[key]}
              onChange={(e) => handleStat(key, e.target.value)}
            />
          </div>
        ))}
      </div>

      <SectionLabel icon="🎯">Gaya &amp; Aptitude</SectionLabel>

      <div className="mb-4">
        <label className="mb-1.5 block text-xs font-medium text-charcoal-500">Running Style</label>
        <select
          value={umaStats.style}
          onChange={(e) => setUmaStats({ style: e.target.value })}
        >
          {STYLE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-charcoal-500">Distance Apt.</label>
          <select
            value={umaStats.distanceApt}
            onChange={(e) => setUmaStats({ distanceApt: e.target.value })}
          >
            {APT_OPTIONS.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-charcoal-500">Surface Apt.</label>
          <select
            value={umaStats.surfaceApt}
            onChange={(e) => setUmaStats({ surfaceApt: e.target.value })}
          >
            {APT_OPTIONS.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-4">
        <label className="mb-1.5 block text-xs font-medium text-charcoal-500">Mood</label>
        <select
          value={umaStats.moodLevel}
          onChange={(e) => setUmaStats({ moodLevel: Number(e.target.value) })}
        >
          {MOOD_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
