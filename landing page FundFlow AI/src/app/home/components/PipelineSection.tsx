'use client';

import React, { useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/AppIcon';

interface PipelineStep {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  color: string;
  detail: string;
}

const steps: PipelineStep[] = [
  {
    id: 'transaction',
    icon: 'ArrowUpCircleIcon',
    title: 'Transaction Ingestion',
    subtitle: 'UPI / NEFT / RTGS',
    color: '#00D4FF',
    detail: 'WebSocket stream',
  },
  {
    id: 'ml-scoring',
    icon: 'CpuChipIcon',
    title: 'ML Scoring',
    subtitle: 'XGBoost + 48 Features',
    color: '#7C3AED',
    detail: 'AUC 0.9666',
  },
  {
    id: 'risk-engine',
    icon: 'ChartBarIcon',
    title: 'Risk Engine',
    subtitle: '6-Layer Composite',
    color: '#00D4FF',
    detail: 'Velocity + Behavior',
  },
  {
    id: 'graph-analysis',
    icon: 'ShareIcon',
    title: 'Graph Analysis',
    subtitle: 'Network Traversal',
    color: '#7C3AED',
    detail: 'Mule detection',
  },
  {
    id: 'alert',
    icon: 'BellAlertIcon',
    title: 'Alert & Action',
    subtitle: 'Block / Investigate',
    color: '#EF4444',
    detail: 'SHAP explained',
  },
];

export default function PipelineSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true); },
      { threshold: 0.2 }
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!inView) return;
    const interval = setInterval(() => {
      setActiveStep(prev => (prev + 1) % steps.length);
    }, 1800);
    return () => clearInterval(interval);
  }, [inView]);

  return (
    <section id="how-it-works" ref={sectionRef} className="relative py-24 bg-bg-secondary overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute w-full h-px bg-gradient-to-r from-transparent via-accent-cyan/20 to-transparent top-0" />
        <div className="absolute w-full h-px bg-gradient-to-r from-transparent via-accent-violet/20 to-transparent bottom-0" />
      </div>

      <div className="max-w-7xl mx-auto px-6">
        {/* Header */}
        <div className="text-center mb-16">
          <span className="inline-block text-xs font-mono-custom font-semibold text-accent-violet uppercase tracking-widest mb-4 px-3 py-1 rounded-full border border-accent-violet/20 bg-accent-violet/5">
            Detection Pipeline
          </span>
          <h2 className="font-display font-bold text-4xl lg:text-5xl text-text-primary mb-4">
            From Transaction to{' '}
            <span className="gradient-text-cyan">Decision in 47ms</span>
          </h2>
          <p className="text-text-secondary text-lg max-w-2xl mx-auto">
            Every transaction passes through a five-stage intelligence pipeline before settlement is approved.
          </p>
        </div>

        {/* Desktop pipeline */}
        <div className="hidden lg:block">
          <div className="relative flex items-center justify-between gap-4">
            {/* Connecting line */}
            <div className="absolute top-1/2 left-0 right-0 h-px bg-border-subtle -translate-y-1/2 z-0">
              <div
                className="h-full bg-gradient-to-r from-accent-cyan to-accent-violet transition-all duration-300"
                style={{ width: `${(activeStep / (steps.length - 1)) * 100}%` }}
              />
            </div>

            {steps.map((step, i) => (
              <div
                key={step.id}
                className="relative z-10 flex flex-col items-center gap-3 flex-1 cursor-pointer"
                onClick={() => setActiveStep(i)}
              >
                {/* Node */}
                <div
                  className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-500 ${
                    i <= activeStep
                      ? 'shadow-glow-cyan scale-110'
                      : 'opacity-50'
                  }`}
                  style={{
                    background: i <= activeStep
                      ? `linear-gradient(135deg, ${step.color}30, ${step.color}10)`
                      : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${i <= activeStep ? step.color + '60' : 'rgba(255,255,255,0.08)'}`,
                    boxShadow: i === activeStep ? `0 0 20px ${step.color}40` : undefined,
                  }}
                >
                  <Icon
                    name={step.icon as "ArrowUpCircleIcon"}
                    size={28}
                    style={{ color: i <= activeStep ? step.color : '#4B5563' } as React.CSSProperties}
                  />
                  {i === activeStep && (
                    <div
                      className="absolute inset-0 rounded-2xl node-pulse"
                      style={{ border: `1px solid ${step.color}40` }}
                    />
                  )}
                </div>

                {/* Label */}
                <div className="text-center">
                  <div className={`font-display font-semibold text-sm mb-1 transition-colors duration-300 ${
                    i === activeStep ? 'text-text-primary' : 'text-text-secondary'
                  }`}>
                    {step.title}
                  </div>
                  <div className="text-text-muted text-xs font-mono-custom">{step.subtitle}</div>
                  <div
                    className={`text-xs font-mono-custom mt-1 transition-all duration-300 ${
                      i === activeStep ? 'opacity-100' : 'opacity-0'
                    }`}
                    style={{ color: step.color }}
                  >
                    {step.detail}
                  </div>
                </div>

                {/* Step number */}
                <div
                  className={`absolute -top-3 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs font-mono-custom font-bold transition-all duration-300 ${
                    i <= activeStep ? 'opacity-100' : 'opacity-30'
                  }`}
                  style={{ background: step.color, color: '#0A0F1E' }}
                >
                  {i + 1}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Mobile pipeline (vertical) */}
        <div className="lg:hidden space-y-4">
          {steps.map((step, i) => (
            <div
              key={step.id}
              className={`glass-card rounded-xl p-4 flex items-center gap-4 transition-all duration-500 ${
                i === activeStep ? 'border-opacity-100' : 'opacity-60'
              }`}
              style={{ borderColor: i <= activeStep ? step.color + '40' : undefined }}
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: `${step.color}15`, border: `1px solid ${step.color}30` }}
              >
                <Icon name={step.icon as "ArrowUpCircleIcon"} size={22} style={{ color: step.color } as React.CSSProperties} />
              </div>
              <div>
                <div className="font-display font-semibold text-sm text-text-primary">{step.title}</div>
                <div className="text-text-muted text-xs font-mono-custom">{step.subtitle}</div>
              </div>
              <div className="ml-auto">
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono-custom font-bold"
                  style={{ background: step.color, color: '#0A0F1E' }}>
                  {i + 1}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Active step detail card */}
        <div className="mt-12 glass-card rounded-2xl p-6 lg:p-8 border-accent-cyan/20 border shadow-card">
          <div className="flex items-center gap-4 mb-4">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{
                background: `${steps[activeStep].color}15`,
                border: `1px solid ${steps[activeStep].color}30`,
              }}
            >
              <Icon name={steps[activeStep].icon as "ArrowUpCircleIcon"} size={20} style={{ color: steps[activeStep].color } as React.CSSProperties} />
            </div>
            <div>
              <h3 className="font-display font-bold text-text-primary">{steps[activeStep].title}</h3>
              <span className="text-xs font-mono-custom" style={{ color: steps[activeStep].color }}>
                Step {activeStep + 1} of {steps.length} • {steps[activeStep].detail}
              </span>
            </div>
            <div className="ml-auto flex gap-1">
              {steps.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActiveStep(i)}
                  className="w-2 h-2 rounded-full transition-all duration-300"
                  style={{
                    background: i === activeStep ? steps[activeStep].color : 'rgba(255,255,255,0.2)',
                    transform: i === activeStep ? 'scale(1.4)' : 'scale(1)',
                  }}
                />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Input', value: steps[activeStep].subtitle },
              { label: 'Processing', value: steps[activeStep].detail },
              { label: 'Output', value: steps[(activeStep + 1) % steps.length].subtitle },
            ].map(item => (
              <div key={item.label} className="bg-bg-primary/50 rounded-xl p-3 text-center">
                <div className="text-text-muted text-xs mb-1 uppercase tracking-wider font-mono-custom">{item.label}</div>
                <div className="text-text-primary text-sm font-mono-custom font-semibold">{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}