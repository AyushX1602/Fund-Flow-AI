import React from 'react';
import Header from '@/landing_legacy/components/Header';
import Footer from '@/landing_legacy/components/Footer';

import HeroSection from '@/landing_legacy/app/home/components/HeroSection';
import StatsBar from '@/landing_legacy/app/home/components/StatsBar';
import FeaturesSection from '@/landing_legacy/app/home/components/FeaturesSection';
import PipelineSection from '@/landing_legacy/app/home/components/PipelineSection';
import DemoSection from '@/landing_legacy/app/home/components/DemoSection';
import CTASection from '@/landing_legacy/app/home/components/CTASection';
import { ThemeProvider } from '@/landing_legacy/context/ThemeContext';
import '@/landing_legacy/styles/tailwind.css';

export default function LandingPage() {
  return (
    <ThemeProvider>
      <div className="landing-page landing-page-container min-h-screen overflow-x-hidden">
        <Header />
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
      </div>
    </ThemeProvider>
  );
}
