import { describe, it, expect } from 'vitest';
import { RateLimiter } from '@/lib/rateLimiter';

describe('RateLimiter', () => {
  it('allows first request', () => {
    const limiter = new RateLimiter({ maxPerMinute: 5, maxConcurrent: 3 });
    expect(limiter.check('user1').allowed).toBe(true);
  });

  it('allows up to maxPerMinute requests', () => {
    const limiter = new RateLimiter({ maxPerMinute: 5, maxConcurrent: 10 });
    for (let i = 0; i < 5; i++) {
      expect(limiter.check('user1').allowed).toBe(true);
      limiter.acquire('user1');
      limiter.release('user1');
    }
  });

  it('rejects request exceeding maxPerMinute', () => {
    const limiter = new RateLimiter({ maxPerMinute: 3, maxConcurrent: 10 });
    for (let i = 0; i < 3; i++) {
      limiter.acquire('user1');
      limiter.release('user1');
    }
    const result = limiter.check('user1');
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toContain('Rate limit');
      expect(result.retryAfterMs).toBeGreaterThan(0);
    }
  });

  it('enforces concurrent limit', () => {
    const limiter = new RateLimiter({ maxPerMinute: 100, maxConcurrent: 2 });
    limiter.acquire('user1');
    limiter.acquire('user1');
    const result = limiter.check('user1');
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toContain('concurrent');
  });

  it('release decrements concurrent count', () => {
    const limiter = new RateLimiter({ maxPerMinute: 100, maxConcurrent: 1 });
    limiter.acquire('user1');
    expect(limiter.check('user1').allowed).toBe(false);
    limiter.release('user1');
    expect(limiter.check('user1').allowed).toBe(true);
  });

  it('isolates clients', () => {
    const limiter = new RateLimiter({ maxPerMinute: 1, maxConcurrent: 10 });
    limiter.acquire('user1');
    limiter.release('user1');
    expect(limiter.check('user1').allowed).toBe(false);
    expect(limiter.check('user2').allowed).toBe(true);
  });

  it('reset clears all state', () => {
    const limiter = new RateLimiter({ maxPerMinute: 1, maxConcurrent: 10 });
    limiter.acquire('user1');
    limiter.release('user1');
    expect(limiter.check('user1').allowed).toBe(false);
    limiter.reset();
    expect(limiter.check('user1').allowed).toBe(true);
  });
});
