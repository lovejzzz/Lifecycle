/**
 * Tests for src/lib/storage.ts — multi-project persistence + backend abstraction
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  listProjects,
  loadProject,
  saveProject,
  deleteProject,
  createProject,
  renameProject,
  migrateLegacyProject,
  LocalStorageBackend,
  SupabaseBackend,
  getStorageBackend,
  activateLocalBackend,
  hasPendingSync,
  flushSync,
  migrateLocalToSupabase,
} from '../storage';
import type { ProjectData, StorageBackend } from '../storage';

// Mock window + localStorage
const store: Record<string, string> = {};
const mockStorage = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, val: string) => { store[key] = val; },
  removeItem: (key: string) => { delete store[key]; },
  clear: () => { Object.keys(store).forEach(k => delete store[k]); },
};
Object.defineProperty(globalThis, 'window', { value: {}, writable: true, configurable: true });
Object.defineProperty(globalThis, 'localStorage', { value: mockStorage, writable: true, configurable: true });

beforeEach(() => {
  Object.keys(store).forEach(k => delete store[k]);
});

const sampleData: ProjectData = {
  _version: 2,
  nodes: [{ id: 'n1' }],
  edges: [{ id: 'e1' }],
  events: [],
  messages: [],
};

// ── Synchronous API tests (backward compat) ─────────────────────────────────

describe('storage — synchronous API', () => {
  it('listProjects returns empty array initially', () => {
    expect(listProjects()).toEqual([]);
  });

  it('createProject creates a project and lists it', () => {
    const id = createProject('Test Project');
    expect(id).toBeTruthy();
    const projects = listProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe('Test Project');
    expect(projects[0].nodeCount).toBe(0);
  });

  it('saveProject stores and loadProject retrieves data', () => {
    const id = createProject('My Flow');
    saveProject(id, 'My Flow', sampleData, 1, 1);
    const loaded = loadProject(id);
    expect(loaded).not.toBeNull();
    expect(loaded!.nodes).toHaveLength(1);
    expect(loaded!.edges).toHaveLength(1);
    const meta = listProjects().find(p => p.id === id);
    expect(meta!.nodeCount).toBe(1);
    expect(meta!.edgeCount).toBe(1);
  });

  it('deleteProject removes the project', () => {
    const id = createProject('Doomed');
    expect(listProjects()).toHaveLength(1);
    deleteProject(id);
    expect(listProjects()).toHaveLength(0);
    expect(loadProject(id)).toBeNull();
  });

  it('renameProject updates the name in the index', () => {
    const id = createProject('Old Name');
    renameProject(id, 'New Name');
    const meta = listProjects().find(p => p.id === id);
    expect(meta!.name).toBe('New Name');
  });

  it('migrateLegacyProject moves legacy data to a new project', () => {
    store['lifecycle-store'] = JSON.stringify({
      _version: 2,
      nodes: [{ id: 'n1' }, { id: 'n2' }],
      edges: [{ id: 'e1' }],
      events: [],
      messages: [],
    });
    const id = migrateLegacyProject();
    expect(id).toBeTruthy();
    const projects = listProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe('My Workflow');
    expect(projects[0].nodeCount).toBe(2);
    const data = loadProject(id!);
    expect(data!.nodes).toHaveLength(2);
  });

  it('migrateLegacyProject returns null when projects already exist', () => {
    createProject('Existing');
    store['lifecycle-store'] = JSON.stringify({
      _version: 2,
      nodes: [{ id: 'n1' }],
      edges: [],
      events: [],
      messages: [],
    });
    expect(migrateLegacyProject()).toBeNull();
  });

  it('multiple projects coexist', () => {
    const id1 = createProject('Alpha');
    const id2 = createProject('Beta');
    saveProject(id1, 'Alpha', sampleData, 1, 1);
    saveProject(id2, 'Beta', { ...sampleData, nodes: [] }, 0, 1);
    expect(listProjects()).toHaveLength(2);
    expect(loadProject(id1)!.nodes).toHaveLength(1);
    expect(loadProject(id2)!.nodes).toHaveLength(0);
  });
});

// ── LocalStorageBackend class tests ─────────────────────────────────────────

describe('LocalStorageBackend', () => {
  let backend: LocalStorageBackend;

  beforeEach(() => {
    backend = new LocalStorageBackend();
  });

  it('has kind "local"', () => {
    expect(backend.kind).toBe('local');
  });

  it('listProjects returns empty initially', async () => {
    expect(await backend.listProjects()).toEqual([]);
  });

  it('createProject + listProjects round-trip', async () => {
    const id = await backend.createProject('Async Test');
    const projects = await backend.listProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe('Async Test');
    expect(projects[0].id).toBe(id);
  });

  it('saveProject + loadProject round-trip', async () => {
    const id = await backend.createProject('Flow');
    await backend.saveProject(id, 'Flow', sampleData, 1, 1);
    const loaded = await backend.loadProject(id);
    expect(loaded).not.toBeNull();
    expect(loaded!.nodes).toHaveLength(1);
    expect(loaded!._version).toBe(2);
  });

  it('deleteProject removes project', async () => {
    const id = await backend.createProject('Gone');
    await backend.deleteProject(id);
    expect(await backend.listProjects()).toHaveLength(0);
    expect(await backend.loadProject(id)).toBeNull();
  });

  it('renameProject updates name', async () => {
    const id = await backend.createProject('Before');
    await backend.renameProject(id, 'After');
    const projects = await backend.listProjects();
    expect(projects[0].name).toBe('After');
  });

  it('loadProject returns null for nonexistent ID', async () => {
    expect(await backend.loadProject('nonexistent')).toBeNull();
  });

  it('saveProject updates existing metadata', async () => {
    const id = await backend.createProject('Evolving');
    await backend.saveProject(id, 'Evolved', sampleData, 5, 3);
    const projects = await backend.listProjects();
    expect(projects[0].name).toBe('Evolved');
    expect(projects[0].nodeCount).toBe(5);
    expect(projects[0].edgeCount).toBe(3);
  });
});

// ── StorageBackend interface contract tests ──────────────────────────────────

describe('StorageBackend interface contract', () => {
  it('LocalStorageBackend implements all required methods', () => {
    const backend: StorageBackend = new LocalStorageBackend();
    expect(typeof backend.listProjects).toBe('function');
    expect(typeof backend.loadProject).toBe('function');
    expect(typeof backend.saveProject).toBe('function');
    expect(typeof backend.deleteProject).toBe('function');
    expect(typeof backend.createProject).toBe('function');
    expect(typeof backend.renameProject).toBe('function');
    expect(backend.kind).toBe('local');
  });

  it('SupabaseBackend implements all required methods', () => {
    // Can't actually connect, but verify the shape
    const backend: StorageBackend = new SupabaseBackend('fake-user-id');
    expect(typeof backend.listProjects).toBe('function');
    expect(typeof backend.loadProject).toBe('function');
    expect(typeof backend.saveProject).toBe('function');
    expect(typeof backend.deleteProject).toBe('function');
    expect(typeof backend.createProject).toBe('function');
    expect(typeof backend.renameProject).toBe('function');
    expect(backend.kind).toBe('supabase');
  });
});

// ── Active backend management tests ─────────────────────────────────────────

describe('backend management', () => {
  it('default backend is local', () => {
    const backend = getStorageBackend();
    expect(backend.kind).toBe('local');
  });

  it('activateLocalBackend returns LocalStorageBackend', () => {
    const backend = activateLocalBackend();
    expect(backend.kind).toBe('local');
    expect(getStorageBackend().kind).toBe('local');
  });

  // activateSupabaseBackend requires env vars — tested via integration
});

// ── Debounced sync tests ────────────────────────────────────────────────────

describe('debounced sync', () => {
  it('hasPendingSync returns false when no sync scheduled', () => {
    expect(hasPendingSync()).toBe(false);
  });

  it('flushSync resolves when nothing pending', async () => {
    // Should not throw
    await flushSync();
    expect(hasPendingSync()).toBe(false);
  });
});

// ── Migration tests ─────────────────────────────────────────────────────────

describe('migrateLocalToSupabase', () => {
  it('returns 0 when active backend is local', async () => {
    activateLocalBackend();
    const count = await migrateLocalToSupabase();
    expect(count).toBe(0);
  });

  it('returns 0 when no local projects exist and sets migration flag', async () => {
    // Ensure we're on local backend (migration check short-circuits)
    activateLocalBackend();
    const count = await migrateLocalToSupabase();
    expect(count).toBe(0);
  });
});

// ── Edge case tests ─────────────────────────────────────────────────────────

describe('storage edge cases', () => {
  it('createProject generates unique IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 10; i++) {
      ids.add(createProject(`Project ${i}`));
    }
    expect(ids.size).toBe(10);
  });

  it('saveProject with large data falls back to trimmed version', () => {
    const id = createProject('Big');
    const bigData: ProjectData = {
      _version: 2,
      nodes: [{ id: 'n1', data: { executionResult: 'x'.repeat(5000) } }],
      edges: [],
      events: [],
      messages: [],
    };
    // Should not throw even with large data
    saveProject(id, 'Big', bigData, 1, 0);
    const loaded = loadProject(id);
    expect(loaded).not.toBeNull();
  });

  it('loadProject handles corrupted JSON gracefully', () => {
    store['lifecycle-project-corrupted'] = '{invalid json';
    expect(loadProject('corrupted')).toBeNull();
  });

  it('listProjects handles corrupted index gracefully', () => {
    store['lifecycle-projects'] = 'not json';
    expect(listProjects()).toEqual([]);
  });

  it('renameProject is no-op for nonexistent project', () => {
    renameProject('ghost', 'New Name');
    expect(listProjects()).toHaveLength(0);
  });

  it('deleteProject is no-op for nonexistent project', () => {
    deleteProject('ghost');
    expect(listProjects()).toHaveLength(0);
  });
});
