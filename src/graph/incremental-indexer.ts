import { exec } from 'child_process';
import { promisify } from 'util';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const execAsync = promisify(exec);

/**
 * 增量索引器 — 只分析变更文件
 */
export class IncrementalIndexer {
  private repoPath: string;
  private metaPath: string;

  constructor(repoPath: string = process.cwd()) {
    this.repoPath = repoPath;
    this.metaPath = join(repoPath, '.gitnexus', 'meta.json');
  }

  /**
   * 获取变更文件列表
   */
  async getChangedFiles(fromCommit?: string): Promise<string[]> {
    try {
      const lastIndexed = this.getLastIndexedCommit();
      const commitRef = fromCommit || lastIndexed || 'HEAD~1';
      const { stdout } = await execAsync(
        `git diff --name-only ${commitRef}`,
        { cwd: this.repoPath, timeout: 10000 }
      );
      return stdout.split('\n').filter(Boolean);
    } catch {
      // 如果无法获取变更，返回所有文件
      return this.getAllFiles();
    }
  }

  /**
   * 增量索引
   */
  async analyzeIncremental(changedFiles: string[]): Promise<{
    success: boolean;
    indexedCount: number;
    skippedCount: number;
    durationMs: number;
  }> {
    const startTime = Date.now();
    const maxFilesPerBatch = 100;
    let indexedCount = 0;

    // 分批索引，每批最多 100 个文件
    for (let i = 0; i < changedFiles.length; i += maxFilesPerBatch) {
      const batch = changedFiles.slice(i, i + maxFilesPerBatch);
      const fileList = batch.join(' ');

      try {
        await execAsync(`gitnexus analyze ${fileList}`, {
          cwd: this.repoPath,
          timeout: 30000,
        });
        indexedCount += batch.length;
      } catch (error: any) {
        console.warn(`⚠️  部分文件索引失败: ${batch.join(', ')}`);
      }
    }

    // 更新最后索引的 commit
    this.updateLastIndexedCommit();

    return {
      success: true,
      indexedCount,
      skippedCount: changedFiles.length - indexedCount,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * 获取上次索引的 commit
   */
  private getLastIndexedCommit(): string | null {
    if (!existsSync(this.metaPath)) return null;
    try {
      const meta = JSON.parse(readFileSync(this.metaPath, 'utf-8'));
      return meta.lastCommit || null;
    } catch {
      return null;
    }
  }

  /**
   * 更新最后索引的 commit
   */
  private updateLastIndexedCommit(): void {
    // GitNexus 会自动更新 meta.json
  }

  /**
   * 获取所有文件
   */
  private async getAllFiles(): Promise<string[]> {
    const { stdout } = await execAsync('git ls-files', {
      cwd: this.repoPath,
      timeout: 10000,
    });
    return stdout.split('\n').filter(Boolean);
  }
}
