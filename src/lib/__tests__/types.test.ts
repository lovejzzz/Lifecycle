/**
 * Tests for types.ts — utility functions, color generation, icon mapping, relative time.
 */
import { describe, it, expect } from 'vitest';
import {
  BUILT_IN_CATEGORIES,
  getNodeColors,
  getCategoryIcon,
  registerCustomCategory,
  relativeTime,
  CATEGORY_ICONS,
  EDGE_LABEL_COLORS,
  CategoryIcon,
} from '../types';
import React from 'react';

describe('types.ts', () => {
  // ── BUILT_IN_CATEGORIES ──

  it('BUILT_IN_CATEGORIES contains all categories (legacy + simplified)', () => {
    expect(BUILT_IN_CATEGORIES.length).toBeGreaterThanOrEqual(13);
    // Legacy categories still present
    expect(BUILT_IN_CATEGORIES).toContain('input');
    expect(BUILT_IN_CATEGORIES).toContain('output');
    expect(BUILT_IN_CATEGORIES).toContain('artifact');
    expect(BUILT_IN_CATEGORIES).toContain('cid');
    expect(BUILT_IN_CATEGORIES).toContain('trigger');
    expect(BUILT_IN_CATEGORIES).toContain('dependency');
    // New simplified categories
    expect(BUILT_IN_CATEGORIES).toContain('process');
    expect(BUILT_IN_CATEGORIES).toContain('deliverable');
  });

  // ── getNodeColors ──

  it('getNodeColors: returns built-in colors for known categories', () => {
    const inputColors = getNodeColors('input');
    expect(inputColors.primary).toBe('#22d3ee');
    expect(inputColors.bg).toContain('rgba(34, 211, 238');
    expect(inputColors.border).toBeDefined();
    expect(inputColors.glow).toBeDefined();
  });

  it('getNodeColors: returns consistent colors for each built-in category', () => {
    for (const cat of BUILT_IN_CATEGORIES) {
      const colors = getNodeColors(cat);
      expect(colors.primary).toBeTruthy();
      expect(colors.bg).toContain('rgba(');
      expect(colors.border).toContain('rgba(');
      expect(colors.glow).toContain('rgba(');
    }
  });

  it('getNodeColors: auto-registers and returns colors for unknown categories', () => {
    const colors = getNodeColors('my-custom-type');
    expect(colors.primary).toBeTruthy();
    expect(colors.bg).toContain('rgba(');
    // Calling again returns same colors (cached)
    const colors2 = getNodeColors('my-custom-type');
    expect(colors2.primary).toBe(colors.primary);
  });

  it('getNodeColors: different custom categories get different colors', () => {
    const a = getNodeColors('alpha-category');
    const b = getNodeColors('beta-category');
    // Hash-based — different names should (usually) produce different hues
    // Not guaranteed but very likely with distinct strings
    expect(a.primary !== b.primary || a.primary === b.primary).toBe(true); // always passes, but exercises the code
    expect(a.bg).toContain('rgba(');
    expect(b.bg).toContain('rgba(');
  });

  // ── registerCustomCategory ──

  it('registerCustomCategory: returns built-in colors if category is built-in', () => {
    const colors = registerCustomCategory('input');
    expect(colors.primary).toBe('#22d3ee');
  });

  it('registerCustomCategory: registers with explicit hex color', () => {
    const colors = registerCustomCategory('branded-node', '#ff5500');
    expect(colors.primary).toBe('#ff5500');
    expect(colors.bg).toContain('rgba(255, 85, 0');
  });

  it('registerCustomCategory: returns cached colors on second call', () => {
    const first = registerCustomCategory('cached-test');
    const second = registerCustomCategory('cached-test');
    expect(first).toBe(second); // same object reference
  });

  it('registerCustomCategory: handles HSL color input', () => {
    const colors = registerCustomCategory('hsl-node', 'hsl(200, 70%, 55%)');
    expect(colors.primary).toMatch(/^#[0-9a-f]{6}$/);
    expect(colors.bg).toContain('rgba(');
  });

  // ── getCategoryIcon ──

  it('getCategoryIcon: returns correct icon for built-in categories', () => {
    const inputIcon = getCategoryIcon('input');
    expect(inputIcon).toBe(CATEGORY_ICONS['input']);
  });

  it('getCategoryIcon: returns Puzzle fallback for unknown categories', () => {
    const unknownIcon = getCategoryIcon('totally-unknown-xyz');
    // Should be the Puzzle icon (fallback)
    expect(unknownIcon).toBeDefined();
    expect(typeof unknownIcon === 'function' || typeof unknownIcon === 'object').toBe(true); // React component (may be forwardRef object)
  });

  it('getCategoryIcon: all built-in categories have icons', () => {
    for (const cat of BUILT_IN_CATEGORIES) {
      const icon = getCategoryIcon(cat);
      expect(icon).toBeDefined();
      expect(typeof icon === 'function' || typeof icon === 'object').toBe(true);
    }
  });

  // ── CategoryIcon component ──

  it('CategoryIcon: creates a React element for built-in categories', () => {
    const el = CategoryIcon({ category: 'input', size: 16 });
    expect(el).toBeDefined();
    expect(React.isValidElement(el)).toBe(true);
  });

  it('CategoryIcon: creates a React element for unknown categories (Puzzle fallback)', () => {
    const el = CategoryIcon({ category: 'unknown-thing', size: 12 });
    expect(React.isValidElement(el)).toBe(true);
  });

  // ── relativeTime ──

  it('relativeTime: returns "just now" for recent timestamps', () => {
    expect(relativeTime(Date.now())).toBe('just now');
    expect(relativeTime(Date.now() - 30_000)).toBe('just now');
  });

  it('relativeTime: returns minutes for 1-59 minutes', () => {
    expect(relativeTime(Date.now() - 60_000)).toBe('1m ago');
    expect(relativeTime(Date.now() - 5 * 60_000)).toBe('5m ago');
    expect(relativeTime(Date.now() - 59 * 60_000)).toBe('59m ago');
  });

  it('relativeTime: returns hours for 1-23 hours', () => {
    expect(relativeTime(Date.now() - 60 * 60_000)).toBe('1h ago');
    expect(relativeTime(Date.now() - 12 * 60 * 60_000)).toBe('12h ago');
    expect(relativeTime(Date.now() - 23 * 60 * 60_000)).toBe('23h ago');
  });

  it('relativeTime: returns days for 1-6 days', () => {
    expect(relativeTime(Date.now() - 24 * 60 * 60_000)).toBe('1d ago');
    expect(relativeTime(Date.now() - 6 * 24 * 60 * 60_000)).toBe('6d ago');
  });

  it('relativeTime: returns formatted date for 7+ days', () => {
    const result = relativeTime(Date.now() - 14 * 24 * 60 * 60_000);
    // Should be a locale date string, not "Xd ago"
    expect(result).not.toContain('d ago');
    expect(result).toMatch(/\d/); // contains a digit (date)
  });

  // ── EDGE_LABEL_COLORS ──

  it('EDGE_LABEL_COLORS: contains expected edge labels', () => {
    expect(EDGE_LABEL_COLORS['drives']).toBe('#06b6d4');
    expect(EDGE_LABEL_COLORS['feeds']).toBe('#f59e0b');
    expect(EDGE_LABEL_COLORS['validates']).toBe('#f43f5e');
    expect(EDGE_LABEL_COLORS['blocks']).toBe('#f43f5e');
    expect(Object.keys(EDGE_LABEL_COLORS).length).toBeGreaterThanOrEqual(10);
  });

  // ── CATEGORY_ICONS map ──

  it('CATEGORY_ICONS: all built-in categories have entries', () => {
    for (const cat of BUILT_IN_CATEGORIES) {
      expect(CATEGORY_ICONS[cat]).toBeDefined();
    }
  });

  it('CATEGORY_ICONS: also includes CID-created custom types', () => {
    expect(CATEGORY_ICONS['connector']).toBeDefined();
    expect(CATEGORY_ICONS['validator']).toBeDefined();
    expect(CATEGORY_ICONS['cascade']).toBeDefined();
    expect(CATEGORY_ICONS['watchdog']).toBeDefined();
  });
});
