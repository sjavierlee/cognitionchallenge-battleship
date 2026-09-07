import { useCallback, useEffect, useState } from 'react';
import { loadThemePreference, saveThemePreference, type ThemePreference } from '../storage/record';

export type Theme = 'light' | 'dark';

const QUERY = '(prefers-color-scheme: dark)';

function systemTheme(): Theme {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(QUERY).matches
      ? 'dark'
      : 'light'
    : 'light';
}

function resolve(pref: ThemePreference): Theme {
  return pref === 'system' ? systemTheme() : pref;
}

/**
 * Light/dark theme: follows the OS by default, an explicit choice is persisted and wins.
 * The resolved theme is mirrored to `<html data-theme>` so CSS variables can switch.
 */
export function useTheme(): { theme: Theme; toggleTheme: () => void } {
  const [pref, setPref] = useState<ThemePreference>(() => loadThemePreference());
  const [system, setSystem] = useState<Theme>(() => systemTheme());
  const theme = pref === 'system' ? system : pref;

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(QUERY);
    const onChange = () => setSystem(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setPref((p) => {
      const next: ThemePreference = resolve(p) === 'dark' ? 'light' : 'dark';
      saveThemePreference(next);
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
