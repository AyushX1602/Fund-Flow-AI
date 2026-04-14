'use client';

import React, { useEffect, useRef, useState } from 'react';

interface StatItem {
  value: string;
  numericEnd: number;
  suffix: string;
  prefix: string;
  label: string;
  description: string;
  color: string;
}

const stats: StatItem[] = [
  {
    value: '0.9666',
    numericEnd: 9666,
    suffix: '',
    prefix: '0.',
    label: 'AUC Score',
    description: 'XGBoost model accuracy',
    color: '#00D4FF',
  },
  {
    value: '48',
    numericEnd: 48,
    suffix: '+',
    prefix: '',
    label: 'ML Features',
    description: 'Engineered feature vectors',
    color: '#7C3AED',
  },
  {
    value: '6',
    numericEnd: 6,
    suffix: '',
    prefix: '',
    label: 'Risk Layers',
    description: 'Composite scoring engine',
    color: '#00D4FF',
  },
  {
    value: '<50',
    numericEnd: 50,
    suffix: 'ms',
    prefix: '<',
    label: 'Latency',
    description: 'Real-time processing speed',
    color: '#7C3AED',
  },
];

function AnimatedCounter({ stat, inView }: { stat: StatItem; inView: boolean }) {
  const [displayed, setDisplayed] = useState('0');

  useEffect(() => {
    if (!inView) return;
    if (stat.prefix === '0.') {
      let start = 0;
      const end = stat.numericEnd;
      const duration = 1500;
      const startTime = performance.now();
      const animate = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = Math.floor(eased * end);
        setDisplayed(current.toString().padStart(4, '0'));
        if (progress < 1) requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
    } else if (stat.prefix === '<') {
      setDisplayed(stat.value.replace('<', '').replace('ms', ''));
    } else {
      let start = 0;
      const end = stat.numericEnd;
      const duration = 1200;
      const startTime = performance.now();
      const animate = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = Math.floor(eased * end);
        setDisplayed(current.toString());
        if (progress < 1) requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
    }
  }, [inView, stat]);

  const display = stat.prefix === '0.'
    ? `0.${displayed}`
    : `${stat.prefix}${displayed}${stat.suffix}`;

  return (
    <span className="font-display font-bold text-4xl lg:text-5xl font-mono-custom" style={{ color: stat.color }}>
      {display}
    </span>
  );
}

export default function StatsBar() {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true); },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={ref} className="relative py-12 border-y border-border-subtle overflow-hidden">
      {/* Gradient line top */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent-cyan to-transparent opacity-50" />

      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
          {stats.map((stat, i) => (
            <div
              key={stat.label}
              className="text-center group"
              style={{ transitionDelay: `${i * 0.1}s` }}
            >
              <div className="mb-2">
                <AnimatedCounter stat={stat} inView={inView} />
              </div>
              <div className="font-display font-semibold text-text-primary text-sm mb-1">{stat.label}</div>
              <div className="text-text-secondary text-xs font-body">{stat.description}</div>
              {/* Divider line */}
              {i < stats.length - 1 && (
                <div className="hidden lg:block absolute right-0 top-1/2 -translate-y-1/2 w-px h-12 bg-border-subtle" />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent-violet to-transparent opacity-50" />
    </section>
  );
}