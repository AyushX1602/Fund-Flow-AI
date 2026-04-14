'use client';

import React, { useEffect, useState, useRef } from 'react';
import Icon from '@/components/ui/AppIcon';

interface Transaction {
  id: string;
  amount: number;
  risk: number;
  type: string;
  from: string;
  to: string;
  status: 'BLOCKED' | 'FLAGGED' | 'CLEARED';
  time: string;
  features: { name: string; value: string; score: number }[];
}

const generateTransaction = (): Transaction => {
  const risk = Math.floor(Math.random() * 100);
  const status = risk > 80 ? 'BLOCKED' : risk > 55 ? 'FLAGGED' : 'CLEARED';
  const banks = ['SBI', 'PNB', 'BOI', 'UCO', 'BOB', 'CANARA'];
  const types = ['UPI', 'NEFT', 'RTGS', 'IMPS'];
  return {
    id: `TXN-${Math.floor(10000 + Math.random() * 90000)}`,
    amount: Math.floor(Math.random() * 2000000) + 1000,
    risk,
    type: types[Math.floor(Math.random() * types.length)],
    from: `${banks[Math.floor(Math.random() * banks.length)]}-****${Math.floor(1000 + Math.random() * 9000)}`,
    to: `${banks[Math.floor(Math.random() * banks.length)]}-****${Math.floor(1000 + Math.random() * 9000)}`,
    status,
    time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    features: [
      { name: 'Velocity (1h)', value: `${Math.floor(Math.random() * 20)} txns`, score: Math.random() },
      { name: 'Geo Match', value: Math.random() > 0.5 ? 'Match' : 'Mismatch', score: Math.random() },
      { name: 'Beneficiary Age', value: `${Math.floor(Math.random() * 365)} days`, score: Math.random() },
      { name: 'Device Trust', value: Math.random() > 0.5 ? 'Trusted' : 'New', score: Math.random() },
    ],
  };
};

