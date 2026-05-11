import { GitHubClient } from './github-client.js';
import { AutoCommit } from './auto-commit.js';
import type { Task } from '../planner/types.js';

/**
 * PR 创建器
 */
export class PRCreator {
  private github: GitHubClient;
  private autoCommit: AutoCommit;

  constructor(github: GitHubClient, cwd: string = process.cwd()) {
    this.github = github;
    this.autoCommit = new AutoCommit(cwd);
  }

  /**
   * 任务完成后创建 PR
   */
  async createPRForTask(
    task: Task,
    branchName: string
  ): Promise<{ number: number; url: string } | null> {
    try {
      // 创建分支
      await this.github.createBranch(branchName);
      console.log(`🌿 分支已创建：${branchName}`);

      // 创建 PR
      const pr = await this.github.createPR(task, branchName);
      console.log(`📝 PR 已创建：#${pr.number} - ${pr.url}`);

      return pr;
    } catch (error: any) {
      console.error(`创建 PR 失败：${error.message}`);
      return null;
    }
  }
}

/**
 * 提交历史追踪
 */
export class CommitTracker {
  private storagePath: string;

  constructor(cwd: string = process.cwd()) {
    this.storagePath = `${cwd}/.slotht/commits.json`;
  }

  /**
   * 记录提交
   */
  recordCommit(taskId: string, commitHash: string, message: string): void {
    const commits = this.loadCommits();
    commits.push({ taskId, commitHash, message, timestamp: new Date().toISOString() });
    this.saveCommits(commits);
  }

  /**
   * 获取任务的提交历史
   */
  getTaskCommits(taskId: string): Array<{ commitHash: string; message: string; timestamp: string }> {
    const commits = this.loadCommits();
    return commits.filter((c) => c.taskId === taskId);
  }

  private loadCommits(): any[] {
    try {
      const fs = require('fs');
      if (fs.existsSync(this.storagePath)) {
        return JSON.parse(fs.readFileSync(this.storagePath, 'utf-8'));
      }
    } catch {
      // ignore
    }
    return [];
  }

  private saveCommits(commits: any[]): void {
    const fs = require('fs');
    const path = require('path');
    fs.mkdirSync(path.dirname(this.storagePath), { recursive: true });
    fs.writeFileSync(this.storagePath, JSON.stringify(commits, null, 2));
  }

  /**
   * 导出提交报告
   */
  exportReport(): string {
    const commits = this.loadCommits();
    const report = commits
      .map((c) => `${c.timestamp} [${c.taskId}] ${c.message} (${c.commitHash.slice(0, 7)})`)
      .join('\n');
    return report;
  }
}
