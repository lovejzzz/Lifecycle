/**
 * UI Slice — selection, panels, toasts, context menu, search, breadcrumbs, fit view.
 * Pure UI state with minimal cross-slice dependencies.
 */

import type { StateCreator } from 'zustand';
import type { LifecycleStore } from '../types';

export interface UISlice {
  // Selection
  selectedNodeId: string | null;
  multiSelectedIds: Set<string>;
  selectNode: (id: string | null) => void;
  toggleMultiSelect: (id: string) => void;
  clearMultiSelect: () => void;

  // Panels
  showCIDPanel: boolean;
  showPreviewPanel: boolean;
  toggleCIDPanel: () => void;
  togglePreviewPanel: () => void;

  // Context menu
  contextMenu: { nodeId: string; x: number; y: number } | null;
  openContextMenu: (nodeId: string, x: number, y: number) => void;
  closeContextMenu: () => void;

  // Search
  searchQuery: string;
  setSearchQuery: (q: string) => void;

  // Edge label picker
  pendingEdge: { edgeId: string; x: number; y: number } | null;
  setPendingEdge: (pending: { edgeId: string; x: number; y: number } | null) => void;

  // Toasts
  toasts: Array<{ id: string; message: string; type: 'success' | 'info' | 'warning' | 'error' }>;
  addToast: (
    message: string,
    type?: 'success' | 'info' | 'warning' | 'error',
    autoDismissMs?: number,
  ) => void;
  removeToast: (id: string) => void;

  // Auto-save indicator
  lastSavedAt: number;

  // Breadcrumbs
  breadcrumbs: string[];
  addBreadcrumb: (nodeId: string) => void;
  clearBreadcrumbs: () => void;

  // Fit view trigger
  fitViewCounter: number;
  requestFitView: () => void;

  // Pinned messages
  pinnedMessageIds: Set<string>;
  togglePinMessage: (id: string) => void;
}

export const createUISlice: StateCreator<LifecycleStore, [], [], UISlice> = (set, get) => ({
  // Selection
  selectedNodeId: null,
  multiSelectedIds: new Set<string>(),
  selectNode: (id) => {
    set({ selectedNodeId: id, multiSelectedIds: new Set() });
    if (id) get().addBreadcrumb(id);
  },
  toggleMultiSelect: (id) =>
    set((s) => {
      const next = new Set(s.multiSelectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { multiSelectedIds: next, selectedNodeId: id };
    }),
  clearMultiSelect: () => set({ multiSelectedIds: new Set() }),

  // Panels
  showCIDPanel: true,
  showPreviewPanel: false,
  toggleCIDPanel: () => set((s) => ({ showCIDPanel: !s.showCIDPanel })),
  togglePreviewPanel: () => set((s) => ({ showPreviewPanel: !s.showPreviewPanel })),

  // Context menu
  contextMenu: null,
  openContextMenu: (nodeId, x, y) => set({ contextMenu: { nodeId, x, y }, selectedNodeId: nodeId }),
  closeContextMenu: () => set({ contextMenu: null }),

  // Search
  searchQuery: '',
  setSearchQuery: (q) => set({ searchQuery: q }),

  // Edge label picker
  pendingEdge: null,
  setPendingEdge: (pending) => set({ pendingEdge: pending }),

  // Toasts
  toasts: [],
  addToast: (message, type = 'info', autoDismissMs) => {
    const id = `toast-${Date.now()}`;
    const dismissMs = autoDismissMs ?? (type === 'error' ? 8000 : 3500);
    set((s) => ({ toasts: [...s.toasts.slice(-4), { id, message, type }] }));
    if (dismissMs > 0) {
      setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
      }, dismissMs);
    }
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  // Auto-save
  lastSavedAt: 0,

  // Breadcrumbs
  breadcrumbs: [],
  addBreadcrumb: (nodeId: string) => {
    set((s) => {
      const filtered = s.breadcrumbs.filter((id) => id !== nodeId);
      return { breadcrumbs: [...filtered, nodeId].slice(-8) };
    });
  },
  clearBreadcrumbs: () => set({ breadcrumbs: [] }),

  // Fit view
  fitViewCounter: 0,
  requestFitView: () => set((s) => ({ fitViewCounter: s.fitViewCounter + 1 })),

  // Pinned messages
  pinnedMessageIds: new Set<string>(),
  togglePinMessage: (id) =>
    set((s) => {
      const next = new Set(s.pinnedMessageIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { pinnedMessageIds: next };
    }),
});
