import { useNavigate } from 'react-router-dom';



import React, { useEffect, useRef, useState } from 'react';

import Icon from '@/landing_legacy/components/ui/AppIcon';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  opacity: number;
}

interface Connection {
  from: number;
  to: number;
  opacity: number;
  isFraud: boolean;
}

export default function HeroSection() {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);
  const connectionsRef = useRef<Connection[]>([]);
  const mouseRef = useRef({ x: 0, y: 0 });
  const [mounted, setMounted] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const blob1Ref = useRef<HTMLDivElement>(null);
  const blob2Ref = useRef<HTMLDivElement>(null);
  const blob3Ref = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Trigger hero stagger animations on mount
  useEffect(() => {
    if (!mounted) return;
    const timer = setTimeout(() => {
      if (contentRef.current) {
        contentRef.current.classList.add('hero-animate-in');
      }
    }, 80);
    return () => clearTimeout(timer);
  }, [mounted]);

  // Parallax on scroll
  useEffect(() => {
    if (!mounted) return;
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const factor = scrollY * 0.0015;
      if (blob1Ref.current) {
        blob1Ref.current.style.transform = `translateY(${scrollY * 0.18}px) scale(${1 + factor})`;
      }
      if (blob2Ref.current) {
        blob2Ref.current.style.transform = `translateY(${scrollY * -0.12}px) scale(${1 + factor * 0.6})`;
      }
      if (blob3Ref.current) {
        blob3Ref.current.style.transform = `translateY(${scrollY * 0.08}px)`;
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      initParticles();
    };

    const initParticles = () => {
      const count = Math.floor((canvas.width * canvas.height) / 12000);
      particlesRef.current = Array.from({ length: count }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        radius: Math.random() * 2 + 1,
        opacity: Math.random() * 0.6 + 0.2,
      }));

      connectionsRef.current = [];
      const particles = particlesRef.current;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            connectionsRef.current.push({
              from: i, to: j,
              opacity: (1 - dist / 120) * 0.3,
              isFraud: Math.random() < 0.05,
            });
          }
        }
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const particles = particlesRef.current;

      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

        const dx = p.x - mouseRef.current.x;
        const dy = p.y - mouseRef.current.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 100) {
          p.vx += dx / dist * 0.02;
          p.vy += dy / dist * 0.02;
        }
      });

      connectionsRef.current.forEach(conn => {
        const a = particles[conn.from];
        const b = particles[conn.to];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 150) return;

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        if (conn.isFraud) {
          ctx.strokeStyle = `rgba(239,68,68,${conn.opacity * 0.8})`;
          ctx.lineWidth = 1;
        } else {
          ctx.strokeStyle = `rgba(0,212,255,${conn.opacity * (1 - dist / 150)})`;
          ctx.lineWidth = 0.5;
        }
        ctx.stroke();
      });

      particles.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,212,255,${p.opacity})`;
        ctx.fill();
      });

      animFrameRef.current = requestAnimationFrame(draw);
    };

    resize();
    draw();

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    window.addEventListener('resize', resize);
    canvas.addEventListener('mousemove', handleMouseMove);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('mousemove', handleMouseMove);
    };
  }, [mounted]);

  return (
    <section ref={sectionRef} className="relative min-h-screen flex items-center overflow-hidden bg-bg-primary pt-20">
      {/* Background blobs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          ref={blob1Ref}
          className="blob absolute w-[600px] h-[600px] opacity-20 parallax-slow"
          style={{ background: 'radial-gradient(circle, #00D4FF 0%, transparent 70%)', top: '-10%', left: '-5%' }}
        />
        <div
          ref={blob2Ref}
          className="blob absolute w-[500px] h-[500px] opacity-15 parallax-medium"
          style={{ background: 'radial-gradient(circle, #7C3AED 0%, transparent 70%)', bottom: '10%', right: '-5%', animationDelay: '-4s' }}
        />
        <div
          ref={blob3Ref}
          className="blob absolute w-[400px] h-[400px] opacity-10 parallax-fast"
          style={{ background: 'radial-gradient(circle, #00D4FF 0%, transparent 70%)', bottom: '30%', left: '40%', animationDelay: '-8s' }}
        />
      </div>

      {/* Particle canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ opacity: 0.6 }}
      />

      {/* Grid overlay */}
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: 'linear-gradient(rgba(0,212,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,0.3) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      <div ref={contentRef} className="relative z-10 w-full max-w-7xl mx-auto px-6 py-20">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left content */}
          <div className="space-y-8">
            {/* Badge */}
            <div className="hero-stagger-1 inline-flex items-center gap-2 px-4 py-2 rounded-full glass-card border animated-border text-sm font-mono-custom text-accent-cyan">
              <span className="w-2 h-2 rounded-full bg-accent-cyan live-dot" />
              <span>Live Fraud Detection Engine • AUC 0.9666</span>
            </div>

            {/* Headline */}
            <h1 className="hero-stagger-2 font-display text-5xl lg:text-6xl xl:text-7xl font-bold leading-[1.05] tracking-tight text-text-primary">
              Real-Time{' '}
              <span className="shimmer-text">Fraud Detection</span>
              <br />
              for Modern{' '}
              <span className="gradient-text-cyan">Banking</span>
            </h1>

            <p className="hero-stagger-3 text-text-secondary text-lg leading-relaxed max-w-lg font-body">
              XGBoost-powered AI with 48 engineered features, 6-layer composite risk scoring, and SHAP explainability — built natively for India Stack (UPI, KYC, PMLA).
            </p>

            {/* CTA Buttons */}
            <div className="hero-stagger-4 flex flex-wrap gap-4">
              <button className="btn-primary px-8 py-4 rounded-xl font-display font-semibold text-sm flex items-center gap-2">
                <Icon name="PlayCircleIcon" size={18} variant="solid" />
                Request Demo
              </button>
              <button onClick={() => navigate('/dashboard')} className="btn-secondary px-8 py-4 rounded-xl font-display font-semibold text-sm flex items-center gap-2">
                <Icon name="BeakerIcon" size={18} variant="outline" />
                View Live Simulation
                <Icon name="ArrowRightIcon" size={16} variant="outline" />
              </button>
            </div>

            {/* Trust row */}
            <div className="hero-stagger-5 flex flex-wrap items-center gap-6 pt-2">
              {[
                { label: 'RBI Compliant', icon: 'ShieldCheckIcon' },
                { label: 'PMLA Aligned', icon: 'DocumentCheckIcon' },
                { label: 'India Stack Native', icon: 'CpuChipIcon' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2 text-sm text-text-secondary">
                  <Icon name={item.icon as "ShieldCheckIcon"} size={16} className="text-accent-cyan" />
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Fraud detection UI mockup */}
          <div className="hero-stagger-6 relative">
            <FraudDetectionMockup />
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-text-muted text-xs">
        <span className="font-mono-custom">scroll</span>
        <div className="w-px h-8 bg-gradient-to-b from-accent-cyan to-transparent" />
      </div>
    </section>
  );
}

function FraudDetectionMockup() {
  const [transactions, setTransactions] = useState([
    { id: 'TXN-8821', amount: '₹2,45,000', risk: 94, label: 'CRITICAL', from: 'HDFC-****4821', to: 'SBI-****9920', flag: true },
    { id: 'TXN-8820', amount: '₹18,500', risk: 23, label: 'LOW', from: 'PNB-****2211', to: 'AXIS-****7731', flag: false },
    { id: 'TXN-8819', amount: '₹87,000', risk: 67, label: 'MEDIUM', from: 'BOI-****5512', to: 'ICICI-****8841', flag: false },
    { id: 'TXN-8818', amount: '₹5,12,000', risk: 88, label: 'HIGH', from: 'UCO-****3301', to: 'KOTAK-****2290', flag: true },
  ]);

  useEffect(() => {
    const interval = setInterval(() => {
      const newTxn = {
        id: `TXN-${Math.floor(8800 + Math.random() * 200)}`,
        amount: `₹${(Math.random() * 5).toFixed(2).replace('.', ',')}L`,
        risk: Math.floor(Math.random() * 100),
        label: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'][Math.floor(Math.random() * 4)],
        from: `BANK-****${Math.floor(1000 + Math.random() * 9000)}`,
        to: `BANK-****${Math.floor(1000 + Math.random() * 9000)}`,
        flag: Math.random() > 0.7,
      };
      setTransactions(prev => [newTxn, ...prev.slice(0, 3)]);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  const getRiskColor = (label: string) => {
    if (label === 'CRITICAL') return 'text-risk-critical';
    if (label === 'HIGH') return 'text-risk-high';
    if (label === 'MEDIUM') return 'text-risk-medium';
    return 'text-risk-low';
  };

  const getRiskBg = (label: string) => {
    if (label === 'CRITICAL') return 'risk-bg-critical';
    if (label === 'HIGH') return 'risk-bg-high';
    if (label === 'MEDIUM') return 'risk-bg-medium';
    return 'risk-bg-low';
  };

  return (
    <div className="glass-card rounded-2xl p-1 shadow-card animated-border">
      {/* Header bar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border-subtle">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500/60" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
          <div className="w-3 h-3 rounded-full bg-green-500/60" />
        </div>
        <div className="flex-1 text-center">
          <span className="font-mono-custom text-xs text-text-secondary">FundFlow AI — Transaction Monitor</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-accent-cyan live-dot" />
          <span className="font-mono-custom text-xs text-accent-cyan">LIVE</span>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-px bg-border-subtle m-4 rounded-xl overflow-hidden">
        {[
          { label: 'Transactions/sec', value: '2,847' },
          { label: 'Fraud Blocked', value: '₹1.2Cr' },
          { label: 'Avg Latency', value: '47ms' },
        ].map(stat => (
          <div key={stat.label} className="bg-bg-secondary px-3 py-2 text-center">
            <div className="font-display font-bold text-accent-cyan text-sm font-mono-custom">{stat.value}</div>
            <div className="text-text-muted text-xs mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Transaction feed */}
      <div className="px-4 pb-4 space-y-2">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-display font-semibold text-text-secondary uppercase tracking-wider">Live Transactions</span>
          <span className="text-xs font-mono-custom text-accent-cyan">↑ Real-time</span>
        </div>
        {transactions.map((txn, i) => (
          <div
            key={txn.id + i}
            className={`rounded-lg p-3 border flex items-center gap-3 transition-all duration-500 ${
              txn.flag ? 'fraud-alert' : 'bg-surface border-border-subtle'
            }`}
          >
            <div className="flex-shrink-0">
              {txn.flag ? (
                <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
                  <span className="text-red-400 text-xs">⚠</span>
                </div>
              ) : (
                <div className="w-8 h-8 rounded-full bg-accent-cyan/10 flex items-center justify-center">
                  <span className="text-accent-cyan text-xs">✓</span>
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono-custom text-xs text-text-primary">{txn.id}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded font-mono-custom font-semibold border ${getRiskBg(txn.label)} ${getRiskColor(txn.label)}`}>
                  {txn.label}
                </span>
              </div>
              <div className="text-text-muted text-xs truncate mt-0.5">{txn.from} → {txn.to}</div>
            </div>
            <div className="flex-shrink-0 text-right">
              <div className="font-mono-custom font-semibold text-sm text-text-primary">{txn.amount}</div>
              <div className={`text-xs font-mono-custom font-bold ${getRiskColor(txn.label)}`}>
                Risk: {txn.risk}%
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* SHAP bar */}
      <div className="mx-4 mb-4 glass-card rounded-xl p-3 border border-accent-violet/20">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs text-accent-violet font-display font-semibold">SHAP Explanation — TXN-8821</span>
          <span className="text-xs font-mono-custom text-text-muted">Risk: 94%</span>
        </div>
        {[
          { feature: 'Velocity (1h)', contribution: 0.82, positive: true },
          { feature: 'New Beneficiary', contribution: 0.71, positive: true },
          { feature: 'Geo Anomaly', contribution: 0.65, positive: true },
          { feature: 'Account Age', contribution: -0.23, positive: false },
        ].map(f => (
          <div key={f.feature} className="flex items-center gap-2 mb-1.5">
            <span className="text-xs text-text-muted w-28 flex-shrink-0 font-mono-custom">{f.feature}</span>
            <div className="flex-1 h-2 rounded-full bg-border-subtle overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.abs(f.contribution) * 100}%`,
                  background: f.positive ? 'linear-gradient(90deg, #EF4444, #F97316)' : 'linear-gradient(90deg, #22C55E, #00D4FF)',
                }}
              />
            </div>
            <span className={`text-xs font-mono-custom font-semibold w-10 text-right ${f.positive ? 'text-risk-high' : 'text-risk-low'}`}>
              {f.positive ? '+' : ''}{f.contribution.toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}