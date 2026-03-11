'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle2, Info, AlertTriangle, XCircle } from 'lucide-react';
import TopBar from '@/components/TopBar';
import Canvas from '@/components/Canvas';
import PreviewPanel from '@/components/PreviewPanel';
import ErrorBoundary from '@/components/ErrorBoundary';
import OnboardingTour from '@/components/OnboardingTour';
import { useLifecycleStore } from '@/store/useStore';

const TOAST_ICONS = {
  success: { icon: CheckCircle2, color: 'text-emerald-400', border: 'border-emerald-500/20', bg: 'bg-emerald-500/[0.08]' },
  info: { icon: Info, color: 'text-cyan-400', border: 'border-cyan-500/20', bg: 'bg-cyan-500/[0.08]' },
  warning: { icon: AlertTriangle, color: 'text-amber-400', border: 'border-amber-500/20', bg: 'bg-amber-500/[0.08]' },
  error: { icon: XCircle, color: 'text-red-400', border: 'border-red-500/20', bg: 'bg-red-500/[0.08]' },
};

function Toasts() {
  const toasts = useLifecycleStore(s => s.toasts);
  const removeToast = useLifecycleStore(s => s.removeToast);

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 items-center pointer-events-none" role="alert" aria-live="polite">
      <AnimatePresence>
        {toasts.map(toast => {
          const style = TOAST_ICONS[toast.type];
          const Icon = style.icon;
          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: 24, scale: 0.9, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, x: 40, scale: 0.95, filter: 'blur(2px)', transition: { duration: 0.15 } }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className={`pointer-events-auto flex items-center gap-2.5 px-4 py-2.5 rounded-xl border ${style.border} ${style.bg} backdrop-blur-xl shadow-2xl`}
            >
              <Icon size={14} className={style.color} />
              <span className="text-[12px] text-white/80">{toast.message}</span>
              <button onClick={() => removeToast(toast.id)} className="text-white/20 hover:text-white/50 ml-1">
                <X size={12} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export default function Home() {
  return (
    <ErrorBoundary>
      <div className="h-screen w-screen flex flex-col bg-[#08080d] overflow-hidden relative">
        {/* Ambient background glows */}
        <div className="ambient-glow absolute inset-0" />
        <div className="relative z-10 flex flex-col h-full w-full">
          <TopBar />
          <Canvas />
          <PreviewPanel />
        </div>
        <Toasts />
        <OnboardingTour />
      </div>
    </ErrorBoundary>
  );
}
