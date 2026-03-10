# Polish & Refine Log

Tracks the systematic UI/UX polish pass across 20 items in 4 rounds.

## Queue

### Round 1 — UX Quick Wins
- [x] 1. Onboarding empty state — template cards for instant workflow loading
- [x] 2. Node rename affordance — pencil icon hint on hover
- [x] 3. Context menu close animation — scale-out + fade exit
- [x] 4. NodeDetailPanel slide animation — slide-in-from-right
- [x] 5. Auto-save indicator — "Saved" flash in TopBar

### Round 2 — Visual Polish
- [x] 6. Toast entrance/exit animations
- [ ] 7. Edge label picker viewport clamping
- [ ] 8. Low-contrast text fix (WCAG AA)
- [ ] 9. Consistent icon sizing across components
- [ ] 10. Keyboard shortcut tooltips on buttons

### Round 3 — Interaction Polish
- [ ] 11. Focus ring styling for keyboard navigation
- [ ] 12. Dropdown keyboard navigation (arrow keys, Enter, Escape)
- [ ] 13. Drag feedback on canvas nodes
- [ ] 14. Panel resize handles
- [ ] 15. Smooth scroll to node on search/breadcrumb select

### Round 4 — Content & Copy
- [ ] 16. Context-aware loading state copy
- [ ] 17. Replace alert() calls with toast notifications
- [ ] 18. CID personality affects UI chrome colors
- [ ] 19. Standardize timestamp formatting with relativeTime()
- [ ] 20. Help discoverability — quick-reference card

---

## Cycle Log

<!-- Newest entries at top -->

### Polish 6 — Toast entrance/exit animations
- **Changed**: page.tsx (Toasts component)
- Upgraded entrance: spring physics (stiffness 400, damping 25) + blur(4px→0) for a snappy, deceleration-feel arrival
- Upgraded exit: slides right (x: 40) + blur(2px) + 150ms duration for a quick, directional dismiss
- Added `layout` prop for smooth reflow when toasts stack/unstack (Framer Motion layout animation)
- Entrance scale from 0.9 (was 0.95) for more pronounced pop-in
- Exit direction changed from downward (y: 10) to rightward (x: 40) to differentiate from entrance direction

### Polish 5 — Auto-save indicator
- **Changed**: useStore.ts, TopBar.tsx
- Added `lastSavedAt: number` field to store interface and initial state
- `flushSave()` now calls `useLifecycleStore.setState({ lastSavedAt: Date.now() })` after successful save
- TopBar subscribes to `lastSavedAt` via individual selector, shows "Saved" with check icon
- AnimatePresence + motion.div provides fade-in (y: 4→0) + fade-out animation
- Auto-hides after 1.5s via setTimeout cleanup in useEffect
- Positioned in center stats area after health score — only visible when nodes exist

### Polish 4 — NodeDetailPanel slide animation
- **Changed**: NodeDetailPanel.tsx
- Split into `NodeDetailPanelContent` (inner) + `NodeDetailPanel` (outer with AnimatePresence)
- Same bug pattern as Polish 3: early `return null` at line 573 prevented AnimatePresence from detecting child removal
- Outer component uses individual selector `(s) => s.selectedNodeId` for optimal re-render
- Inner component receives `nodeId` prop, renders the motion.div directly (no wrapping AnimatePresence)
- Exit animation now plays: `x: -320, opacity: 0` with spring transition slides panel left on close

### Polish 3 — Context menu close animation
- **Changed**: NodeContextMenu.tsx
- Split into `ContextMenuContent` (inner) + `NodeContextMenu` (outer with AnimatePresence)
- Added `exit={{ opacity: 0, scale: 0.92 }}` with 100ms duration for smooth scale-down + fade-out
- Used AnimatePresence to detect component removal and play exit animation
- Keyed on `nodeId + x` to re-animate when menu reopens at a different position
- Outer component uses individual selectors instead of destructuring entire store

### Polish 2 — Node rename affordance
- **Changed**: LifecycleNode.tsx
- Added Pencil icon (9px) that fades in on label hover via `group-hover/label` — invisible by default (text-white/0), visible on hover (text-white/30)
- Changed label cursor to `cursor-text` to signal editability
- Wrapped label text + pencil in a flex container with nested group for independent hover
- Added `motion.input` with fade-in + slight scale animation (0.15s) when entering edit mode
- Existing `title="Double-click to rename"` tooltip preserved as fallback

### Polish 1 — Onboarding empty state
- **Changed**: Canvas.tsx empty state template section
- Upgraded 5 template chips (tiny 10px text buttons) to proper cards with colored icons (Code2, FileText, ShieldAlert, Rocket, MessageCircle), descriptive subtitles ("7 nodes — requirements to deploy"), and hover effects
- Added value prop tagline: "Workflows that stay alive after generation"
- Bumped description text opacity from 35% to 40% for readability
- Used explicit Tailwind color classes (not dynamic) to survive purge
- Grid layout: 2 cols on mobile, 3 cols on sm+ screens
