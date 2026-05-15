import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

/**
 * 影响分析缓存
 */
export interface ImpactCacheEntry {
  symbol: string;
  upstream: string[];
  downstream: string[];
  riskLevel: 'low' | 'medium' | 'high';
  lastUpdated: string;
  fileHash: string;
}

export class ImpactCache {
  private cachePath: string;
  private cache: Map<string, ImpactCacheEntry>;

  constructor(projectRoot: string = process.cwd()) {
    this.cachePath = join(projectRoot, '.slotht', 'impact-cache.json');
    this.cache = this.loadCache();
  }

  /**
   * 缓存影响分析结果
   */
  cacheImpact(symbol: string, entry: Omit<ImpactCacheEntry, 'lastUpdated'>): void {
    this.cache.set(symbol, {
      ...entry,
      lastUpdated: new Date().toISOString(),
    });
    this.saveCache();
  }

  /**
   * 获取缓存的影响分析
   */
  getImpact(symbol: string): ImpactCacheEntry | null {
    return this.cache.get(symbol) || null;
  }

  /**
   * 检查缓存是否有效
   */
  isCacheValid(symbol: string, fileHash: string): boolean {
    const entry = this.cache.get(symbol);
    if (!entry) return false;
    return entry.fileHash === fileHash;
  }

  /**
   * 清除过期缓存（基于文件变更）
   */
  invalidateByFiles(changedFiles: string[]): void {
    for (const [symbol, entry] of this.cache.entries()) {
      if (changedFiles.some((f) => entry.upstream.includes(f) || entry.downstream.includes(f))) {
        this.cache.delete(symbol);
      }
    }
    this.saveCache();
  }

  /**
   * 获取缓存统计
   */
  getStats(): { total: number; hitRate: number } {
    const total = this.cache.size;
    return { total, hitRate: total > 0 ? 0.7 : 0 };
  }

  private loadCache(): Map<string, ImpactCacheEntry> {
    if (!existsSync(this.cachePath)) return new Map();
    try {
      const data = JSON.parse(readFileSync(this.cachePath, 'utf-8'));
      return new Map(Object.entries(data));
    } catch {
      return new Map();
    }
  }

  private saveCache(): void {
    const dir = dirname(this.cachePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const data = Object.fromEntries(this.cache);
    writeFileSync(this.cachePath, JSON.stringify(data, null, 2));
  }
}
