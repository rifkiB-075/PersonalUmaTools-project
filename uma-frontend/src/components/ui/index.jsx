import { motion } from 'framer-motion';

// ── Button ──
const BUTTON_VARIANTS = {
  primary:
    'bg-charcoal-700 text-cream-50 border border-charcoal-700 hover:bg-charcoal-800 disabled:opacity-40 disabled:hover:bg-charcoal-700',
  secondary:
    'bg-transparent text-charcoal-700 border border-charcoal-300 hover:border-charcoal-700 hover:bg-charcoal-100/40 disabled:opacity-40',
  ghost:
    'bg-transparent text-charcoal-500 border border-transparent hover:text-charcoal-800 hover:bg-charcoal-100/60 disabled:opacity-40',
  danger:
    'bg-transparent text-clay-500 border border-clay-200 hover:bg-clay-50 disabled:opacity-40',
};

const BUTTON_SIZES = {
  sm: 'text-xs px-3 py-1.5 gap-1.5',
  md: 'text-sm px-4 py-2.5 gap-2',
  lg: 'text-base px-6 py-3 gap-2',
};

export function Button({ children, variant = 'default', size = 'md', className = '', disabled, ...props }) {
  const v = BUTTON_VARIANTS[variant] || BUTTON_VARIANTS.secondary;
  const s = BUTTON_SIZES[size] || BUTTON_SIZES.md;
  return (
    <motion.button
      whileHover={disabled ? {} : { scale: 1.015 }}
      whileTap={disabled ? {} : { scale: 0.985 }}
      transition={{ duration: 0.15 }}
      disabled={disabled}
      className={[
        'inline-flex items-center justify-center rounded-2xl font-medium tracking-wide',
        'transition-colors duration-150 shadow-sm select-none',
        v, s, className,
      ].join(' ')}
      {...props}
    >
      {children}
    </motion.button>
  );
}

// ── SectionLabel ──
export function SectionLabel({ children, icon }) {
  return (
    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-charcoal-400 mb-3 mt-1 first:mt-0">
      {icon && <span className="text-sm not-italic">{icon}</span>}
      <span>{children}</span>
    </div>
  );
}

// ── FormGroup ──
export function FormGroup({ label, children }) {
  return (
    <div className="mb-4">
      {label && (
        <label className="block text-xs font-medium text-charcoal-500 mb-1.5">{label}</label>
      )}
      {children}
    </div>
  );
}

// ── Card ──
export function Card({ children, className = '', ...props }) {
  return (
    <div
      className={[
        'bg-cream-50 border border-charcoal-100 rounded-2xl p-5 shadow-soft',
        className,
      ].join(' ')}
      {...props}
    >
      {children}
    </div>
  );
}

// ── Badge ──
export function Badge({ children, color, bg }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold tracking-wide"
      style={{ color: color || 'var(--text2)', background: bg || 'var(--bg4)' }}
    >
      {children}
    </span>
  );
}

// ── Empty state ──
export function Empty({ icon = '🏇', message = 'Tidak ada data' }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6 text-charcoal-400 animate-fade-in-up">
      <span className="text-4xl mb-3 opacity-80">{icon}</span>
      <p className="text-sm max-w-xs">{message}</p>
    </div>
  );
}

// ── Spinner ──
export function Spinner({ size = 20 }) {
  return (
    <motion.span
      animate={{ rotate: 360 }}
      transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
      style={{ width: size, height: size }}
      className="inline-block rounded-full border-2 border-charcoal-200 border-t-sage-600"
      aria-label="Loading"
    />
  );
}

// ── Dot (status indicator) ──
const DOT_COLORS = {
  ok: 'bg-sage-500',
  err: 'bg-clay-500',
  idle: 'bg-charcoal-300',
};

export function Dot({ status }) {
  return (
    <span className={['inline-block w-1.5 h-1.5 rounded-full', DOT_COLORS[status] || DOT_COLORS.idle].join(' ')} />
  );
}
