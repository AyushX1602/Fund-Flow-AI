import React, { useEffect, useRef, useState } from 'react';

interface Section {
  id: string;
  label: string;
}

const sections: Section[] = [
  { id: 'hero', label: 'Home' },
  { id: 'stats', label: 'Stats' },
  { id: 'features', label: 'Features' },
  { id: 'how-it-works', label: 'How It Works' },
  { id: 'demo', label: 'Demo' },
  { id: 'why', label: 'Why Us' },
  { id: 'cta', label: 'Get Started' },
];

export default function SectionAnchorNav() {
  const [activeId, setActiveId] = useState<string>('hero');
  const [visible, setVisible] = useState(false);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Show nav after scrolling past hero
    const heroEl = document.getElementById('hero');
    const onScroll = () => {
      const heroBottom = heroEl ? heroEl.getBoundingClientRect().bottom : 0;
      setVisible(heroBottom < 80);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const observers: IntersectionObserver[] = [];

    sections.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (!el) return;
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setActiveId(id);
          }
        },
        { rootMargin: '-40% 0px -55% 0px', threshold: 0 }
      );
      observer.observe(el);
      observers.push(observer);
    });

    return () => observers.forEach(o => o.disconnect());
  }, []);

  // Move indicator pill to active item
  useEffect(() => {
    if (!navRef.current || !indicatorRef.current) return;
    const activeEl = navRef.current.querySelector<HTMLElement>(`[data-id="${activeId}"]`);
    if (!activeEl) return;
    const navRect = navRef.current.getBoundingClientRect();
    const elRect = activeEl.getBoundingClientRect();
    indicatorRef.current.style.left = `${elRect.left - navRect.left}px`;
    indicatorRef.current.style.width = `${elRect.width}px`;
  }, [activeId]);

  const handleClick = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const offset = 88; // header height
    const top = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: 'smooth' });
  };

  return (
    <div
      className={`hidden md:flex fixed left-1/2 z-40 transition-all duration-500 ease-out ${
        visible ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 -translate-y-4 pointer-events-none'
      }`}
      style={{
        top: '76px',
        transform: `translateX(-50%) ${visible ? 'translateY(0)' : 'translateY(-1rem)'}`,
      }}
    >
      <div
        ref={navRef}
        className="relative flex items-center gap-1 px-2 py-1.5 rounded-2xl border border-border-subtle backdrop-blur-xl shadow-card"
        style={{ background: 'color-mix(in srgb, var(--bg-secondary) 85%, transparent)' }}
      >
        {/* Sliding background indicator */}
        <div
          ref={indicatorRef}
          className="absolute top-1.5 h-[calc(100%-12px)] rounded-xl transition-all duration-300 ease-out pointer-events-none"
          style={{
            background: 'linear-gradient(135deg, rgba(0,212,255,0.18) 0%, rgba(124,58,237,0.18) 100%)',
            border: '1px solid rgba(0,212,255,0.25)',
          }}
        />

        {sections.map(({ id, label }) => (
          <button
            key={id}
            data-id={id}
            onClick={() => handleClick(id)}
            className={`relative z-10 px-3.5 py-1.5 rounded-xl text-xs font-display font-semibold tracking-wide transition-all duration-200 whitespace-nowrap ${
              activeId === id
                ? 'text-text-primary' :'text-text-secondary hover:text-text-primary'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
