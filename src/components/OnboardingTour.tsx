'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Play, RefreshCw, ChevronRight, ChevronLeft } from 'lucide-react';

const STORAGE_KEY = 'lifecycle-onboarding-done';

const STEPS = [
  {
    icon: MessageSquare,
    title: 'Describe your workflow',
    description:
      'Tell CID what you want to build. Describe your workflow in natural language \u2014 CID will generate a visual graph with nodes and connections.',
  },
  {
    icon: Play,
    title: 'Watch it build',
    description:
      'Your workflow appears as an interactive graph. Execute it to generate content for each node. Watch the lifecycle unfold in real-time.',
  },
  {
    icon: RefreshCw,
    title: 'Edit and stay in sync',
    description:
      'Edit any node \u2014 downstream nodes automatically know they need updating. Click \u2018Refresh stale\u2019 to regenerate only what changed. Your workflow stays alive.',
  },
];

export function resetOnboardingTour() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('lifecycle-show-tour'));
  }
}

export default function OnboardingTour() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const done = localStorage.getItem(STORAGE_KEY);
    if (!done) setVisible(true);

    const handler = () => {
      setStep(0);
      setVisible(true);
    };
    window.addEventListener('lifecycle-show-tour', handler);
    return () => window.removeEventListener('lifecycle-show-tour', handler);
  }, []);

  const close = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setVisible(false);
  }, []);

  if (!visible) return null;

  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="onboarding-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 350, damping: 30 }}
              className="bg-[#1a1a2e] rounded-xl max-w-md w-full mx-4 p-8 shadow-2xl border border-white/[0.06] relative"
            >
              {/* Icon */}
              <div className="flex justify-center mb-6">
                <div className="w-14 h-14 rounded-full bg-white/[0.06] border border-white/[0.08] flex items-center justify-center">
                  <Icon size={26} className="text-cyan-400" />
                </div>
              </div>

              {/* Title */}
              <h2 className="text-lg font-semibold text-white text-center mb-3">
                {current.title}
              </h2>

              {/* Description */}
              <p className="text-sm text-white/60 text-center leading-relaxed mb-8">
                {current.description}
              </p>

              {/* Step dots */}
              <div className="flex justify-center gap-2 mb-6">
                {STEPS.map((_, i) => (
                  <div
                    key={i}
                    className={`w-2 h-2 rounded-full transition-all duration-300 ${
                      i === step
                        ? 'bg-cyan-400 w-6'
                        : i < step
                          ? 'bg-cyan-400/40'
                          : 'bg-white/15'
                    }`}
                  />
                ))}
              </div>

              {/* Navigation */}
              <div className="flex items-center justify-between">
                {step > 0 ? (
                  <button
                    onClick={() => setStep(s => s - 1)}
                    className="flex items-center gap-1 text-xs text-white/40 hover:text-white/70 transition-colors"
                  >
                    <ChevronLeft size={14} />
                    Back
                  </button>
                ) : (
                  <div />
                )}

                <button
                  onClick={() => {
                    if (isLast) {
                      close();
                    } else {
                      setStep(s => s + 1);
                    }
                  }}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-cyan-500/20 text-cyan-300 text-sm font-medium hover:bg-cyan-500/30 transition-colors border border-cyan-500/20"
                >
                  {isLast ? 'Get Started' : 'Next'}
                  {!isLast && <ChevronRight size={14} />}
                </button>
              </div>

              {/* Skip tour */}
              <div className="flex justify-center mt-4">
                <button
                  onClick={close}
                  className="text-[11px] text-white/25 hover:text-white/50 transition-colors"
                >
                  Skip tour
                </button>
              </div>
            </motion.div>
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
