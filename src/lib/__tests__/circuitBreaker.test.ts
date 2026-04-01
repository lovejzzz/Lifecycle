import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CircuitBreaker } from '@/lib/circuitBreaker';

describe('CircuitBreaker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts in closed state', () => {
    const cb = new CircuitBreaker();
    expect(cb.getState()).toBe('closed');
    expect(cb.canExecute()).toBe(true);
  });

  it('stays closed below failure threshold', () => {
    const cb = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 30000,
      halfOpenMaxAttempts: 1,
    });
    cb.onFailure();
    cb.onFailure();
    expect(cb.getState()).toBe('closed');
    expect(cb.canExecute()).toBe(true);
  });

  it('opens after reaching failure threshold', () => {
    const cb = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 30000,
      halfOpenMaxAttempts: 1,
    });
    cb.onFailure();
    cb.onFailure();
    cb.onFailure();
    expect(cb.getState()).toBe('open');
    expect(cb.canExecute()).toBe(false);
  });

  it('transitions to half-open after reset timeout', () => {
    const cb = new CircuitBreaker({
      failureThreshold: 2,
      resetTimeoutMs: 5000,
      halfOpenMaxAttempts: 1,
    });
    cb.onFailure();
    cb.onFailure();
    expect(cb.getState()).toBe('open');

    vi.advanceTimersByTime(5000);
    expect(cb.getState()).toBe('half-open');
    expect(cb.canExecute()).toBe(true);
  });

  it('half-open success transitions to closed', () => {
    const cb = new CircuitBreaker({
      failureThreshold: 2,
      resetTimeoutMs: 5000,
      halfOpenMaxAttempts: 1,
    });
    cb.onFailure();
    cb.onFailure();
    vi.advanceTimersByTime(5000);
    expect(cb.getState()).toBe('half-open');

    cb.onSuccess();
    expect(cb.getState()).toBe('closed');
    expect(cb.canExecute()).toBe(true);
  });

  it('half-open failure transitions back to open', () => {
    const cb = new CircuitBreaker({
      failureThreshold: 2,
      resetTimeoutMs: 5000,
      halfOpenMaxAttempts: 1,
    });
    cb.onFailure();
    cb.onFailure();
    vi.advanceTimersByTime(5000);
    expect(cb.getState()).toBe('half-open');

    cb.onFailure();
    expect(cb.getState()).toBe('open');
    expect(cb.canExecute()).toBe(false);
  });

  it('success resets failure count', () => {
    const cb = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 30000,
      halfOpenMaxAttempts: 1,
    });
    cb.onFailure();
    cb.onFailure();
    cb.onSuccess();
    // Should be able to handle 2 more failures without opening
    cb.onFailure();
    cb.onFailure();
    expect(cb.getState()).toBe('closed');
  });

  it('reset restores initial state', () => {
    const cb = new CircuitBreaker({
      failureThreshold: 2,
      resetTimeoutMs: 30000,
      halfOpenMaxAttempts: 1,
    });
    cb.onFailure();
    cb.onFailure();
    expect(cb.getState()).toBe('open');
    cb.reset();
    expect(cb.getState()).toBe('closed');
    expect(cb.canExecute()).toBe(true);
  });

  it('getSnapshot returns current state', () => {
    const cb = new CircuitBreaker({
      failureThreshold: 2,
      resetTimeoutMs: 30000,
      halfOpenMaxAttempts: 1,
    });
    cb.onFailure();
    const snap = cb.getSnapshot();
    expect(snap.state).toBe('closed');
    expect(snap.failures).toBe(1);
    expect(snap.lastFailureTime).toBeGreaterThan(0);
  });
});
