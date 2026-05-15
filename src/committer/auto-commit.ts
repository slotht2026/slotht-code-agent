import { GitOps } from './git-ops.js';
import type { Task } from '../planner/types.js';
import { logger } from '../core/logger.js';

/**
 * 测试通过后自动提交
 */
export class AutoCommit {
  private git: GitOps;

  constructor(cwd: string = process.cwd()) {
    this.git = new GitOps(cwd);
  }

  /**
   * 测试通过后提交变更
   */
  async commitOnTestPass(
    task: Task,
    testResults: { passed: boolean; failures: string[] }
  ): Promise<string | null> {
    if (!testResults.passed) {
      logger.warn({ taskId: task.id }, '测试未通过，跳过提交');
      return null;
    }

    const message = `feat: [${task.id}] ${task.title}`;

    try {
      await this.git.add('.');
      await this.git.commit(message);
      logger.info({ message }, '已提交');
      return message;
    } catch (error: any) {
      logger.error({ error: error.message }, '提交失败');
      return null;
    }
  }
}
