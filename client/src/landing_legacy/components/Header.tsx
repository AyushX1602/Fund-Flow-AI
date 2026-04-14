import React, { useEffect, useState } from 'react';
import AppLogo from '@/landing_legacy/components/ui/AppLogo';
import Icon from '@/landing_legacy/components/ui/AppIcon';
import { useTheme } from '@/landing_legacy/context/ThemeContext';

const navLinks = [
  { label: 'Features', href: '#features' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Demo', href: '#demo' },
  { label: 'Why Us', href: '#why' },
];

export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (menuOpen) {
      const close = () => setMenuOpen(false);
      window.addEventListener('scroll', close, { once: true });
      return () => window.removeEventListener('scroll', close);
    }
  }, [menuOpen]);

  return (
    <header
      className={`fixed top-0 w-full z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-bg-primary/80 backdrop-blur-xl border-b border-border-subtle shadow-card'
          : 'bg-transparent'
      }`}
      style={{ backgroundColor: scrolled ? 'color-mix(in srgb, var(--bg-primary) 80%, transparent)' : 'transparent' }}
    >
      <nav className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <AppLogo size={36} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} />
          <span className="font-display font-bold text-lg tracking-tight text-text-primary hidden sm:block">
            FundFlow <span className="gradient-text-cyan">AI</span>
          </span>
        </div>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-8">
          {navLinks?.map(link => (
            <a
              key={link?.label}
              href={link?.href}
              className="text-sm font-body font-medium text-text-secondary hover:text-text-primary transition-colors duration-200"
            >
              {link?.label}
            </a>
          ))}
        </div>

        {/* Desktop CTA */}
        <div className="hidden md:flex items-center gap-3">
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            className="w-9 h-9 flex items-center justify-center rounded-xl border border-border-subtle text-text-secondary hover:text-text-primary hover:border-accent-cyan/40 transition-all duration-200"
            style={{ background: 'var(--bg-card)' }}
          >
            {theme === 'dark' ? (
              <Icon name="SunIcon" size={18} variant="outline" />
            ) : (
              <Icon name="MoonIcon" size={18} variant="outline" />
            )}
          </button>
          <button className="btn-secondary px-5 py-2.5 rounded-xl text-sm font-display font-semibold">
            Contact Sales
          </button>
          <button className="btn-primary px-5 py-2.5 rounded-xl text-sm font-display font-semibold flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-bg-primary live-dot" />
            Request Demo
          </button>
        </div>

        {/* Mobile: theme toggle + menu button */}
        <div className="md:hidden flex items-center gap-2">
          <button
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            className="p-2 text-text-secondary hover:text-text-primary transition-colors"
          >
            {theme === 'dark' ? (
              <Icon name="SunIcon" size={20} variant="outline" />
            ) : (
              <Icon name="MoonIcon" size={20} variant="outline" />
            )}
          </button>
          <button
            className="p-2 text-text-secondary hover:text-text-primary transition-colors"
            onClick={() => setMenuOpen(p => !p)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          >
            <Icon name={menuOpen ? 'XMarkIcon' : 'Bars3Icon'} size={24} />
          </button>
        </div>
      </nav>
      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden backdrop-blur-xl border-b border-border-subtle px-6 py-6 space-y-4" style={{ background: 'color-mix(in srgb, var(--bg-secondary) 95%, transparent)' }}>
          {navLinks?.map(link => (
            <a
              key={link?.label}
              href={link?.href}
              onClick={() => setMenuOpen(false)}
              className="block py-3 text-base font-body font-medium text-text-secondary hover:text-text-primary transition-colors border-b border-border-subtle last:border-0"
            >
              {link?.label}
            </a>
          ))}
          <button className="btn-primary w-full py-4 rounded-xl text-sm font-display font-bold mt-4">
            Request Demo
          </button>
        </div>
      )}
    </header>
  );
}