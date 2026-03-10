'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, X, Bot, Edit3, RefreshCw, CheckCircle2, Lock,
  Zap, AlertTriangle, ArrowRight, Plus, ChevronUp, ChevronDown,
} from 'lucide-react';
import { useLifecycleStore } from '@/store/useStore';
import type { LifecycleEvent } from '@/lib/types';
import { relativeTime } from '@/lib/types';

const EVENT_CONFIG: Record<LifecycleEvent['type'], { icon: React.ElementType; color: string; label: string }> = {
  created: { icon: Plus, color: '#22c55e', label: 'Created' },
  edited: { icon: Edit3, color: '#3b82f6', label: 'Edited' },
  regenerated: { icon: RefreshCw, color: '#06b6d4', label: 'Regen' },
  approved: { icon: CheckCircle2, color: '#10b981', label: 'Approved' },
  locked: { icon: Lock, color: '#94a3b8', label: 'Locked' },
  optimized: { icon: Zap, color: '#8b5cf6', label: 'Optimized' },
  refined: { icon: Bot, color: '#10b981', label: 'Refined' },
  propagated: { icon: ArrowRight, color: '#6366f1', label: 'Propagated' },
  stale: { icon: AlertTriangle, color: '#f59e0b', label: 'Stale' },
};

type EventType = LifecycleEvent['type'];

export default function ActivityPanel() {
  const { events, showActivityPanel, toggleActivityPanel, selectNode } = useLifecycleStore();
  const [expanded, setExpanded] = useState(false);
  const [activeFilters, setActiveFilters] = useState<Set<EventType>>(new Set());

  if (!showActivityPanel) return null;

  // Get unique event types present in events
  const presentTypes = Array.from(new Set(events.map((e) => e.type)));

  const toggleFilter = (type: EventType) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const filteredEvents = activeFilters.size === 0
    ? events
    : events.filter((e) => activeFilters.has(e.type));

  const visibleEvents = expanded ? filteredEvents : filteredEvents.slice(0, 4);

  return (
    <motion.div
      initial={{ y: 200, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 200, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="absolute bottom-4 left-4 w-[300px] rounded-xl border border-white/[0.06] bg-[#0a0a12]/90 backdrop-blur-2xl overflow-hidden z-20"
      style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.5), 0 0 1px rgba(255,255,255,0.05)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-white/[0.05]">
        <div className="flex items-center gap-2">
          <Activity size={12} className="text-cyan-400" />
          <span className="text-[11px] font-semibold text-white/70">Activity</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400/80 font-medium">
            {filteredEvents.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-5 h-5 rounded flex items-center justify-center text-white/25 hover:text-white/50 transition-colors"
          >
            {expanded ? <ChevronDown size={11} /> : <ChevronUp size={11} />}
          </button>
          <button
            onClick={toggleActivityPanel}
            className="w-5 h-5 rounded flex items-center justify-center text-white/25 hover:text-white/50 transition-colors"
          >
            <X size={11} />
          </button>
        </div>
      </div>

      {/* Filter chips */}
      {presentTypes.length > 1 && (
        <div className="flex flex-wrap gap-1 px-3 py-2 border-b border-white/[0.04]">
          {presentTypes.map((type) => {
            const config = EVENT_CONFIG[type];
            const isActive = activeFilters.has(type);
            return (
              <button
                key={type}
                onClick={() => toggleFilter(type)}
                className="flex items-center gap-1 px-1.5 py-[3px] rounded text-[9px] font-medium transition-all"
                style={{
                  background: isActive ? `${config.color}20` : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${isActive ? `${config.color}40` : 'rgba(255,255,255,0.06)'}`,
                  color: isActive ? config.color : 'rgba(255,255,255,0.35)',
                }}
              >
                {config.label}
              </button>
            );
          })}
          {activeFilters.size > 0 && (
            <button
              onClick={() => setActiveFilters(new Set())}
              className="flex items-center gap-1 px-1.5 py-[3px] rounded text-[9px] font-medium text-white/25 hover:text-white/50 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Events — grouped by time */}
      <div className={`overflow-y-auto scrollbar-thin ${expanded ? 'max-h-[280px]' : 'max-h-[200px]'}`}>
        <AnimatePresence>
          {visibleEvents.length === 0 && (
            <div className="px-3.5 py-4 text-center text-[10px] text-white/30">No matching events</div>
          )}
          {(() => {
            const now = Date.now();
            const groups: { label: string; events: typeof visibleEvents }[] = [];
            const recent: typeof visibleEvents = [];
            const lastHour: typeof visibleEvents = [];
            const earlier: typeof visibleEvents = [];
            for (const ev of visibleEvents) {
              const age = now - ev.timestamp;
              if (age < 60_000) recent.push(ev);
              else if (age < 3_600_000) lastHour.push(ev);
              else earlier.push(ev);
            }
            if (recent.length > 0) groups.push({ label: 'Just now', events: recent });
            if (lastHour.length > 0) groups.push({ label: 'Last hour', events: lastHour });
            if (earlier.length > 0) groups.push({ label: 'Earlier', events: earlier });
            // If all in one group, skip header
            if (groups.length <= 1) {
              return visibleEvents.map((event, i) => {
                const config = EVENT_CONFIG[event.type];
                const Icon = config.icon;
                return (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.02 }}
                    onClick={() => event.nodeId && selectNode(event.nodeId)}
                    className="flex items-center gap-2.5 px-3.5 py-2 hover:bg-white/[0.02] cursor-pointer transition-colors border-b border-white/[0.025] last:border-0"
                  >
                    <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${config.color}12` }}>
                      <Icon size={10} style={{ color: config.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10.5px] text-white/45 leading-snug truncate">{event.message}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {event.agent && <span className="text-[7px] px-1 py-px rounded bg-emerald-500/10 text-emerald-400/70 font-medium">CID</span>}
                      <span className="text-[9px] text-white/30">{relativeTime(event.timestamp)}</span>
                    </div>
                  </motion.div>
                );
              });
            }
            let globalIdx = 0;
            return groups.map(g => (
              <div key={g.label}>
                <div className="px-3.5 py-1 text-[8px] text-white/30 uppercase tracking-wider font-medium bg-white/[0.01] border-b border-white/[0.03]">
                  {g.label}
                </div>
                {g.events.map(event => {
                  const config = EVENT_CONFIG[event.type];
                  const Icon = config.icon;
                  const idx = globalIdx++;
                  return (
                    <motion.div
                      key={event.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.02 }}
                      onClick={() => event.nodeId && selectNode(event.nodeId)}
                      className="flex items-center gap-2.5 px-3.5 py-2 hover:bg-white/[0.02] cursor-pointer transition-colors border-b border-white/[0.025] last:border-0"
                    >
                      <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${config.color}12` }}>
                        <Icon size={10} style={{ color: config.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10.5px] text-white/45 leading-snug truncate">{event.message}</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {event.agent && <span className="text-[7px] px-1 py-px rounded bg-emerald-500/10 text-emerald-400/70 font-medium">CID</span>}
                        <span className="text-[9px] text-white/30">{relativeTime(event.timestamp)}</span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            ));
          })()}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