export default function DemoSection() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [stats, setStats] = useState({ blocked: 0, flagged: 0, cleared: 0, total: 0 });
  const [isRunning, setIsRunning] = useState(true);
  const sectionRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const bgBlobRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const initial = Array.from({ length: 6 }, generateTransaction);
    setTransactions(initial);
    setSelected(initial[0]);
  }, []);

  // Reveal header and panel on scroll
  useEffect(() => {
    const elements = [headerRef.current, panelRef.current];
    const observers: IntersectionObserver[] = [];

    elements.forEach((el, i) => {
      if (!el) return;
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setTimeout(() => {
              el.classList.add('reveal-visible');
            }, i * 120);
            observer.unobserve(el);
          }
        },
        { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
      );
      observer.observe(el);
      observers.push(observer);
    });

    return () => observers.forEach(o => o.disconnect());
  }, []);

  // Parallax on background blob
  useEffect(() => {
    const handleScroll = () => {
      const section = sectionRef.current;
      const blob = bgBlobRef.current;
      if (!section || !blob) return;
      const rect = section.getBoundingClientRect();
      const progress = -rect.top / (rect.height + window.innerHeight);
      blob.style.transform = `translateY(${progress * -60}px)`;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const count = { blocked: 0, flagged: 0, cleared: 0, total: transactions.length };
    transactions.forEach(t => {
      if (t.status === 'BLOCKED') count.blocked++;
      else if (t.status === 'FLAGGED') count.flagged++;
      else count.cleared++;
    });
    setStats(count);
  }, [transactions]);

  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => {
      const newTxn = generateTransaction();
      setTransactions(prev => [newTxn, ...prev.slice(0, 5)]);
    }, 2000);
    return () => clearInterval(interval);
  }, [isRunning]);

  const formatAmount = (n: number) =>
    n >= 100000
      ? `₹${(n / 100000).toFixed(1)}L`
      : `₹${n.toLocaleString('en-IN')}`;

  const statusConfig = {
    BLOCKED: { color: 'text-risk-critical', bg: 'risk-bg-critical', icon: 'XCircleIcon' },
    FLAGGED: { color: 'text-risk-high', bg: 'risk-bg-high', icon: 'ExclamationTriangleIcon' },
    CLEARED: { color: 'text-risk-low', bg: 'risk-bg-low', icon: 'CheckCircleIcon' },
  };

  return (
    <section id="demo" ref={sectionRef} className="relative py-24 bg-bg-primary overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div
          ref={bgBlobRef}
          className="absolute w-[500px] h-[500px] rounded-full opacity-5 blur-3xl parallax-slow"
          style={{ background: '#00D4FF', bottom: 0, left: '20%' }}
        />
      </div>

      <div className="max-w-7xl mx-auto px-6">
        {/* Header */}
        <div ref={headerRef} className="demo-reveal text-center mb-12">
          <span className="inline-block text-xs font-mono-custom font-semibold text-accent-cyan uppercase tracking-widest mb-4 px-3 py-1 rounded-full border border-accent-cyan/20 bg-accent-cyan/5">
            Interactive Demo
          </span>
          <h2 className="font-display font-bold text-4xl lg:text-5xl text-text-primary mb-4">
            Watch FundFlow AI{' '}
            <span className="gradient-text-cyan">Detect Fraud Live</span>
          </h2>
          <p className="text-text-secondary text-lg max-w-2xl mx-auto">
            Simulated real-time transaction feed showing ML scoring, risk classification, and SHAP explanations.
          </p>
        </div>

        {/* Demo panel */}
        <div ref={panelRef} className="demo-reveal panel-glow glass-card rounded-2xl overflow-hidden shadow-card border border-border-medium">
          {/* Top bar */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle bg-bg-secondary/50">
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/60" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                <div className="w-3 h-3 rounded-full bg-green-500/60" />
              </div>
              <span className="font-mono-custom text-sm text-text-secondary">FundFlow AI — Investigation Console v2.4</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${isRunning ? 'bg-accent-cyan live-dot' : 'bg-text-muted'}`} />
                <span className="font-mono-custom text-xs text-text-secondary">{isRunning ? 'LIVE FEED' : 'PAUSED'}</span>
              </div>
              <button
                onClick={() => setIsRunning(p => !p)}
                className="px-3 py-1.5 rounded-lg text-xs font-mono-custom font-semibold border border-border-subtle hover:border-accent-cyan/40 transition-colors text-text-secondary hover:text-accent-cyan"
              >
                {isRunning ? 'Pause' : 'Resume'}
              </button>
            </div>
          </div>

          {/* Stats strip */}
          <div className="grid grid-cols-4 gap-px bg-border-subtle">
            {[
              { label: 'Total Processed', value: stats.total, color: '#00D4FF' },
              { label: 'Blocked', value: stats.blocked, color: '#EF4444' },
              { label: 'Flagged', value: stats.flagged, color: '#F97316' },
              { label: 'Cleared', value: stats.cleared, color: '#22C55E' },
            ].map(s => (
              <div key={s.label} className="bg-bg-secondary px-4 py-3 text-center">
                <div className="font-mono-custom font-bold text-xl" style={{ color: s.color }}>{s.value}</div>
                <div className="text-text-muted text-xs mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="grid lg:grid-cols-5 divide-x divide-border-subtle">
            {/* Transaction list */}
            <div className="lg:col-span-2 overflow-hidden">
              <div className="px-4 py-3 border-b border-border-subtle">
                <span className="font-display font-semibold text-xs text-text-secondary uppercase tracking-wider">
                  Transaction Feed
                </span>
              </div>
              <div className="divide-y divide-border-subtle max-h-96 overflow-y-auto">
                {transactions.map((txn, i) => {
                  const cfg = statusConfig[txn.status];
                  return (
                    <button
                      key={txn.id + i}
                      onClick={() => setSelected(txn)}
                      className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-surface transition-colors duration-150 text-left ${
                        selected?.id === txn.id ? 'bg-surface' : ''
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 border ${cfg.bg}`}>
                        <Icon name={cfg.icon as "XCircleIcon"} size={16} className={cfg.color} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono-custom text-xs text-text-primary">{txn.id}</span>
                          <span className={`text-xs font-mono-custom font-bold ${cfg.color}`}>{txn.status}</span>
                        </div>
                        <div className="text-text-muted text-xs truncate">{txn.type} • {txn.time}</div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="font-mono-custom text-sm font-semibold text-text-primary">{formatAmount(txn.amount)}</div>
                        <div className={`text-xs font-mono-custom font-bold ${cfg.color}`}>{txn.risk}%</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Detail panel */}
            <div className="lg:col-span-3 p-6">
              {selected ? (
                <div className="space-y-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-display font-bold text-text-primary text-lg">{selected.id}</h3>
                      <p className="text-text-muted text-sm font-mono-custom">{selected.time} • {selected.type}</p>
                    </div>
                    <span className={`px-3 py-1.5 rounded-lg text-xs font-mono-custom font-bold border ${statusConfig[selected.status].bg} ${statusConfig[selected.status].color}`}>
                      {selected.status}
                    </span>
                  </div>

                  {/* Route */}
                  <div className="bg-bg-primary/50 rounded-xl p-4 flex items-center gap-3">
                    <div className="text-center">
                      <div className="text-xs text-text-muted mb-1">From</div>
                      <div className="font-mono-custom text-sm text-text-primary">{selected.from}</div>
                    </div>
                    <div className="flex-1 flex items-center justify-center">
                      <div className="flex-1 h-px bg-border-subtle relative">
                        <div
                          className="absolute top-1/2 left-0 h-1 rounded-full -translate-y-1/2 transition-all duration-1000"
                          style={{
                            width: `${selected.risk}%`,
                            background: selected.risk > 80 ? '#EF4444' : selected.risk > 55 ? '#F97316' : '#22C55E',
                          }}
                        />
                      </div>
                      <Icon name="ArrowRightIcon" size={16} className="text-text-muted mx-2" />
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-text-muted mb-1">To</div>
                      <div className="font-mono-custom text-sm text-text-primary">{selected.to}</div>
                    </div>
                  </div>

                  {/* Risk gauge */}
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-xs font-mono-custom text-text-secondary">Composite Risk Score</span>
                      <span className={`text-sm font-mono-custom font-bold ${statusConfig[selected.status].color}`}>
                        {selected.risk}%
                      </span>
                    </div>
                    <div className="h-3 bg-bg-primary rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${selected.risk}%`,
                          background: selected.risk > 80
                            ? 'linear-gradient(90deg, #EF4444, #DC2626)'
                            : selected.risk > 55
                            ? 'linear-gradient(90deg, #F97316, #EF4444)'
                            : 'linear-gradient(90deg, #22C55E, #16A34A)',
                        }}
                      />
                    </div>
                  </div>

                  {/* SHAP features */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs font-mono-custom font-semibold text-accent-violet uppercase tracking-wider">SHAP Feature Attribution</span>
                    </div>
                    <div className="space-y-2">
                      {selected.features.map(f => (
                        <div key={f.name} className="flex items-center gap-3">
                          <span className="text-xs font-mono-custom text-text-muted w-32 flex-shrink-0">{f.name}</span>
                          <div className="flex-1 h-2 bg-bg-primary rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${f.score * 100}%`,
                                background: f.score > 0.6
                                  ? 'linear-gradient(90deg, #EF4444, #F97316)'
                                  : 'linear-gradient(90deg, #22C55E, #00D4FF)',
                              }}
                            />
                          </div>
                          <span className="text-xs font-mono-custom text-text-secondary w-16 text-right">{f.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Amount */}
                  <div className="bg-bg-primary/50 rounded-xl p-4 flex items-center justify-between">
                    <span className="text-text-secondary text-sm">Transaction Amount</span>
                    <span className="font-mono-custom font-bold text-xl text-text-primary">{formatAmount(selected.amount)}</span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-text-muted text-sm">
                  Select a transaction to investigate
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}