/**
 * Structured logger for QEGOS API.
 *
 * Uses a simple structured JSON logger (no external deps like winston/pino)
 * that automatically enriches every log entry with the current request context
 * (requestId, userId, path) via AsyncLocalStorage.
 *
 * Log levels: error, warn, info, debug
 */

import { getRequestContext } from './requestContext';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  requestId?: string;
  userId?: string;
  method?: string;
  path?: string;
  [key: string]: unknown;
}

let currentLogLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) ?? 'info';

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] <= LOG_LEVEL_PRIORITY[currentLogLevel];
}

function formatEntry(level: LogLevel, message: string, meta?: Record<string, unknown>): LogEntry {
  const ctx = getRequestContext();
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };

  // Enrich with request context if available
  if (ctx) {
    entry.requestId = ctx.requestId;
    if (ctx.userId) entry.userId = ctx.userId;
    if (ctx.method) entry.method = ctx.method;
    if (ctx.path) entry.path = ctx.path;
  }

  // Merge additional metadata
  if (meta) {
    for (const [key, value] of Object.entries(meta)) {
      if (key !== 'timestamp' && key !== 'level' && key !== 'message') {
        entry[key] = value;
      }
    }
  }

  return entry;
}

function writeLog(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;

  const entry = formatEntry(level, message, meta);
  const json = JSON.stringify(entry);

  switch (level) {
    case 'error':
      process.stderr.write(json + '\n');
      break;
    case 'warn':
      process.stderr.write(json + '\n');
      break;
    default:
      process.stdout.write(json + '\n');
      break;
  }
}

/**
 * Structured logger instance.
 * Automatically includes requestId, userId, method, path from AsyncLocalStorage.
 */
export const logger = {
  error(message: string, meta?: Record<string, unknown>): void {
    writeLog('error', message, meta);
  },

  warn(message: string, meta?: Record<string, unknown>): void {
    writeLog('warn', message, meta);
  },

  info(message: string, meta?: Record<string, unknown>): void {
    writeLog('info', message, meta);
  },

  debug(message: string, meta?: Record<string, unknown>): void {
    writeLog('debug', message, meta);
  },

  /**
   * Set the minimum log level. Messages below this level are suppressed.
   */
  setLevel(level: LogLevel): void {
    currentLogLevel = level;
  },

  /**
   * Create a child logger with fixed metadata fields pre-set.
   * Useful for module-specific loggers (e.g., logger.child({ module: 'bullmq' }))
   */
  child(fixedMeta: Record<string, unknown>): {
    error(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
    info(message: string, meta?: Record<string, unknown>): void;
    debug(message: string, meta?: Record<string, unknown>): void;
  } {
    return {
      error(message: string, meta?: Record<string, unknown>): void {
        writeLog('error', message, { ...fixedMeta, ...meta });
      },
      warn(message: string, meta?: Record<string, unknown>): void {
        writeLog('warn', message, { ...fixedMeta, ...meta });
      },
      info(message: string, meta?: Record<string, unknown>): void {
        writeLog('info', message, { ...fixedMeta, ...meta });
      },
      debug(message: string, meta?: Record<string, unknown>): void {
        writeLog('debug', message, { ...fixedMeta, ...meta });
      },
    };
  },
};

export type Logger = typeof logger;
