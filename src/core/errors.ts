/**
 * 统一错误类型体系
 */

/** 错误码 */
export enum ErrorCode {
  // LLM 相关
  LLM_REQUEST_FAILED = 'LLM_REQUEST_FAILED',
  LLM_TIMEOUT = 'LLM_TIMEOUT',
  LLM_RATE_LIMITED = 'LLM_RATE_LIMITED',
  LLM_INVALID_RESPONSE = 'LLM_INVALID_RESPONSE',

  // 任务执行相关
  TASK_GENERATION_FAILED = 'TASK_GENERATION_FAILED',
  TASK_TEST_FAILED = 'TASK_TEST_FAILED',
  TASK_MAX_RETRIES = 'TASK_MAX_RETRIES',

  // Git 相关
  GIT_OPERATION_FAILED = 'GIT_OPERATION_FAILED',
  GIT_PUSH_FAILED = 'GIT_PUSH_FAILED',

  // PRD 相关
  PRD_NOT_FOUND = 'PRD_NOT_FOUND',
  PRD_INVALID = 'PRD_INVALID',

  // 配置相关
  CONFIG_MISSING = 'CONFIG_MISSING',
  CONFIG_INVALID = 'CONFIG_INVALID',

  // 通用
  UNKNOWN = 'UNKNOWN',
  ABORTED = 'ABORTED',
}

/** 统一应用错误 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: ErrorCode,
    public readonly cause?: Error,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }

  static fromError(error: Error, code: ErrorCode, context?: Record<string, unknown>): AppError {
    return new AppError(error.message, code, error, context);
  }

  static isAppError(error: unknown): error is AppError {
    return error instanceof AppError;
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      cause: this.cause?.message,
    };
  }
}
