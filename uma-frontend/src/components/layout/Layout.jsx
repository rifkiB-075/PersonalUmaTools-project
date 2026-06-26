import { NavLink } from 'react-router-dom';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { checkHealth } from '../../api/services';
import { useAppStore } from '../../store/appStore';
import { Dot } from '../ui';
import styles from './Layout.module.css';

const NAV = [
  { to: '/', label: 'Skill Checker', icon: '🔍' },
  { to: '/simulate', label: 'Simulasi Race', icon: '🏇' },
  { to: '/skills', label: 'Daftar Skill', icon: '📋' },
  { to: '/trainees', label: 'Trainee List', icon: '🐴' },
];

export default function Layout({ children }) {
  const { apiOnline, setApiOnline } = useAppStore();

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
    <div className={styles.root}>
      <header className={styles.header}>
        <span className={styles.headerIcon}>🐴</span>
        <span className={styles.headerTitle}>Uma Musume — Skill Analyzer</span>
        <span className={styles.headerSub}>
          <Dot status={dotStatus} /> {dotLabel}
        </span>
      </header>

      <div className={styles.body}>
        <nav className={styles.nav}>
          {NAV.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                [styles.navItem, isActive ? styles.navActive : ''].join(' ')
              }
            >
              <span className={styles.navIcon}>{icon}</span>
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <main className={styles.main}>{children}</main>
      </div>
    </div>
  );
}
