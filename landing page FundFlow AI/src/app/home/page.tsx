import React from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import SectionAnchorNav from '@/components/SectionAnchorNav';
import HeroSection from './components/HeroSection';
import StatsBar from './components/StatsBar';
import FeaturesSection from './components/FeaturesSection';
import PipelineSection from './components/PipelineSection';
import DemoSection from './components/DemoSection';
import CTASection from './components/CTASection';

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-x-hidden" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--foreground)' }}>
      <Header />
      <SectionAnchorNav />
      <section id="hero"><HeroSection /></section>
      <section id="stats"><StatsBar /></section>
      <section id="features"><FeaturesSection /></section>
      <section id="how-it-works"><PipelineSection /></section>
      <section id="demo"><DemoSection /></section>
      <section id="why"><CTASection /></section>
      <section id="cta">
        <div style={{ height: 0 }} />
      </section>
      <Footer />
    </main>
  );
}