import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Git 操作封装
 */
export class GitOps {
  private cwd: string;

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd;
  }

  async add(pattern: string = '.'): Promise<void> {
    await execAsync(`git add ${pattern}`, { cwd: this.cwd });
  }

  async commit(message: string): Promise<void> {
    await execAsync(`git commit -m "${message}"`, { cwd: this.cwd });
  }

  async push(branch?: string): Promise<void> {
    const cmd = branch ? `git push origin ${branch}` : 'git push';
    await execAsync(cmd, { cwd: this.cwd });
  }

  async getChangedFiles(fromCommit?: string): Promise<string[]> {
    const cmd = fromCommit
      ? `git diff --name-only ${fromCommit}`
      : 'git diff --name-only HEAD~1';
    const { stdout } = await execAsync(cmd, { cwd: this.cwd });
    return stdout.split('\n').filter(Boolean);
  }

  async getCurrentBranch(): Promise<string> {
    const { stdout } = await execAsync('git branch --show-current', { cwd: this.cwd });
    return stdout.trim();
  }

  async createBranch(name: string): Promise<void> {
    await execAsync(`git checkout -b ${name}`, { cwd: this.cwd });
  }
}
