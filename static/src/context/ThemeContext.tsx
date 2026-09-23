/**
 * ThemeContext — Provides dark / light / executive theme switching.
 * 
 * Default: dark
 * Persists selection in localStorage.
 * Applies CSS class to <html> element for theme-aware styling.
 */

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

export type ThemeMode = 'dark' | 'light' | 'executive';

interface ThemeContextValue {
    theme: ThemeMode;
    setTheme: (theme: ThemeMode) => void;
    cycleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'datatrust-theme';
const VALID_THEMES: ThemeMode[] = ['dark', 'light', 'executive'];

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
    const [theme, setThemeState] = useState<ThemeMode>(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved && VALID_THEMES.includes(saved as ThemeMode)) {
                return saved as ThemeMode;
            }
        } catch { /* ignore */ }
        return 'dark';
    });

    const applyTheme = useCallback((t: ThemeMode) => {
        const html = document.documentElement;
        // Remove all theme classes
        html.classList.remove('dark', 'light', 'executive');
        
        // Apply the correct class
        html.classList.add(t);
        
        // Set meta theme-color
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) {
            const colors: Record<ThemeMode, string> = {
                dark: '#070b16',
                light: '#f8fafc',
                executive: '#0a1628',
            };
            meta.setAttribute('content', colors[t]);
        }

        // Update body background for no-flash
        const bgColors: Record<ThemeMode, string> = {
            dark: '#070b16',
            light: '#f8fafc',
            executive: '#0a1628',
        };
        document.body.style.backgroundColor = bgColors[t];
        document.body.style.color = t === 'light' ? '#0f172a' : '#f8fafc';
    }, []);

    useEffect(() => {
        applyTheme(theme);
    }, [theme, applyTheme]);

    const setTheme = useCallback((t: ThemeMode) => {
        setThemeState(t);
        localStorage.setItem(STORAGE_KEY, t);
    }, []);

    const cycleTheme = useCallback(() => {
        const idx = VALID_THEMES.indexOf(theme);
        const next = VALID_THEMES[(idx + 1) % VALID_THEMES.length];
        setTheme(next);
    }, [theme, setTheme]);

    return (
        <ThemeContext.Provider value={{ theme, setTheme, cycleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => {
    const ctx = useContext(ThemeContext);
    if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
    return ctx;
};
