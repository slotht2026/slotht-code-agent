import { GitNexusWrapper } from './gitnexus-wrapper.js';
import { IncrementalIndexer } from './incremental-indexer.js';
import { ImpactCache } from './impact-cache.js';
import { ProgressLogger } from '../core/progress-logger.js';
import { logger } from '../core/logger.js';

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
    logger.info({ commit: commitHash.slice(0, 7) }, '检测到新提交');

    const changedFiles = await this.indexer.getChangedFiles(commitHash);
    if (changedFiles.length === 0) {
      logger.info('没有变更文件，跳过索引');
      return;
    }

    logger.info({ count: changedFiles.length }, '文件已变更');

    const result = await this.indexer.analyzeIncremental(changedFiles);
    logger.info({
      indexed: result.indexedCount,
      durationMs: result.durationMs,
    }, '索引完成');

    this.impactCache.invalidateByFiles(changedFiles);

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
    logger.info('强制全量索引...');
    const result = await this.gitnexus.analyze();
    if (result.success) {
      logger.info('全量索引完成');
    } else {
      logger.error({ error: result.error }, '全量索引失败');
    }
  }
}
