import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface GitNexusResult {
  success: boolean;
  output?: string;
  error?: string;
}

export interface SymbolInfo {
  name: string;
  type: string;
  file: string;
}

export interface ImpactResult {
  upstream: string[];
  downstream: string[];
  riskLevel: 'low' | 'medium' | 'high';
}

/**
 * GitNexus 封装模块
 */
export class GitNexusWrapper {
  private repoPath: string;

  constructor(repoPath: string = process.cwd()) {
    this.repoPath = repoPath;
  }

  /**
   * 索引项目代码
   */
  async analyze(): Promise<GitNexusResult> {
    try {
      const { stdout } = await execAsync('gitnexus analyze', {
        cwd: this.repoPath,
        timeout: 120000,
      });
      return { success: true, output: stdout };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 查询代码
   */
  async query(searchTerm: string, limit: number = 10): Promise<GitNexusResult> {
    try {
      const { stdout } = await execAsync(
        `gitnexus query "${searchTerm}" --limit ${limit}`,
        { cwd: this.repoPath, timeout: 30000 }
      );
      return { success: true, output: stdout };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 查看符号上下文
   */
  async context(symbol: string): Promise<GitNexusResult> {
    try {
      const { stdout } = await execAsync(
        `gitnexus context --symbol "${symbol}"`,
        { cwd: this.repoPath, timeout: 30000 }
      );
      return { success: true, output: stdout };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 分析影响范围
   */
  async impact(symbol: string): Promise<GitNexusResult> {
    try {
      const { stdout } = await execAsync(
        `gitnexus impact --symbol "${symbol}"`,
        { cwd: this.repoPath, timeout: 30000 }
      );
      return { success: true, output: stdout };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}
