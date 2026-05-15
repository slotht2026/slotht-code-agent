import { GitHubClient } from './github-client.js';
import { GitOps } from './git-ops.js';
import type { Task } from '../planner/types.js';
import { logger } from '../core/logger.js';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

/**
 * PR 创建器
 */
export class PRCreator {
  private github: GitHubClient;
  private git: GitOps;

  constructor(github: GitHubClient, cwd: string = process.cwd()) {
    this.github = github;
    this.git = new GitOps(cwd);
  }

  /**
   * 任务完成后创建 PR
   */
  async createPRForTask(
    task: Task,
    branchName: string
  ): Promise<{ number: number; url: string } | null> {
    try {
      await this.github.createBranch(branchName);
      logger.info({ branch: branchName }, '分支已创建');

      const pr = await this.github.createPR(task, branchName);
      logger.info({ prNumber: pr.number, url: pr.url }, 'PR 已创建');

      return pr;
    } catch (error: any) {
      logger.error({ error: error.message }, '创建 PR 失败');
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
    this.storagePath = join(cwd, '.slotht', 'commits.json');
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

  /**
   * 导出提交报告
   */
  exportReport(): string {
    const commits = this.loadCommits();
    return commits
      .map((c) => `${c.timestamp} [${c.taskId}] ${c.message} (${c.commitHash.slice(0, 7)})`)
      .join('\n');
  }

  private loadCommits(): any[] {
    try {
      if (existsSync(this.storagePath)) {
        return JSON.parse(readFileSync(this.storagePath, 'utf-8'));
      }
    } catch {
      // ignore
    }
    return [];
  }

  private saveCommits(commits: any[]): void {
    mkdirSync(join(this.storagePath, '..'), { recursive: true });
    writeFileSync(this.storagePath, JSON.stringify(commits, null, 2));
  }
}
