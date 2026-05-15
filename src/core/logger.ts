import pino from 'pino';

/** 日志级别 */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/** 创建结构化日志器 */
export function createLogger(name: string, level?: LogLevel): pino.Logger {
  return pino({
    name,
    level: level || (process.env.LOG_LEVEL as LogLevel) || 'info',
  });
}

/** 全局日志器 */
export const logger = createLogger('slotht');
