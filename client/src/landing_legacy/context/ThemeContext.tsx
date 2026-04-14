import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'dark' | 'light';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Default to 'light' — no localStorage check on init to avoid FOUC
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    // Read user preference from localStorage on mount
    const stored = localStorage.getItem('fundflow-landing-theme') as Theme | null;
    if (stored === 'dark' || stored === 'light') {
      setTheme(stored);
    }
    // If nothing stored, stay on light (default)
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.setAttribute('data-theme', 'dark');
    } else {
      // Light = remove data-theme (or set to 'light', both work)
      root.removeAttribute('data-theme');
    }
    localStorage.setItem('fundflow-landing-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
