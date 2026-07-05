import { NavLink } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { checkHealth } from '../../api/services';
import { useAppStore } from '../../store/appStore';
import { Dot } from '../ui';

const NAV = [
  { to: '/', label: 'Skill Checker', icon: '🔍' },
  { to: '/simulate', label: 'Simulasi Race', icon: '🏇' },
  { to: '/skills', label: 'Daftar Skill', icon: '📋' },
  { to: '/trainees', label: 'Trainee List', icon: '🐴' },
];

export default function Layout({ children }) {
  const { apiOnline, setApiOnline } = useAppStore();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const { data, isError } = useQuery({
    queryKey: ['health'],
    queryFn: checkHealth,
    retry: 1,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (data) setApiOnline(true);
    if (isError) setApiOnline(false);
  }, [data, isError, setApiOnline]);

  const dotStatus = apiOnline === null ? 'idle' : apiOnline ? 'ok' : 'err';
  const dotLabel = apiOnline === null ? 'Checking...' : apiOnline ? 'API Online' : 'API Offline';

  return (
    <div className="flex h-screen flex-col bg-cream-100 text-charcoal-700 overflow-hidden">
      {/* Header */}
      <header className="flex flex-shrink-0 items-center gap-3 border-b border-charcoal-100 bg-cream-50/95 px-4 py-3 md:px-6">
        <button
          className="mr-1 flex h-8 w-8 items-center justify-center rounded-xl text-charcoal-500 hover:bg-charcoal-100 md:hidden"
          onClick={() => setMobileNavOpen((v) => !v)}
          aria-label="Toggle navigation"
        >
          <span className="text-lg">{mobileNavOpen ? '✕' : '☰'}</span>
        </button>
        <span className="text-xl leading-none">🐴</span>
        <h1 className="font-serif text-[17px] font-semibold tracking-tight text-charcoal-800 md:text-lg">
          Uma Musume <span className="italic font-normal text-charcoal-400">— Skill Analyzer</span>
        </h1>
        <span className="ml-auto flex items-center gap-2 rounded-full border border-charcoal-100 bg-cream-100 px-3 py-1 font-mono text-[11px] text-charcoal-400">
          <Dot status={dotStatus} /> {dotLabel}
        </span>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Desktop sidebar */}
        <nav className="group hidden flex-shrink-0 flex-col gap-1 overflow-hidden border-r border-charcoal-100 bg-cream-50 py-4 transition-[width] duration-300 ease-out hover:w-56 md:flex md:w-[68px]">
          {NAV.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                [
                  'relative flex items-center gap-3 whitespace-nowrap border-l-2 px-5 py-3 text-sm font-medium transition-colors duration-150',
                  isActive
                    ? 'border-sage-600 bg-sage-50 text-sage-700'
                    : 'border-transparent text-charcoal-400 hover:bg-charcoal-50 hover:text-charcoal-700',
                ].join(' ')
              }
            >
              <span className="flex-shrink-0 text-base">{icon}</span>
              <span className="opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                {label}
              </span>
            </NavLink>
          ))}
        </nav>

        {/* Mobile nav drawer */}
        <AnimatePresence>
          {mobileNavOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 top-[57px] z-20 bg-charcoal-900/30 md:hidden"
                onClick={() => setMobileNavOpen(false)}
              />
              <motion.nav
                initial={{ x: -260, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -260, opacity: 0 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="fixed left-0 top-[57px] z-30 flex h-[calc(100%-57px)] w-64 flex-col gap-1 border-r border-charcoal-100 bg-cream-50 py-4 shadow-lift md:hidden"
              >
                {NAV.map(({ to, label, icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === '/'}
                    onClick={() => setMobileNavOpen(false)}
                    className={({ isActive }) =>
                      [
                        'flex items-center gap-3 whitespace-nowrap border-l-2 px-5 py-3.5 text-sm font-medium',
                        isActive
                          ? 'border-sage-600 bg-sage-50 text-sage-700'
                          : 'border-transparent text-charcoal-400',
                      ].join(' ')
                    }
                  >
                    <span className="text-base">{icon}</span>
                    <span>{label}</span>
                  </NavLink>
                ))}
              </motion.nav>
            </>
          )}
        </AnimatePresence>

        {/* Mobile bottom nav */}
        <nav className="fixed bottom-0 left-0 right-0 z-10 flex border-t border-charcoal-100 bg-cream-50/95 backdrop-saturate-150 md:hidden">
          {NAV.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                [
                  'flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium',
                  isActive ? 'text-sage-700' : 'text-charcoal-400',
                ].join(' ')
              }
            >
              <span className="text-base">{icon}</span>
              <span className="leading-none">{label.split(' ')[0]}</span>
            </NavLink>
          ))}
        </nav>

        <main className="flex flex-1 flex-col overflow-hidden bg-cream-100 pb-14 md:pb-0">
          {children}
        </main>
      </div>
    </div>
  );
}
