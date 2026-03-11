/**
 * Project Persistence — StorageBackend abstraction.
 *
 * Two backends:
 *   LocalStorageBackend — synchronous, works offline (current default)
 *   SupabaseBackend     — async, cloud persistence (activated when user signs in)
 *
 * All top-level exports (listProjects, saveProject, etc.) remain synchronous
 * and delegate to LocalStorageBackend. The SupabaseBackend is used for
 * background sync and is accessed through getStorageBackend().
 */

import { getSupabaseClient, isSupabaseConfigured } from './supabase';

// ── Types ───────────────────────────────────────────────────────────────────

export interface ProjectMeta {
  id: string;
  name: string;
  nodeCount: number;
  edgeCount: number;
  createdAt: number;
  lastModified: number;
}

export interface ProjectData {
  _version: number;
  nodes: unknown[];
  edges: unknown[];
  events: unknown[];
  messages: unknown[];
  cidMode?: string;
  cidAIModel?: string;
}

// ── StorageBackend interface ────────────────────────────────────────────────

export interface StorageBackend {
  readonly kind: 'local' | 'supabase';
  listProjects(): Promise<ProjectMeta[]>;
  loadProject(id: string): Promise<ProjectData | null>;
  saveProject(id: string, name: string, data: ProjectData, nodeCount: number, edgeCount: number): Promise<void>;
  deleteProject(id: string): Promise<void>;
  createProject(name: string): Promise<string>;
  renameProject(id: string, newName: string): Promise<void>;
}

// ── ID helper ───────────────────────────────────────────────────────────────

function generateId(): string {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// ── LocalStorageBackend ─────────────────────────────────────────────────────

const PROJECTS_INDEX_KEY = 'lifecycle-projects';
const PROJECT_PREFIX = 'lifecycle-project-';
const LEGACY_KEY = 'lifecycle-store';

function readIndex(): ProjectMeta[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(PROJECTS_INDEX_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ProjectMeta[];
  } catch {
    return [];
  }
}

function writeIndex(projects: ProjectMeta[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PROJECTS_INDEX_KEY, JSON.stringify(projects));
}

export class LocalStorageBackend implements StorageBackend {
  readonly kind = 'local' as const;

  async listProjects(): Promise<ProjectMeta[]> {
    return readIndex();
  }

  async loadProject(id: string): Promise<ProjectData | null> {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(PROJECT_PREFIX + id);
      if (!raw) return null;
      return JSON.parse(raw) as ProjectData;
    } catch {
      return null;
    }
  }

  async saveProject(id: string, name: string, data: ProjectData, nodeCount: number, edgeCount: number): Promise<void> {
    if (typeof window === 'undefined') return;

    // Save data
    try {
      localStorage.setItem(PROJECT_PREFIX + id, JSON.stringify(data));
    } catch {
      // Storage full — try trimming execution results
      try {
        const trimmed = { ...data, nodes: (data.nodes as Array<{ data?: { executionResult?: string } }>).map(n => {
          if (n.data?.executionResult && n.data.executionResult.length > 1000) {
            return { ...n, data: { ...n.data, executionResult: n.data.executionResult.slice(0, 1000) + '\n... (truncated)' } };
          }
          return n;
        })};
        localStorage.setItem(PROJECT_PREFIX + id, JSON.stringify(trimmed));
      } catch {
        console.warn(`[storage] Failed to save project ${id} — storage quota exceeded`);
        return;
      }
    }

    // Update index
    const projects = readIndex();
    const existing = projects.findIndex(p => p.id === id);
    const meta: ProjectMeta = {
      id,
      name,
      nodeCount,
      edgeCount,
      createdAt: existing >= 0 ? projects[existing].createdAt : Date.now(),
      lastModified: Date.now(),
    };
    if (existing >= 0) {
      projects[existing] = meta;
    } else {
      projects.push(meta);
    }
    writeIndex(projects);
  }

  async deleteProject(id: string): Promise<void> {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(PROJECT_PREFIX + id);
    const projects = readIndex().filter(p => p.id !== id);
    writeIndex(projects);
  }

  async createProject(name: string): Promise<string> {
    const id = generateId();
    const data: ProjectData = {
      _version: 2,
      nodes: [],
      edges: [],
      events: [],
      messages: [],
    };
    await this.saveProject(id, name, data, 0, 0);
    return id;
  }

  async renameProject(id: string, newName: string): Promise<void> {
    const projects = readIndex();
    const p = projects.find(x => x.id === id);
    if (p) {
      p.name = newName;
      writeIndex(projects);
    }
  }
}

// ── SupabaseBackend ─────────────────────────────────────────────────────────

export class SupabaseBackend implements StorageBackend {
  readonly kind = 'supabase' as const;
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  private get client() {
    const c = getSupabaseClient();
    if (!c) throw new Error('[storage] SupabaseBackend used without configured client');
    return c;
  }

  async listProjects(): Promise<ProjectMeta[]> {
    const { data, error } = await this.client
      .from('projects')
      .select('id, name, node_count, edge_count, created_at, last_modified')
      .eq('user_id', this.userId)
      .order('last_modified', { ascending: false });

    if (error) {
      console.error('[storage:supabase] listProjects error', error);
      return [];
    }

    return (data ?? []).map(row => ({
      id: row.id,
      name: row.name,
      nodeCount: row.node_count,
      edgeCount: row.edge_count,
      createdAt: new Date(row.created_at).getTime(),
      lastModified: new Date(row.last_modified).getTime(),
    }));
  }

