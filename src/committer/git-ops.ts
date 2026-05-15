import { execFile } from 'child_process';
import { promisify } from 'util';
import { AppError, ErrorCode } from '../core/errors.js';

const execFileAsync = promisify(execFile);

/**
 * Git 操作封装 — 使用 execFile 避免命令注入
 */
export class GitOps {
  private cwd: string;

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd;
  }

  private async run(args: string[]): Promise<string> {
    try {
      const { stdout } = await execFileAsync('git', args, {
        cwd: this.cwd,
        timeout: 30_000,
      });
      return stdout.trim();
    } catch (error: any) {
      throw new AppError(
        `git ${args[0]} 失败: ${error.message}`,
        ErrorCode.GIT_OPERATION_FAILED,
        error,
        { args }
      );
    }
  }

  async add(pattern: string = '.'): Promise<void> {
    await this.run(['add', pattern]);
  }

  async commit(message: string): Promise<void> {
    // 使用 -m 参数传递 message，execFile 自动处理转义
    await this.run(['commit', '-m', message]);
  }

  async push(branch?: string): Promise<void> {
    try {
      if (branch) {
        await this.run(['push', 'origin', branch]);
      } else {
        await this.run(['push']);
      }
    } catch (error: any) {
      throw new AppError(
        `git push 失败: ${error.message}`,
        ErrorCode.GIT_PUSH_FAILED,
        error
      );
    }
  }

  async getChangedFiles(fromCommit?: string): Promise<string[]> {
    const args = fromCommit
      ? ['diff', '--name-only', fromCommit]
      : ['diff', '--name-only', 'HEAD~1'];
    const stdout = await this.run(args);
    return stdout.split('\n').filter(Boolean);
  }

  async getCurrentBranch(): Promise<string> {
    return await this.run(['branch', '--show-current']);
  }

  async createBranch(name: string): Promise<void> {
    await this.run(['checkout', '-b', name]);
  }

  async status(): Promise<string> {
    return await this.run(['status', '--porcelain']);
  }

  async getLastCommitHash(): Promise<string> {
    return await this.run(['rev-parse', 'HEAD']);
  }
}
