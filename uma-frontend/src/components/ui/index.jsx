import styles from './ui.module.css';

// ── Button ──
export function Button({ children, variant = 'default', size = 'md', className = '', ...props }) {
  const cls = [
    styles.btn,
    styles[`btn_${variant}`],
    styles[`btn_${size}`],
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button className={cls} {...props}>
      {children}
    </button>
  );
}

// ── SectionLabel ──
export function SectionLabel({ children, icon }) {
  return (
    <div className={styles.sectionLabel}>
      {icon && <span>{icon}</span>}
      <span>{children}</span>
    </div>
  );
}

// ── FormGroup ──
export function FormGroup({ label, children }) {
  return (
    <div className={styles.formGroup}>
      {label && <label className={styles.formLabel}>{label}</label>}
      {children}
    </div>
  );
}

// ── Card ──
export function Card({ children, className = '', ...props }) {
  return (
    <div className={[styles.card, className].join(' ')} {...props}>
      {children}
    </div>
  );
}

// ── Badge ──
export function Badge({ children, color, bg }) {
  return (
    <span
      className={styles.badge}
      style={{ color: color || 'var(--text2)', background: bg || 'var(--bg4)' }}
    >
      {children}
    </span>
  );
}

// ── Empty state ──
export function Empty({ icon = '🏇', message = 'Tidak ada data' }) {
  return (
    <div className={styles.empty}>
      <span className={styles.emptyIcon}>{icon}</span>
      <p>{message}</p>
    </div>
  );
}

// ── Spinner ──
export function Spinner({ size = 20 }) {
  return (
    <span
      className={styles.spinner}
      style={{ width: size, height: size }}
      aria-label="Loading"
    />
  );
}

// ── Dot (status indicator) ──
export function Dot({ status }) {
  // status: 'ok' | 'err' | 'idle'
  return <span className={[styles.dot, styles[`dot_${status}`]].join(' ')} />;
}
