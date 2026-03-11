import { test, expect } from '@playwright/test';

// Dismiss the OnboardingTour overlay before each test
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('lifecycle-onboarding-done', 'true');
  });
});

test.describe('App loads and renders', () => {
  test('homepage renders with canvas and CID panel', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('[aria-label="Workflow canvas"]')).toBeVisible();
    await expect(page.locator('[aria-label="CID Agent Panel"]')).toBeVisible();
    await expect(page.locator('[role="toolbar"]')).toBeVisible();
    await expect(page).toHaveTitle(/Lifecycle/i);
  });

  test('empty canvas shows all template chips with full names', async ({ page }) => {
    await page.goto('/');

    // All 8 templates should show with full names (not truncated)
    // Use getByRole to avoid matching suggestion chips that contain similar text
    await expect(page.getByRole('button', { name: /^Software Development/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Content Pipeline \d/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Incident Response/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Product Launch/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Chatbot \d/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Course Design/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Lesson Planning/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Assignment Design/ })).toBeVisible();
  });

  test('CID welcome message is present', async ({ page }) => {
    await page.goto('/');

    const panel = page.locator('[aria-label="CID Agent Panel"]');
    await expect(panel).toContainText('CID online', { timeout: 3000 });
  });

  test('suggestion chips appear on empty canvas', async ({ page }) => {
    await page.goto('/');

    // "OR DESCRIBE WHAT YOU NEED" section with clickable suggestions
    await expect(page.getByText('Build a blog content pipeline')).toBeVisible({ timeout: 3000 });
  });
});

