import { useAppStore } from '../store/appStore';
import { FormGroup, SectionLabel } from './ui';
import { STYLE_OPTIONS, APT_OPTIONS, MOOD_OPTIONS } from '../utils/labels';
import styles from './UmaStatsForm.module.css';

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

      <div className={styles.statGrid}>
        {STATS.map((key) => (
          <div key={key} className={styles.statField}>
            <label>{STAT_LABELS[key]}</label>
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

      <SectionLabel icon="🎯">Gaya & Aptitude</SectionLabel>

      <FormGroup label="Running Style">
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
      </FormGroup>

      <div className={styles.aptGrid}>
        <div className={styles.aptField}>
          <label>Distance Apt.</label>
          <select
            value={umaStats.distanceApt}
            onChange={(e) => setUmaStats({ distanceApt: e.target.value })}
          >
            {APT_OPTIONS.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>
        <div className={styles.aptField}>
          <label>Surface Apt.</label>
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

      <FormGroup label="Mood">
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
      </FormGroup>
    </div>
  );
}