  async loadProject(id: string): Promise<ProjectData | null> {
    const { data, error } = await this.client
      .from('project_data')
      .select('data')
      .eq('project_id', id)
      .single();

    if (error || !data) return null;
    return data.data as unknown as ProjectData;
  }

  async saveProject(id: string, name: string, projectData: ProjectData, nodeCount: number, edgeCount: number): Promise<void> {
    // Upsert project metadata
    const { error: metaError } = await this.client
      .from('projects')
      .upsert({
        id,
        user_id: this.userId,
        name,
        node_count: nodeCount,
        edge_count: edgeCount,
        last_modified: new Date().toISOString(),
      }, { onConflict: 'id' });

    if (metaError) {
      console.error('[storage:supabase] saveProject meta error', metaError);
      return;
    }

    // Upsert project data
    const { error: dataError } = await this.client
      .from('project_data')
      .upsert({
        project_id: id,
        data: projectData as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'project_id' });

    if (dataError) {
      console.error('[storage:supabase] saveProject data error', dataError);
    }
  }

  async deleteProject(id: string): Promise<void> {
    // project_data cascades from projects FK
    const { error } = await this.client
      .from('projects')
      .delete()
      .eq('id', id)
      .eq('user_id', this.userId);

    if (error) {
      console.error('[storage:supabase] deleteProject error', error);
    }
  }

  async createProject(name: string): Promise<string> {
    const id = generateId();
    const data: ProjectData = {
      _version: 2,
      nodes: [],
      edges: [],
      events: [],
      messages: [],
    };
    await this.saveProject(id, name, data, 0, 0);
    return id;
  }

  async renameProject(id: string, newName: string): Promise<void> {
    const { error } = await this.client
      .from('projects')
      .update({ name: newName, last_modified: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', this.userId);

    if (error) {
      console.error('[storage:supabase] renameProject error', error);
    }
  }
}

// ── Active backend management ───────────────────────────────────────────────

let _activeBackend: StorageBackend = new LocalStorageBackend();

/**
 * Get the currently active storage backend.
 */
export function getStorageBackend(): StorageBackend {
  return _activeBackend;
}

/**
 * Switch to SupabaseBackend for a signed-in user.
 * Returns the backend instance.
 */
export function activateSupabaseBackend(userId: string): SupabaseBackend {
  if (!isSupabaseConfigured()) {
    throw new Error('[storage] Cannot activate Supabase — env vars not configured');
  }
  const backend = new SupabaseBackend(userId);
  _activeBackend = backend;
  return backend;
}

/**
 * Switch back to LocalStorageBackend (e.g. on sign-out).
 */
export function activateLocalBackend(): LocalStorageBackend {
  const backend = new LocalStorageBackend();
  _activeBackend = backend;
  return backend;
}

// ── Backward-compatible synchronous exports ─────────────────────────────────
// These all delegate to LocalStorageBackend directly (not the active backend)
// to preserve the synchronous API the store currently expects.
// Once the store is migrated to async, these can be removed.

const _localBackend = new LocalStorageBackend();

export function listProjects(): ProjectMeta[] {
  return readIndex();
}

export function loadProject(id: string): ProjectData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PROJECT_PREFIX + id);
    if (!raw) return null;
    return JSON.parse(raw) as ProjectData;
  } catch {
    return null;
  }
}

export function saveProject(
  id: string,
  name: string,
  data: ProjectData,
  nodeCount: number,
  edgeCount: number,
): void {
  // Fire-and-forget the async version (it's actually sync for LocalStorageBackend)
  void _localBackend.saveProject(id, name, data, nodeCount, edgeCount);
}

export function deleteProject(id: string): void {
  void _localBackend.deleteProject(id);
}

export function createProject(name: string): string {
  const id = generateId();
  const data: ProjectData = {
    _version: 2,
    nodes: [],
    edges: [],
    events: [],
    messages: [],
  };
  saveProject(id, name, data, 0, 0);
  return id;
}

export function renameProject(id: string, newName: string): void {
  void _localBackend.renameProject(id, newName);
}

/**
 * Migrate legacy single-project data to the multi-project system.
 * Called once on first load — moves `lifecycle-store` into a named project.
 * Returns the migrated project ID, or null if nothing to migrate.
 */
export function migrateLegacyProject(): string | null {
  if (typeof window === 'undefined') return null;

  // Already migrated if projects index exists with entries
  const existing = listProjects();
  if (existing.length > 0) return null;

  const raw = localStorage.getItem(LEGACY_KEY);
  if (!raw) return null;

  try {
    const data = JSON.parse(raw) as ProjectData & { nodes?: Array<{ id: string }> };
    if (!data.nodes || data.nodes.length === 0) return null;

    const id = generateId();
    const nodeCount = data.nodes?.length ?? 0;
    const edgeCount = (data as ProjectData & { edges?: unknown[] }).edges?.length ?? 0;

    saveProject(id, 'My Workflow', data, nodeCount, edgeCount);
    // Don't remove legacy key yet — keep as backup
    return id;
  } catch {
    return null;
  }
}
