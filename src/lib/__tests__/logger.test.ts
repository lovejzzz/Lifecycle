import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLogger, setLogLevel } from '@/lib/logger';

describe('Logger', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setLogLevel('debug'); // Enable all levels for testing
  });

  it('creates a logger with module prefix', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const log = createLogger('TestModule');
    log.info('test-action');
    expect(spy).toHaveBeenCalledTimes(1);
    // Server-side: JSON output (node environment in vitest)
    const arg = spy.mock.calls[0][0];
    const parsed = JSON.parse(arg);
    expect(parsed.module).toBe('TestModule');
    expect(parsed.action).toBe('test-action');
    expect(parsed.level).toBe('info');
  });

  it('includes metadata in output', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const log = createLogger('Test');
    log.info('request', { provider: 'deepseek', tokens: 500 });
    const parsed = JSON.parse(spy.mock.calls[0][0]);
    expect(parsed.provider).toBe('deepseek');
    expect(parsed.tokens).toBe(500);
  });

  it('uses console.error for error level', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = createLogger('Test');
    log.error('fail', { code: 500 });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('uses console.warn for warn level', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const log = createLogger('Test');
    log.warn('slow', { ms: 5000 });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('filters by log level', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    setLogLevel('warn');
    const log = createLogger('Test');
    log.debug('hidden');
    log.info('hidden');
    expect(spy).not.toHaveBeenCalled();
  });
});
