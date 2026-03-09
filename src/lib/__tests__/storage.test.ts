/**
 * Tests for src/lib/storage.ts — multi-project persistence
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  listProjects,
  loadProject,
  saveProject,
  deleteProject,
  createProject,
  renameProject,
  migrateLegacyProject,
} from '../storage';
import type { ProjectData } from '../storage';

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

describe('storage', () => {
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
