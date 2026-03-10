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
- [x] 7. Edge label picker viewport clamping
- [x] 8. Low-contrast text fix (WCAG AA)
- [x] 9. Consistent icon sizing across components
- [x] 10. Keyboard shortcut tooltips on buttons

### Round 3 — Interaction Polish
- [x] 11. Focus ring styling for keyboard navigation
- [x] 12. Dropdown keyboard navigation (arrow keys, Enter, Escape)
- [x] 13. Drag feedback on canvas nodes
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

### Polish 13 — Drag feedback on canvas nodes
- **Changed**: LifecycleNode.tsx
- Added `dragging` prop from React Flow's `NodeProps`
- During drag: `scale(1.04) rotate(-0.5deg)` transform gives a "picked up" effect
- Enhanced glow: stronger box-shadow with 32px spread + deeper drop shadow (8px 40px) + 1px ring at primary color
- Border color switches to primary during drag for clear visual distinction
- Cursor changes from `pointer` to `grabbing` while dragging
- All existing hover, selected, generating, impact preview states preserved

### Polish 12 — Dropdown keyboard navigation
- **Changed**: TopBar.tsx
- **Add Node menu**: Arrow keys move highlight, Enter creates node, Escape closes
- **Project Switcher menu**: Arrow keys navigate through projects + actions (New, Rename, Delete), Enter activates, Escape closes
- Both menus: `tabIndex={-1}` on dropdown container, auto-focus via callback ref
- Mouse hover syncs with keyboard index (`onMouseEnter` sets index)
- Active item gets `bg-white/[0.07]` highlight (visually distinct from hover-only state)
- ArrowDown on closed trigger button opens menu and selects first item

### Polish 11 — Focus ring styling for keyboard navigation
- **Changed**: globals.css
- Added `*:focus-visible` rule: 1px emerald outline with 2px offset and 6px border-radius
- Only appears during keyboard navigation (Tab/Shift+Tab), not mouse clicks
- Input/textarea/select: separate rule with `outline: none`, border-color glow to emerald/40%, and subtle box-shadow instead of outline (cleaner for bordered inputs)
- React Flow elements: excluded via `.react-flow *:focus-visible { outline: none }` since selection state already provides visual feedback
- All existing `outline-none` on inputs still works for mouse focus; `focus-visible` adds keyboard-only enhancement

### Polish 10 — Keyboard shortcut tooltips on buttons
- **Changed**: TopBar.tsx
- Added platform-aware modifier key: `⌘` on Mac/iOS, `Ctrl+` on others (via `navigator.userAgent`)
- Updated Undo tooltip: `"Undo (Ctrl+Z)"` → `"Undo (⌘Z)"` (dynamic)
- Updated Redo tooltip: `"Redo (Ctrl+Shift+Z)"` → `"Redo (⌘⇧Z)"` (dynamic)
- Updated Export tooltip: `"Export workflow as JSON"` → `"Export workflow (⌘E)"`
- Added CID panel tooltip: `"Rowan (⌘K)"` / `"Poirot (⌘K)"` (dynamic per agent)
- Added Preview panel tooltip: `"Preview panel"`
- Added Activity panel tooltip: `"Activity log"`
- Added Add Node tooltip: `"Add a new node (or double-click canvas)"`

### Polish 9 — Consistent icon sizing across components
- **Changed**: ActivityPanel.tsx
- Audited all icon sizes across 10 components — found a 4-tier sizing hierarchy already in place:
  - `size={14}` — panel close buttons (X)
  - `size={12}` — menu items, panel header icons, standard buttons
  - `size={10}`–`size={11}` — compact action bar buttons, inline status
  - `size={9}` — micro-buttons (copy, edit, delete within content)
- Fixed ActivityPanel close button: `X size={11}` in `w-5 h-5` → `X size={14}` in `w-7 h-7 rounded-lg` to match all other panels
- Fixed ActivityPanel expand/collapse chevron: `size={11}` in `w-5 h-5` → `size={12}` in `w-7 h-7 rounded-lg`
- Both buttons now have matching hover styles (`hover:bg-white/5`)

### Polish 8 — Low-contrast text fix (WCAG AA)
- **Changed**: 10 files — CIDPanel, ActivityPanel, DiffView, Canvas, LifecycleNode, NodeDetailPanel, ImpactPreview, ErrorBoundary, PreviewPanel
- Bumped `text-white/10` → `/20`–`/25` (dot separators, decorative chevrons, icons)
- Bumped `text-white/15` → `/25`–`/30` (timestamps, placeholders, footer text, hint text, line numbers)
- Bumped `text-white/20` → `/30` (readable content: version labels, status text, empty states, tagline, group headers, node counts)
- Preserved intentionally dim hover-reveal elements (those start dim and brighten on hover)
- Focus: all text users need to *read* is now ≥30% opacity on dark backgrounds, improving contrast ratio toward WCAG AA compliance

### Polish 7 — Edge label picker viewport clamping
- **Changed**: Canvas.tsx
- Extracted inline edge label picker into standalone `EdgeLabelPicker` component
- Uses `useRef` + `useEffect` to measure element dimensions after mount, then clamps `left`/`top` within viewport bounds (12px padding)
- Handles all 4 edges: right overflow, left underflow, bottom overflow, top underflow
- Position state (`pos`) initialized from `pendingEdge` coords, then corrected in the effect
- Existing entrance/exit animations preserved (opacity + y shift)

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
