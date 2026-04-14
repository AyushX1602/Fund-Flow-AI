import React from 'react';
import AppLogo from '@/components/ui/AppLogo';


export default function Footer() {
  return (
    <footer className="border-t border-border-subtle bg-bg-primary">
      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          {/* Logo + brand */}
          <div className="flex items-center gap-3">
            <AppLogo size={28} />
            <span className="font-display font-bold text-base text-text-primary">
              FundFlow <span className="gradient-text-cyan">AI</span>
            </span>
          </div>

          {/* Nav links */}
          <nav className="flex flex-wrap justify-center gap-6">
            {[
              { label: 'Features', href: '#features' },
              { label: 'How It Works', href: '#how-it-works' },
              { label: 'Demo', href: '#demo' },
              { label: 'Privacy', href: '/privacy' },
              { label: 'Terms', href: '/terms' },
            ]?.map(link => (
              <a
                key={link?.label}
                href={link?.href}
                className="text-sm font-body font-medium text-text-secondary hover:text-text-primary transition-colors duration-200 focus:outline-none focus:text-text-primary"
              >
                {link?.label}
              </a>
            ))}
          </nav>

          {/* Social + copyright */}
          <div className="flex items-center gap-4 text-text-muted">
            {[
              { icon: '𝕏', label: 'Twitter', href: '#' },
              { icon: 'in', label: 'LinkedIn', href: '#' },
              { icon: 'gh', label: 'GitHub', href: '#' },
            ]?.map(s => (
              <a
                key={s?.label}
                href={s?.href}
                aria-label={s?.label}
                className="text-xs font-mono-custom font-semibold text-text-muted hover:text-accent-cyan transition-colors duration-200 w-8 h-8 flex items-center justify-center rounded-lg border border-border-subtle hover:border-accent-cyan/30"
              >
                {s?.icon}
              </a>
            ))}
            <span className="text-xs font-mono-custom text-text-muted ml-2">© 2026 FundFlow AI</span>
          </div>
        </div>
      </div>
    </footer>
  );
}