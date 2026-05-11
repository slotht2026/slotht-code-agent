import { GitOps } from './git-ops.js';
import type { Task } from '../planner/types.js';

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
      console.log(`❌ 测试未通过，跳过提交: ${task.id}`);
      return null;
    }

    const message = `feat: [${task.id}] ${task.title}`;

    try {
      await this.git.add('.');
      await this.git.commit(message);
      console.log(`✅ 已提交: ${message}`);
      return message;
    } catch (error: any) {
      console.error(`提交失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 测试失败时回滚变更
   */
  async rollbackOnTestFail(task: Task): Promise<void> {
    try {
      await this.git.add('.');
      await this.git.commit(`revert: [${task.id}] 测试失败回滚`);
    } catch {
      console.log('⚠️  回滚失败（可能没有变更）');
    }
  }
}
