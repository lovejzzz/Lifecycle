'use client';

import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Copy, Trash2, Lock, Unlock, RefreshCw, CheckCircle2,
  AlertTriangle, Eye, Bot, FileText,
} from 'lucide-react';
import { useLifecycleStore } from '@/store/useStore';

export default function NodeContextMenu() {
  const {
    contextMenu, closeContextMenu, nodes,
    deleteNode, lockNode, approveNode, updateNodeStatus, duplicateNode, addEvent,
    askCIDAboutNode, generateNodeContent,
  } = useLifecycleStore();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as HTMLElement)) {
        closeContextMenu();
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [closeContextMenu]);

  if (!contextMenu) return null;

  const node = nodes.find((n) => n.id === contextMenu.nodeId);
  if (!node) return null;

  const { data } = node;

  const items: { label: string; icon: React.ElementType; action: () => void; color?: string; show: boolean }[] = [
    {
      label: 'Ask CID',
      icon: Bot,
      action: () => { askCIDAboutNode(node.id); closeContextMenu(); },
      color: '#10b981',
      show: true,
    },
    {
      label: 'Generate Content',
      icon: FileText,
      action: () => { generateNodeContent(node.id); closeContextMenu(); },
      color: '#06b6d4',
      show: !data.content || data.content.length < 50,
    },
    {
      label: 'Duplicate',
      icon: Copy,
      action: () => { duplicateNode(node.id); closeContextMenu(); },
      show: true,
    },
    {
      label: 'Regenerate',
      icon: RefreshCw,
      action: () => {
        updateNodeStatus(node.id, 'generating');
        addEvent({ id: `ev-${Date.now()}`, type: 'regenerated', message: `Regenerating ${data.label}...`, timestamp: Date.now(), nodeId: node.id, agent: true });
        setTimeout(() => {
          updateNodeStatus(node.id, 'active');
          addEvent({ id: `ev-${Date.now()}`, type: 'regenerated', message: `${data.label} regenerated`, timestamp: Date.now(), nodeId: node.id, agent: true });
        }, 2000);
        closeContextMenu();
      },
      color: '#06b6d4',
      show: data.status === 'stale',
    },
    {
      label: 'Approve',
      icon: CheckCircle2,
      action: () => { approveNode(node.id); closeContextMenu(); },
      color: '#10b981',
      show: data.status === 'reviewing',
    },
    {
      label: 'Mark Stale',
      icon: AlertTriangle,
      action: () => {
        updateNodeStatus(node.id, 'stale');
        addEvent({ id: `ev-${Date.now()}`, type: 'stale', message: `${data.label} marked stale`, timestamp: Date.now(), nodeId: node.id });
        closeContextMenu();
      },
      color: '#f59e0b',
      show: data.status === 'active',
    },
    {
      label: 'Set Reviewing',
      icon: Eye,
      action: () => {
        updateNodeStatus(node.id, 'reviewing');
        closeContextMenu();
      },
      color: '#f43f5e',
      show: data.status === 'active',
    },
    {
      label: 'Lock',
      icon: Lock,
      action: () => { lockNode(node.id); closeContextMenu(); },
      show: !data.locked && data.status !== 'generating',
    },
    {
      label: 'Unlock',
      icon: Unlock,
      action: () => { updateNodeStatus(node.id, 'active'); closeContextMenu(); },
      show: !!data.locked,
    },
    {
      label: 'Delete',
      icon: Trash2,
      action: () => { deleteNode(node.id); closeContextMenu(); },
      color: '#f43f5e',
      show: true,
    },
  ];

  const visible = items.filter((i) => i.show);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.12 }}
      className="fixed z-50 min-w-[160px] rounded-xl border border-white/[0.08] bg-[#0e0e18]/95 backdrop-blur-xl overflow-hidden shadow-2xl"
      style={{ left: contextMenu.x, top: contextMenu.y }}
    >
      <div className="px-3 py-1.5 border-b border-white/[0.05]">
        <span className="text-[10px] text-white/30 uppercase tracking-wider">{data.label}</span>
      </div>
      <div className="py-1">
        {visible.map((item) => (
          <button
            key={item.label}
            onClick={item.action}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[11px] text-white/60 hover:text-white/90 hover:bg-white/[0.05] transition-colors"
          >
            <item.icon size={12} style={item.color ? { color: item.color } : undefined} />
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </motion.div>
  );
}