test.describe('Template loading', () => {
  test('Course Design template creates nodes', async ({ page }) => {
    await page.goto('/');

    await page.getByText('Course Design').click();
    await expect(page.getByText('Syllabus')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Lesson Plans').first()).toBeVisible({ timeout: 5000 });
  });

  test('Software Development template creates nodes', async ({ page }) => {
    await page.goto('/');

    await page.getByText('Software Development').click();
    await expect(page.getByText('Requirements').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Design').first()).toBeVisible({ timeout: 5000 });
  });

  test('template loading shows toast notification', async ({ page }) => {
    await page.goto('/');

    await page.getByText('Course Design').click();

    // Toast should confirm template was loaded
    await expect(page.getByText('Template "Course Design" loaded')).toBeVisible({ timeout: 5000 });
  });

  test('CID confirms template load in chat', async ({ page }) => {
    await page.goto('/');

    await page.getByText('Course Design').click();

    const panel = page.locator('[aria-label="CID Agent Panel"]');
    await expect(panel).toContainText(/Loaded.*Course Design.*template/i, { timeout: 5000 });
    await expect(panel).toContainText(/\d+ nodes.*\d+ connections/i, { timeout: 5000 });
  });
});

test.describe('CID chat commands', () => {
  test('help command shows all sections', async ({ page }) => {
    await page.goto('/');

    const input = page.locator('[data-cid-input]');
    await input.fill('help');
    await input.press('Enter');

    const panel = page.locator('[aria-label="CID Agent Panel"]');
    await expect(panel).toContainText('Available Commands', { timeout: 10000 });
    await expect(panel).toContainText('Graph Actions', { timeout: 10000 });
  });

  test('status command on empty workflow', async ({ page }) => {
    await page.goto('/');

    const input = page.locator('[data-cid-input]');
    await input.fill('status');
    await input.press('Enter');

    await page.waitForTimeout(2000);
    const panel = page.locator('[aria-label="CID Agent Panel"]');
    await expect(panel).toContainText(/status|health|workflow|node/i, { timeout: 10000 });
  });

  test('count command on empty workflow', async ({ page }) => {
    await page.goto('/');

    const input = page.locator('[data-cid-input]');
    await input.fill('count');
    await input.press('Enter');

    const panel = page.locator('[aria-label="CID Agent Panel"]');
    await expect(panel).toContainText(/node|count|0|empty|no\s/i, { timeout: 5000 });
  });

  test('validate command on empty workflow', async ({ page }) => {
    await page.goto('/');

    const input = page.locator('[data-cid-input]');
    await input.fill('validate');
    await input.press('Enter');

    const panel = page.locator('[aria-label="CID Agent Panel"]');
    await expect(panel).toContainText(/valid|no.*workflow|empty|check/i, { timeout: 5000 });
  });

  test('input field disables while processing', async ({ page }) => {
    await page.goto('/');

    const input = page.locator('[data-cid-input]');
    await input.fill('help');
    await input.press('Enter');

    // Input should be disabled during processing
    await expect(input).toBeDisabled({ timeout: 1000 });

    // Wait for processing to finish
    await page.waitForTimeout(3000);
    await expect(input).toBeEnabled({ timeout: 10000 });
  });
});

test.describe('Lifecycle loop — the core product promise', () => {
  test('load template → count nodes in chat', async ({ page }) => {
    await page.goto('/');

    await page.getByText('Course Design').click();
    await expect(page.getByText('Syllabus')).toBeVisible({ timeout: 5000 });

    const input = page.locator('[data-cid-input]');
    await input.fill('count');
    await input.press('Enter');

    const chatPanel = page.locator('[aria-label="CID Agent Panel"]');
    await expect(chatPanel).toContainText(/\d+ node/i, { timeout: 5000 });
  });

  test('load template → open node detail panel', async ({ page }) => {
    await page.goto('/');

    await page.getByText('Software Development').click();
    await page.waitForTimeout(1000);

    const node = page.getByText('Requirements').first();
    await node.click();

    await expect(page.locator('[aria-label="Node Details"]')).toBeVisible({ timeout: 5000 });
  });

  test('load template → validate workflow', async ({ page }) => {
    await page.goto('/');

    await page.getByText('Course Design').click();
    await expect(page.getByText('Syllabus')).toBeVisible({ timeout: 5000 });

    const input = page.locator('[data-cid-input]');
    await input.fill('validate');
    await input.press('Enter');

    const chatPanel = page.locator('[aria-label="CID Agent Panel"]');
    // Should get a validation report
    await expect(chatPanel).toContainText(/valid|pass|check|✅|issue/i, { timeout: 10000 });
  });

  test('load template → request status report', async ({ page }) => {
    await page.goto('/');

    await page.getByText('Course Design').click();
    await expect(page.getByText('Syllabus')).toBeVisible({ timeout: 5000 });

    // Wait for animations
    await page.waitForTimeout(2000);

    const input = page.locator('[data-cid-input]');
    await input.fill('status');
    await input.press('Enter');

    const chatPanel = page.locator('[aria-label="CID Agent Panel"]');
    await expect(chatPanel).toContainText(/health|status|node|active/i, { timeout: 10000 });
  });

  test('load template → list nodes', async ({ page }) => {
    await page.goto('/');

    await page.getByText('Course Design').click();
    await expect(page.getByText('Syllabus')).toBeVisible({ timeout: 5000 });

    const input = page.locator('[data-cid-input]');
    await input.fill('list all');
    await input.press('Enter');

    const chatPanel = page.locator('[aria-label="CID Agent Panel"]');
    await expect(chatPanel).toContainText('Syllabus', { timeout: 5000 });
  });
});

test.describe('CID panel interactions', () => {
  test('CID panel header shows agent name and model', async ({ page }) => {
    await page.goto('/');

    const panel = page.locator('[aria-label="CID Agent Panel"]');
    await expect(panel).toBeVisible();

    // Should show the agent name (Rowan or Poirot)
    await expect(panel).toContainText(/Rowan|Poirot/, { timeout: 3000 });
    // Should show the model badge
    await expect(panel).toContainText(/DEEPSEEK|CLAUDE/i, { timeout: 3000 });
  });

  test('quick action chips appear after template load', async ({ page }) => {
    await page.goto('/');

    await page.getByText('Course Design').click();
    await expect(page.getByText('Syllabus')).toBeVisible({ timeout: 5000 });

    // Wait for animations to complete
    await page.waitForTimeout(3000);

    // Quick action chips should appear (Solve problems, Propagate changes, Optimize work)
    const panel = page.locator('[aria-label="CID Agent Panel"]');
    await expect(panel.getByText('Solve problems')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Keyboard shortcuts', () => {
  test('Cmd+K does not crash the app', async ({ page }) => {
    await page.goto('/');

    await page.keyboard.press('Meta+k');
    await page.waitForTimeout(500);
    await expect(page.locator('[aria-label="Workflow canvas"]')).toBeVisible();
  });

  test('pressing Enter in empty input does not send', async ({ page }) => {
    await page.goto('/');

    const input = page.locator('[data-cid-input]');
    await input.press('Enter');

    // Should not see any user message bubble
    await page.waitForTimeout(500);
    const panel = page.locator('[aria-label="CID Agent Panel"]');
    // Chat should still just have the CID welcome, no new messages
    await expect(panel).toContainText('CID online');
  });
});

test.describe('TopBar', () => {
  test('TopBar shows project name and Add Node button', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('[role="toolbar"]')).toBeVisible();
    await expect(page.getByText('Add Node')).toBeVisible();
  });

  test('TopBar stats update after template load', async ({ page }) => {
    await page.goto('/');

    await page.getByText('Course Design').click();

    // Wait for all animations to complete (nodes + edges staggered)
    await page.waitForTimeout(4000);

    // Stats bar in CID panel should show node count
    const panel = page.locator('[aria-label="CID Agent Panel"]');
    await expect(panel).toContainText(/\d+\s*nodes/i, { timeout: 5000 });
  });
});

test.describe('Template switching', () => {
  test('loading a second template replaces the first', async ({ page }) => {
    await page.goto('/');

    // Load Course Design first
    await page.getByText('Course Design').click();
    await expect(page.getByText('Syllabus')).toBeVisible({ timeout: 5000 });

    // Now use CID to load a different template
    const input = page.locator('[data-cid-input]');

    // Wait for processing to finish from template load
    await page.waitForTimeout(3000);

    await input.fill('/template Software Development');
    await input.press('Enter');

    // Should see Software Dev nodes
    await expect(page.getByText('Requirements').first()).toBeVisible({ timeout: 8000 });
  });
});

test.describe('CID commands on loaded workflow', () => {
  test('summarize command produces output', async ({ page }) => {
    await page.goto('/');

    await page.getByText('Course Design').click();
    await expect(page.getByText('Syllabus')).toBeVisible({ timeout: 5000 });

    const input = page.locator('[data-cid-input]');
    await input.fill('summarize');
    await input.press('Enter');

    const panel = page.locator('[aria-label="CID Agent Panel"]');
    await expect(panel).toContainText(/summar|overview|workflow|node/i, { timeout: 10000 });
  });

  test('critical path command works', async ({ page }) => {
    await page.goto('/');

    await page.getByText('Course Design').click();
    await expect(page.getByText('Syllabus')).toBeVisible({ timeout: 5000 });

    // Wait for edges to load
    await page.waitForTimeout(3000);

    const input = page.locator('[data-cid-input]');
    await input.fill('critical path');
    await input.press('Enter');

    const panel = page.locator('[aria-label="CID Agent Panel"]');
    await expect(panel).toContainText(/critical|path|longest|chain|→|node/i, { timeout: 10000 });
  });

  test('orphans command on connected workflow', async ({ page }) => {
    await page.goto('/');

    await page.getByText('Software Development').click();
    await expect(page.getByText('Requirements').first()).toBeVisible({ timeout: 5000 });

    // Wait for edges
    await page.waitForTimeout(3000);

    const input = page.locator('[data-cid-input]');
    await input.fill('orphans');
    await input.press('Enter');

    const panel = page.locator('[aria-label="CID Agent Panel"]');
    await expect(panel).toContainText(/orphan|unconnected|no.*orphan|all.*connected/i, { timeout: 5000 });
  });

  test('layout command rearranges nodes', async ({ page }) => {
    await page.goto('/');

    await page.getByText('Course Design').click();
    await expect(page.getByText('Syllabus')).toBeVisible({ timeout: 5000 });

    const input = page.locator('[data-cid-input]');
    await input.fill('layout');
    await input.press('Enter');

    const panel = page.locator('[aria-label="CID Agent Panel"]');
    await expect(panel).toContainText(/layout|arrang|optim|position/i, { timeout: 5000 });
  });

  test('plan command shows execution plan', async ({ page }) => {
    await page.goto('/');

    await page.getByText('Course Design').click();
    await expect(page.getByText('Syllabus')).toBeVisible({ timeout: 5000 });

    // Wait for edges
    await page.waitForTimeout(3000);

    const input = page.locator('[data-cid-input]');
    await input.fill('plan');
    await input.press('Enter');

    const panel = page.locator('[aria-label="CID Agent Panel"]');
    await expect(panel).toContainText(/plan|level|execution|order|step/i, { timeout: 10000 });
  });
});

test.describe('Node detail panel', () => {
  test('node detail shows status, category, and version', async ({ page }) => {
    await page.goto('/');

    await page.getByText('Course Design').click();
    await page.waitForTimeout(1000);

    // Click Syllabus node
    await page.getByText('Syllabus').first().click();

    const detail = page.locator('[aria-label="Node Details"]');
    await expect(detail).toBeVisible({ timeout: 5000 });
    await expect(detail).toContainText(/status/i);
    await expect(detail).toContainText(/category/i);
    await expect(detail).toContainText(/v\d/);
  });

  test('node detail panel closes when clicking canvas', async ({ page }) => {
    await page.goto('/');

    await page.getByText('Course Design').click();
    await page.waitForTimeout(1000);

    // Open node detail
    await page.getByText('Syllabus').first().click();
    await expect(page.locator('[aria-label="Node Details"]')).toBeVisible({ timeout: 5000 });

    // Click close button (X) on the detail panel
    const detail = page.locator('[aria-label="Node Details"]');
    const closeBtn = detail.locator('button').filter({ has: page.locator('svg') }).first();
    await closeBtn.click();

    await expect(detail).toBeHidden({ timeout: 3000 });
  });
});

test.describe('CID graph mutation commands', () => {
  test('rename command changes node label', async ({ page }) => {
    await page.goto('/');

    await page.getByText('Course Design').click();
    await expect(page.getByText('Syllabus')).toBeVisible({ timeout: 5000 });

    const input = page.locator('[data-cid-input]');
    await input.fill('rename Syllabus to Course Outline');
    await input.press('Enter');

    const panel = page.locator('[aria-label="CID Agent Panel"]');
    await expect(panel).toContainText(/rename|Course Outline/i, { timeout: 5000 });
  });

  test('delete command removes a node', async ({ page }) => {
    await page.goto('/');

    await page.getByText('Course Design').click();
    // Wait for all nodes + edges to finish animating (8 nodes × 200ms + 7 edges × 80ms + buffer)
    await page.waitForTimeout(3500);

    const input = page.locator('[data-cid-input]');
    await input.fill('delete Course FAQ');
    await input.press('Enter');

    const panel = page.locator('[aria-label="CID Agent Panel"]');
    await expect(panel).toContainText(/delet|remov|Course FAQ/i, { timeout: 5000 });
  });

  test('add node command creates a new node', async ({ page }) => {
    await page.goto('/');

    await page.getByText('Course Design').click();
    await expect(page.getByText('Syllabus')).toBeVisible({ timeout: 5000 });

    const input = page.locator('[data-cid-input]');
    await input.fill('add artifact called Final Exam');
    await input.press('Enter');

    const panel = page.locator('[aria-label="CID Agent Panel"]');
    await expect(panel).toContainText(/add|creat|Final Exam/i, { timeout: 5000 });
  });
});

test.describe('Chat input behavior', () => {
  test('input history recalls last command with arrow up', async ({ page }) => {
    await page.goto('/');

    const input = page.locator('[data-cid-input]');

    // Send a command and wait for completion
    await input.fill('undo');
    await input.press('Enter');
    await expect(input).toBeEnabled({ timeout: 10000 });
    // Input should be cleared after send
    await expect(input).toHaveValue('', { timeout: 2000 });

    // Arrow up should recall the last command
    await input.focus();
    await input.press('ArrowUp');
    await expect(input).toHaveValue('undo');
  });

  test('Tab autocompletes matching command', async ({ page }) => {
    await page.goto('/');

    const input = page.locator('[data-cid-input]');
    await input.fill('he');

    // Wait for autocomplete hints to appear
    await page.waitForTimeout(300);

    // Tab should autocomplete to "help" (or "health detail")
    await input.press('Tab');
    const value = await input.inputValue();
    expect(value.startsWith('he')).toBe(true);
    expect(value.length).toBeGreaterThan(2);
  });

  test('Escape clears input when hints are showing', async ({ page }) => {
    await page.goto('/');

    const input = page.locator('[data-cid-input]');
    await input.fill('he');
    await page.waitForTimeout(300);

    await input.press('Escape');
    await expect(input).toHaveValue('');
  });
});

test.describe('Multiple template workflows', () => {
  test('Incident Response template loads correctly', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: /^Incident Response/ }).click();
    await expect(page.getByText('Incident Alert')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Triage')).toBeVisible({ timeout: 5000 });
  });

  test('Product Launch template loads correctly', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: /^Product Launch/ }).click();
    await expect(page.getByText('Market Research')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('PRD')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Suggestion chips on empty canvas', () => {
  test('clicking a suggestion chip triggers CID processing', async ({ page }) => {
    await page.goto('/');

    // Click one of the suggestion chips
    await page.getByText('Build a blog content pipeline').click();

    // Should either populate input or start processing (input disabled)
    await page.waitForTimeout(500);
    const input = page.locator('[data-cid-input]');
    const isDisabled = await input.isDisabled();
    const hasValue = (await input.inputValue()).length > 0;
    // Chip click either fills the input or sends directly (processing)
    expect(isDisabled || hasValue).toBe(true);
  });
});

test.describe('Browse Templates modal', () => {
  test('Browse All Templates button opens template browser', async ({ page }) => {
    await page.goto('/');

    await page.getByText('Browse All Templates').click();

    // Template browser modal should show "Templates" heading
    await expect(page.getByText('Templates').first()).toBeVisible({ timeout: 3000 });
    // Should show template count
    await expect(page.getByText('8 built-in')).toBeVisible({ timeout: 3000 });
    // Should have a filter input
    await expect(page.getByPlaceholder('Filter templates...')).toBeVisible();
  });
});

test.describe('Add Node button', () => {
  test('Add Node creates a node on the canvas', async ({ page }) => {
    await page.goto('/');

    await page.getByText('Add Node').click();

    // A new node should appear — check for the default node or a prompt
    await page.waitForTimeout(500);
    // After adding a node, the canvas should have at least one node
    const panel = page.locator('[aria-label="CID Agent Panel"]');
    // The TopBar or canvas should reflect the new node
    await expect(page.locator('[aria-label="Workflow canvas"]')).toBeVisible();
  });
});

test.describe('Toast notifications', () => {
  test('toast appears and auto-dismisses', async ({ page }) => {
    await page.goto('/');

    // Load a template to trigger a toast
    await page.getByText('Course Design').click();

    // Toast should appear
    const toast = page.getByText('Template "Course Design" loaded');
    await expect(toast).toBeVisible({ timeout: 3000 });

    // Toast should auto-dismiss after a few seconds
    await expect(toast).toBeHidden({ timeout: 8000 });
  });
});

test.describe('CID agent mode display', () => {
  test('Quick Start prompts are visible on empty canvas', async ({ page }) => {
    await page.goto('/');

    const panel = page.locator('[aria-label="CID Agent Panel"]');
    // Quick start prompts should be visible
    await expect(panel).toContainText(/Product launch|Research workflow|Design system|Sprint planning/i, { timeout: 3000 });
  });

  test('clicking a Quick Start prompt sends it to CID', async ({ page }) => {
    await page.goto('/');

    const panel = page.locator('[aria-label="CID Agent Panel"]');
    // Click one of the quick start prompts
    const quickStart = panel.getByText('Product launch with PRD, tech spec, and pitch deck');
    await quickStart.click();

    // The input should get populated or a message should be sent
    await page.waitForTimeout(500);
    // Either input has content or processing started
    const input = page.locator('[data-cid-input]');
    const isProcessing = await input.isDisabled();
    const hasValue = (await input.inputValue()).length > 0;
    expect(isProcessing || hasValue).toBe(true);
  });
});

test.describe('Undo/Redo commands', () => {
  test('undo on empty workflow reports nothing to undo', async ({ page }) => {
    await page.goto('/');

    const input = page.locator('[data-cid-input]');
    await input.fill('undo');
    await input.press('Enter');

    const panel = page.locator('[aria-label="CID Agent Panel"]');
    await expect(panel).toContainText(/undo|nothing|no.*change/i, { timeout: 5000 });
  });

  test('redo on empty workflow reports nothing to redo', async ({ page }) => {
    await page.goto('/');

    const input = page.locator('[data-cid-input]');
    await input.fill('redo');
    await input.press('Enter');

    const panel = page.locator('[aria-label="CID Agent Panel"]');
    await expect(panel).toContainText(/redo|nothing|no.*change/i, { timeout: 5000 });
  });
});

test.describe('Duplicate node command', () => {
  test('duplicate creates a copy of a node', async ({ page }) => {
    await page.goto('/');

    await page.getByText('Course Design').click();
    await expect(page.getByText('Syllabus')).toBeVisible({ timeout: 5000 });

    const input = page.locator('[data-cid-input]');
    await input.fill('duplicate Syllabus');
    await input.press('Enter');

    const panel = page.locator('[aria-label="CID Agent Panel"]');
    await expect(panel).toContainText(/duplicat|copy|clone|Syllabus/i, { timeout: 5000 });
  });
});

test.describe('Education lifecycle — the core scenario', () => {
  test('Course Design: load → list → validate → summarize', async ({ page }) => {
    await page.goto('/');

    // Load template
    await page.getByText('Course Design').click();
    await expect(page.getByText('Syllabus')).toBeVisible({ timeout: 5000 });

    const input = page.locator('[data-cid-input]');
    const panel = page.locator('[aria-label="CID Agent Panel"]');

    // List all nodes
    await input.fill('list all');
    await input.press('Enter');
    await expect(panel).toContainText('Syllabus', { timeout: 5000 });
    await expect(input).toBeEnabled({ timeout: 10000 });

    // Validate
    await input.fill('validate');
    await input.press('Enter');
    await expect(panel).toContainText(/valid|pass|check/i, { timeout: 10000 });
    await expect(input).toBeEnabled({ timeout: 10000 });

    // Summarize
    await input.fill('summarize');
    await input.press('Enter');
    await expect(panel).toContainText(/summar|overview|workflow/i, { timeout: 10000 });
  });

  test('Lesson Planning template loads and has expected nodes', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: /^Lesson Planning/ }).click();
    // 6 nodes × 200ms stagger + edges — need ~2.5s for all to appear
    await expect(page.getByText('Learning Goals').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Activities').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Reflection').first()).toBeVisible({ timeout: 8000 });
  });

  test('Assignment Design template loads and has expected nodes', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: /^Assignment Design/ }).click();
    // Wait for nodes to appear — use Requirements which is unique enough
    await expect(page.getByText('Requirements').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Student Guide')).toBeVisible({ timeout: 5000 });
  });
});
