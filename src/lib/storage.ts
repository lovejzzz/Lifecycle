/**
 * Project Persistence & Multi-Project — localStorage-based project manager.
 * Each project stored under `lifecycle-project-{id}`. An index at `lifecycle-projects` tracks all projects.
 */

const PROJECTS_INDEX_KEY = 'lifecycle-projects';
const PROJECT_PREFIX = 'lifecycle-project-';
const LEGACY_KEY = 'lifecycle-store';

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

/**
 * Generate a short random project ID.
 */
function generateId(): string {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Load the project index from localStorage.
 */
export function listProjects(): ProjectMeta[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(PROJECTS_INDEX_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ProjectMeta[];
  } catch {
    return [];
  }
}

/**
 * Save the project index.
 */
function saveIndex(projects: ProjectMeta[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PROJECTS_INDEX_KEY, JSON.stringify(projects));
}

/**
 * Load a project's full data by ID.
 */
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

/**
 * Save project data and update the index.
 */
export function saveProject(
  id: string,
  name: string,
  data: ProjectData,
  nodeCount: number,
  edgeCount: number,
): void {
  if (typeof window === 'undefined') return;

  // Save data
  try {
    localStorage.setItem(PROJECT_PREFIX + id, JSON.stringify(data));
  } catch {
    // Storage full — try trimming execution results
    const trimmed = { ...data, nodes: (data.nodes as Array<{ data?: { executionResult?: string } }>).map(n => {
      if (n.data?.executionResult && n.data.executionResult.length > 1000) {
        return { ...n, data: { ...n.data, executionResult: n.data.executionResult.slice(0, 1000) + '\n... (truncated)' } };
      }
      return n;
    })};
    localStorage.setItem(PROJECT_PREFIX + id, JSON.stringify(trimmed));
  }

  // Update index
  const projects = listProjects();
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
  saveIndex(projects);
}

/**
 * Delete a project.
 */
export function deleteProject(id: string): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(PROJECT_PREFIX + id);
  const projects = listProjects().filter(p => p.id !== id);
  saveIndex(projects);
}

/**
 * Create a new blank project. Returns the new project ID.
 */
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

/**
 * Rename a project.
 */
export function renameProject(id: string, newName: string): void {
  const projects = listProjects();
  const p = projects.find(x => x.id === id);
  if (p) {
    p.name = newName;
    saveIndex(projects);
  }
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
