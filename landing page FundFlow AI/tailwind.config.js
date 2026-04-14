/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['Plus Jakarta Sans', 'sans-serif'],
        body: ['DM Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        bg: {
          primary: 'var(--bg-primary)',
          secondary: 'var(--bg-secondary)',
          tertiary: '#111827',
        },
        accent: {
          cyan: 'var(--accent-cyan)',
          'cyan-dark': '#0099CC',
          'cyan-light': '#7EEEFF',
          violet: 'var(--accent-violet)',
          'violet-dark': '#5B21B6',
          'violet-light': '#A78BFA',
        },
        surface: {
          DEFAULT: 'var(--bg-card)',
          hover: 'var(--bg-card-hover)',
          strong: 'rgba(255,255,255,0.1)',
        },
        border: {
          subtle: 'var(--border-subtle)',
          medium: 'rgba(255,255,255,0.12)',
          glow: 'var(--border-glow)',
        },
        text: {
          primary: 'var(--foreground)',
          secondary: 'var(--foreground-muted)',
          muted: 'var(--foreground-subtle)',
        },
        risk: {
          critical: '#EF4444',
          high: '#F97316',
          medium: '#EAB308',
          low: '#22C55E',
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'hero-gradient': 'linear-gradient(135deg, #0A0F1E 0%, #0D1529 50%, #0F0A1E 100%)',
        'cyan-violet': 'linear-gradient(135deg, #00D4FF 0%, #7C3AED 100%)',
        'card-gradient': 'linear-gradient(135deg, rgba(0,212,255,0.05) 0%, rgba(124,58,237,0.05) 100%)',
      },
      boxShadow: {
        'glow-cyan': '0 0 20px rgba(0,212,255,0.3), 0 0 60px rgba(0,212,255,0.1)',
        'glow-violet': '0 0 20px rgba(124,58,237,0.3), 0 0 60px rgba(124,58,237,0.1)',
        'card': '0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
        'card-hover': '0 8px 40px rgba(0,0,0,0.5), 0 0 20px rgba(0,212,255,0.08)',
      },
      animation: {
        'blob': 'blobMove 12s ease-in-out infinite',
        'live-pulse': 'livePulse 1.5s ease-in-out infinite',
        'border-glow': 'borderGlow 3s ease-in-out infinite',
        'shimmer': 'shimmer 4s linear infinite',
        'node-pulse': 'nodePulse 2s ease-in-out infinite',
        'gradient-shift': 'gradientShift 6s ease infinite',
      },
      keyframes: {
        blobMove: {
          '0%, 100%': { borderRadius: '60% 40% 30% 70% / 60% 30% 70% 40%', transform: 'translate(0, 0) scale(1)' },
          '33%': { borderRadius: '30% 60% 70% 40% / 50% 60% 30% 60%', transform: 'translate(30px, -20px) scale(1.05)' },
          '66%': { borderRadius: '50% 60% 30% 60% / 40% 30% 60% 50%', transform: 'translate(-20px, 15px) scale(0.95)' },
        },
        livePulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
        borderGlow: {
          '0%, 100%': { borderColor: 'rgba(0,212,255,0.3)', boxShadow: '0 0 15px rgba(0,212,255,0.1)' },
          '50%': { borderColor: 'rgba(124,58,237,0.5)', boxShadow: '0 0 25px rgba(124,58,237,0.2)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition: '200% center' },
        },
        nodePulse: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(0,212,255,0.4)' },
          '50%': { boxShadow: '0 0 0 8px rgba(0,212,255,0)' },
        },
        gradientShift: {
          '0%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
      },
    },
  },
  plugins: [],
};