/**
 * Structured logger with module prefixes.
 * Server-side: JSON output for log aggregators.
 * Client-side: styled console output matching cidLog pattern.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type ErrorHandler = (entry: {
  level: string;
  module: string;
  action: string;
  meta?: Record<string, unknown>;
  timestamp: string;
}) => void;
let _onError: ErrorHandler | null = null;

export function setErrorHandler(handler: ErrorHandler): void {
  _onError = handler;
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: '#6b7280',
  info: '#10b981',
  warn: '#f59e0b',
  error: '#ef4444',
};

let minLevel: LogLevel = 'info';

export function setLogLevel(level: LogLevel): void {
  minLevel = level;
}

export interface Logger {
  debug(action: string, meta?: Record<string, unknown>): void;
  info(action: string, meta?: Record<string, unknown>): void;
  warn(action: string, meta?: Record<string, unknown>): void;
  error(action: string, meta?: Record<string, unknown>): void;
}

export function createLogger(module: string): Logger {
  const emit = (level: LogLevel, action: string, meta?: Record<string, unknown>) => {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;

    const ts = new Date().toISOString().slice(11, 23);
    const metaStr = meta ? ' — ' + JSON.stringify(meta) : '';

    if (typeof window === 'undefined') {
      // Server-side: structured JSON
      const entry = { level, module, action, ...(meta || {}), timestamp: new Date().toISOString() };
      const method =
        level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
      method(JSON.stringify(entry));
    } else {
      // Client-side: styled console matching cidLog pattern
      const method =
        level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
      method(
        `%c[${module} ${ts}]%c ${action}${metaStr}`,
        `color: ${LEVEL_COLORS[level]}; font-weight: bold`,
        'color: inherit',
      );
    }

    if (level === 'error' && _onError) {
      _onError({ level, module, action, meta, timestamp: new Date().toISOString() });
    }
  };

  return {
    debug: (action, meta) => emit('debug', action, meta),
    info: (action, meta) => emit('info', action, meta),
    warn: (action, meta) => emit('warn', action, meta),
    error: (action, meta) => emit('error', action, meta),
  };
}
