import { GitNexusWrapper } from './gitnexus-wrapper.js';
import { IncrementalIndexer } from './incremental-indexer.js';
import { ImpactCache } from './impact-cache.js';
import { ProgressLogger } from '../executor/ralph-loop.js';

/**
 * 知识图谱更新触发器
 */
export class KnowledgeUpdater {
  private gitnexus: GitNexusWrapper;
  private indexer: IncrementalIndexer;
  private impactCache: ImpactCache;
  private progress: ProgressLogger;

  constructor(repoPath: string = process.cwd()) {
    this.gitnexus = new GitNexusWrapper(repoPath);
    this.indexer = new IncrementalIndexer(repoPath);
    this.impactCache = new ImpactCache(repoPath);
    this.progress = new ProgressLogger(repoPath);
  }

  /**
   * 在代码提交后自动触发知识图谱更新
   */
  async updateOnCommit(commitHash: string): Promise<void> {
    console.log(`🧠 检测到新提交：${commitHash.slice(0, 7)}`);

    // 1. 获取变更文件
    const changedFiles = await this.indexer.getChangedFiles(commitHash);
    if (changedFiles.length === 0) {
      console.log('ℹ️  没有变更文件，跳过索引');
      return;
    }

    console.log(`📝 ${changedFiles.length} 个文件已变更`);

    // 2. 增量索引
    const result = await this.indexer.analyzeIncremental(changedFiles);
    console.log(`✅ 索引完成：${result.indexedCount} 个文件，耗时 ${result.durationMs}ms`);

    // 3. 清除受影响的缓存
    this.impactCache.invalidateByFiles(changedFiles);

    // 4. 记录到进度日志
    this.progress.appendLesson('knowledge-update', `
提交 ${commitHash.slice(0, 7)} 触发知识图谱更新
- 变更文件：${changedFiles.length} 个
- 索引成功：${result.indexedCount} 个
- 耗时：${result.durationMs}ms
`);
  }

  /**
   * 手动触发全量索引
   */
  async forceFullIndex(): Promise<void> {
    console.log('🧠 强制全量索引...');
    const result = await this.gitnexus.analyze();
    if (result.success) {
      console.log('✅ 全量索引完成');
    } else {
      console.error(`❌ 全量索引失败：${result.error}`);
    }
  }
}
