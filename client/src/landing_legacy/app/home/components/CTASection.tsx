import React, { useEffect, useRef } from 'react';
import Icon from '@/landing_legacy/components/ui/AppIcon';

const reasons = [
  {
    icon: 'BuildingLibraryIcon',
    title: 'Built for Public Sector Banks',
    description: 'Designed from the ground up for PSB operational constraints, legacy system integration, and RBI regulatory requirements.',
    color: '#00D4FF',
  },
  {
    icon: 'EyeIcon',
    title: 'Not a Black-Box AI',
    description: 'Every fraud decision comes with SHAP feature attribution. Your investigators understand exactly why a transaction was flagged.',
    color: '#7C3AED',
  },
  {
    icon: 'BoltIcon',
    title: 'Real-Time at Scale',
    description: 'Sub-50ms inference on 10,000+ TPS with horizontal scaling. No batch processing delays — fraud blocked before settlement.',
    color: '#00D4FF',
  },
  {
    icon: 'ShieldCheckIcon',
    title: 'Regulatory Aligned',
    description: 'PMLA reporting, RBI AI explainability guidelines, and Aadhaar KYC compliance built-in — not bolted on.',
    color: '#7C3AED',
  },
];

export default function CTASection() {
  const cardsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.querySelectorAll('.reveal-hidden').forEach(el => {
              el.classList.add('reveal-visible');
            });
          }
        });
      },
      { threshold: 0.1 }
    );
    if (cardsRef.current) observer.observe(cardsRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      {/* Why FundFlow AI section */}
      <section id="why" className="relative py-24 bg-bg-secondary overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute w-full h-px bg-gradient-to-r from-transparent via-accent-cyan/20 to-transparent top-0" />
        </div>

        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <span className="inline-block text-xs font-mono-custom font-semibold text-accent-cyan uppercase tracking-widest mb-4 px-3 py-1 rounded-full border border-accent-cyan/20 bg-accent-cyan/5">
              Why FundFlow AI
            </span>
            <h2 className="font-display font-bold text-4xl lg:text-5xl text-text-primary mb-4">
              The Fraud Platform{' '}
              <span className="gradient-text-cyan">PSBs Actually Need</span>
            </h2>
            <p className="text-text-secondary text-lg max-w-2xl mx-auto">
              Not a generic fraud tool adapted for banking — a system built from day one for Indian public sector bank requirements.
            </p>
          </div>

          <div ref={cardsRef} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {reasons.map((reason, i) => (
              <div
                key={reason.title}
                className={`reveal-hidden glass-card glass-card-hover rounded-2xl p-8 shadow-card group stagger-${i + 1}`}
              >
                <div className="flex items-start gap-5">
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover:scale-110"
                    style={{
                      background: `${reason.color}15`,
                      border: `1px solid ${reason.color}30`,
                    }}
                  >
                    <Icon
                      name={reason.icon as "BuildingLibraryIcon"}
                      size={26}
                      style={{ color: reason.color } as React.CSSProperties}
                    />
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-xl text-text-primary mb-3 group-hover:text-accent-cyan transition-colors duration-300">
                      {reason.title}
                    </h3>
                    <p className="text-text-secondary text-sm leading-relaxed">{reason.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="relative py-24 overflow-hidden">
        {/* Gradient background */}
        <div className="absolute inset-0">
          <div
            className="absolute inset-0 gradient-animate"
            style={{
              background: 'linear-gradient(135deg, #0A0F1E 0%, #0D1529 30%, #0F0A1E 60%, #0A0F1E 100%)',
            }}
          />
          <div className="absolute inset-0 opacity-30"
            style={{
              background: 'radial-gradient(ellipse at 30% 50%, rgba(0,212,255,0.15) 0%, transparent 60%), radial-gradient(ellipse at 70% 50%, rgba(124,58,237,0.15) 0%, transparent 60%)',
            }}
          />
          {/* Grid */}
          <div
            className="absolute inset-0 opacity-5"
            style={{
              backgroundImage: 'linear-gradient(rgba(0,212,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,0.4) 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }}
          />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto px-6 text-center">
          <div className="glass-card rounded-3xl p-12 lg:p-16 border border-accent-cyan/20 shadow-glow-cyan">
            <span className="inline-block text-xs font-mono-custom font-semibold text-accent-cyan uppercase tracking-widest mb-6 px-3 py-1 rounded-full border border-accent-cyan/20 bg-accent-cyan/5">
              Get Started
            </span>
            <h2 className="font-display font-bold text-4xl lg:text-6xl text-text-primary mb-6 leading-tight">
              Detect Fraud{' '}
              <span className="gradient-text-cyan">Before It Happens</span>
            </h2>
            <p className="text-text-secondary text-lg mb-10 max-w-2xl mx-auto leading-relaxed">
              Deploy FundFlow AI in your PSB environment in under 30 days. Full India Stack integration, zero disruption to existing workflows.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <button className="btn-primary px-10 py-4 rounded-xl font-display font-bold text-base flex items-center gap-2 glow-cyan">
                <Icon name="RocketLaunchIcon" size={20} variant="solid" />
                Get Started
              </button>
              <button className="btn-secondary px-10 py-4 rounded-xl font-display font-bold text-base flex items-center gap-2">
                <Icon name="CalendarIcon" size={20} variant="outline" />
                Book a Demo
                <Icon name="ArrowRightIcon" size={16} variant="outline" />
              </button>
            </div>

            {/* Micro proof */}
            <div className="flex flex-wrap justify-center gap-8 mt-10 pt-10 border-t border-border-subtle">
              {[
                { icon: 'CheckCircleIcon', text: 'No setup fees' },
                { icon: 'CheckCircleIcon', text: '30-day deployment' },
                { icon: 'CheckCircleIcon', text: 'RBI compliant' },
                { icon: 'CheckCircleIcon', text: 'Dedicated support' },
              ].map(item => (
                <div key={item.text} className="flex items-center gap-2 text-text-secondary text-sm">
                  <Icon name="CheckCircleIcon" size={16} className="text-accent-cyan" />
                  <span>{item.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}