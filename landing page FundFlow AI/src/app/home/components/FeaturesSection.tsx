'use client';

import React, { useEffect, useRef } from 'react';
import Icon from '@/components/ui/AppIcon';

interface Feature {
  id: string;
  icon: string;
  title: string;
  description: string;
  detail: string;
  colSpan: number;
  accentColor: string;
  badge?: string;
}

const features: Feature[] = [
  {
    id: 'ai-engine',
    icon: 'CpuChipIcon',
    title: 'AI Fraud Detection Engine',
    description: 'XGBoost model trained on 48 engineered features achieving AUC 0.9666 — detecting complex fraud patterns invisible to rule-based systems.',
    detail: 'Handles class imbalance via SMOTE, with precision-recall optimization for high-stakes banking environments.',
    colSpan: 2,
    accentColor: '#00D4FF',
    badge: 'AUC 0.9666',
  },
  {
    id: 'risk-scoring',
    icon: 'ChartBarIcon',
    title: '6-Layer Risk Scoring',
    description: 'Composite risk engine combining velocity, behavioral, network, KYC, device, and geolocation signals into a unified fraud score.',
    detail: 'Each layer independently configurable with bank-specific thresholds.',
    colSpan: 1,
    accentColor: '#7C3AED',
  },
  {
    id: 'realtime',
    icon: 'BoltIcon',
    title: 'Real-Time Monitoring',
    description: 'WebSocket-powered transaction stream with sub-50ms inference latency. Every UPI and NEFT transaction scored before settlement.',
    detail: 'Handles 10,000+ TPS with horizontal scaling.',
    colSpan: 1,
    accentColor: '#00D4FF',
    badge: '<50ms',
  },
  {
    id: 'graph',
    icon: 'ShareIcon',
    title: 'Graph-Based Fraud Detection',
    description: 'Network analysis reveals mule account rings, layering schemes, and coordinated fraud clusters invisible to individual transaction scoring.',
    detail: 'Neo4j-powered graph traversal with real-time community detection.',
    colSpan: 2,
    accentColor: '#7C3AED',
    badge: 'Network Analysis',
  },
  {
    id: 'shap',
    icon: 'LightBulbIcon',
    title: 'SHAP Explainability',
    description: 'Every fraud decision comes with SHAP feature attribution — giving your investigators a clear audit trail for regulatory review and case building.',
    detail: 'Compliant with RBI explainability guidelines for AI-driven decisions.',
    colSpan: 1,
    accentColor: '#00D4FF',
  },
  {
    id: 'india-stack',
    icon: 'GlobeAltIcon',
    title: 'India Stack Native',
    description: 'Built-in UPI transaction parsing, Aadhaar KYC verification, PMLA compliance reporting, and NPCI network integration — no custom middleware needed.',
    detail: 'Pre-certified for PSB deployment under RBI guidelines.',
    colSpan: 2,
    accentColor: '#7C3AED',
    badge: 'India Stack',
  },
];

function FeatureCard({ feature, index }: { feature: Feature; index: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('reveal-visible');
          observer.unobserve(el);
        }
      },
      { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`feature-card-hidden glass-card glass-card-hover rounded-2xl p-6 lg:p-8 shadow-card group cursor-default relative overflow-hidden stagger-${index + 1} ${
        feature.colSpan === 2 ? 'lg:col-span-2' : 'lg:col-span-1'
      }`}
    >
      <div className="flex items-start justify-between mb-4">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3"
          style={{ background: `${feature.accentColor}15`, border: `1px solid ${feature.accentColor}30` }}
        >
          <Icon
            name={feature.icon as "CpuChipIcon"}
            size={24}
            style={{ color: feature.accentColor } as React.CSSProperties}
          />
        </div>
        {feature.badge && (
          <span
            className="text-xs font-mono-custom font-semibold px-2.5 py-1 rounded-full"
            style={{
              color: feature.accentColor,
              background: `${feature.accentColor}15`,
              border: `1px solid ${feature.accentColor}30`,
            }}
          >
            {feature.badge}
          </span>
        )}
      </div>

      <h3 className="font-display font-bold text-xl text-text-primary mb-3 group-hover:text-accent-cyan transition-colors duration-300">
        {feature.title}
      </h3>
      <p className="text-text-secondary text-sm leading-relaxed mb-3">{feature.description}</p>
      <p className="text-text-muted text-xs leading-relaxed font-body border-t border-border-subtle pt-3 mt-3">
        {feature.detail}
      </p>

      {/* Hover glow */}
      <div
        className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{ background: `radial-gradient(circle at 50% 0%, ${feature.accentColor}08 0%, transparent 60%)` }}
      />

      {/* Bottom edge glow line */}
      <div
        className="absolute bottom-0 left-0 right-0 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{ background: `linear-gradient(90deg, transparent, ${feature.accentColor}60, transparent)` }}
      />
    </div>
  );
}

export default function FeaturesSection() {
  const titleRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const bgBlobRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('reveal-visible');
          observer.unobserve(el);
        }
      },
      { threshold: 0.2 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Parallax on the background blob
  useEffect(() => {
    const handleScroll = () => {
      if (!sectionRef.current || !bgBlobRef.current) return;
      const rect = sectionRef.current.getBoundingClientRect();
      const progress = -rect.top / (rect.height + window.innerHeight);
      bgBlobRef.current.style.transform = `translateY(${progress * 80}px)`;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <section ref={sectionRef} id="features" className="relative py-24 bg-bg-primary overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div
          ref={bgBlobRef}
          className="absolute w-96 h-96 rounded-full opacity-5 blur-3xl parallax-slow"
          style={{ background: '#7C3AED', top: '20%', right: '5%' }}
        />
      </div>

      <div className="max-w-7xl mx-auto px-6">
        {/* Section header */}
        <div ref={titleRef} className="reveal-hidden text-center mb-16">
          <span className="inline-block text-xs font-mono-custom font-semibold text-accent-cyan uppercase tracking-widest mb-4 px-3 py-1 rounded-full border border-accent-cyan/20 bg-accent-cyan/5">
            Core Capabilities
          </span>
          <h2 className="font-display font-bold text-4xl lg:text-5xl text-text-primary mb-4">
            Built for the{' '}
            <span className="gradient-text-cyan">Complexity of Fraud</span>
          </h2>
          <p className="text-text-secondary text-lg max-w-2xl mx-auto leading-relaxed">
            Six interlocking capabilities that work as a unified defense system — not disconnected point solutions.
          </p>
        </div>

        {/* Bento grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative">
          {features.map((feature, i) => (
            <FeatureCard key={feature.id} feature={feature} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}