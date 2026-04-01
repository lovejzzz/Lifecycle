/**
 * In-memory sliding window rate limiter.
 * Tracks request counts per client within a 60-second window,
 * plus concurrent request limits.
 */

export interface RateLimitConfig {
  maxPerMinute: number;
  maxConcurrent: number;
}

interface ClientState {
  timestamps: number[];
  concurrent: number;
}

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterMs: number; reason: string };

export class RateLimiter {
  private clients = new Map<string, ClientState>();
  private config: Required<RateLimitConfig>;

  constructor(config?: Partial<RateLimitConfig>) {
    this.config = {
      maxPerMinute: config?.maxPerMinute ?? 30,
      maxConcurrent: config?.maxConcurrent ?? 10,
    };
  }

  check(clientId: string): RateLimitResult {
    const now = Date.now();
    const state = this.getOrCreate(clientId);

    // Prune timestamps older than 60s
    state.timestamps = state.timestamps.filter((t) => now - t < 60_000);

    // Check concurrent limit
    if (state.concurrent >= this.config.maxConcurrent) {
      return { allowed: false, retryAfterMs: 1000, reason: 'Too many concurrent requests' };
    }

    // Check per-minute limit
    if (state.timestamps.length >= this.config.maxPerMinute) {
      const oldest = state.timestamps[0];
      const retryAfterMs = 60_000 - (now - oldest) + 100;
      return { allowed: false, retryAfterMs, reason: 'Rate limit exceeded (30 req/min)' };
    }

    return { allowed: true };
  }

  acquire(clientId: string): void {
    const state = this.getOrCreate(clientId);
    state.timestamps.push(Date.now());
    state.concurrent++;
  }

  release(clientId: string): void {
    const state = this.clients.get(clientId);
    if (state && state.concurrent > 0) state.concurrent--;
  }

  reset(): void {
    this.clients.clear();
  }

  private getOrCreate(clientId: string): ClientState {
    let state = this.clients.get(clientId);
    if (!state) {
      state = { timestamps: [], concurrent: 0 };
      this.clients.set(clientId, state);
    }
    return state;
  }
}
