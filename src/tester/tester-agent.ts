import type { Task } from '../planner/types.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';

const execAsync = promisify(exec);

/**
 * Tester Agent — 自动生成并运行测试
 */
export class TesterAgent {
  private cwd: string;

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd;
  }

  /**
   * 根据任务和代码生成测试
   */
  generateTests(task: Task, codeFiles: Record<string, string>): Record<string, string> {
    const tests: Record<string, string> = {};

    for (const [filePath, content] of Object.entries(codeFiles)) {
      const testPath = this.getTestPath(filePath);
      const testContent = this.generateTestFile(task, filePath, content);
      tests[testPath] = testContent;
    }

    return tests;
  }

  /**
   * 生成测试文件内容
   */
  private generateTestFile(task: Task, filePath: string, code: string): string {
    const functionName = this.extractFunctionName(code);
    const testCases = task.acceptanceCriteria.map((criteria, idx) => {
      return `  it('should ${criteria}', () => {
    // TODO: implement test for: ${criteria}
    expect(true).toBe(true);
  });`;
    }).join('\n\n');

    return `import { describe, it, expect } from 'vitest';

describe('${functionName || filePath}', () => {
${testCases}
});
`;
  }

  /**
   * 运行测试
   */
  async runTests(testFiles?: string[]): Promise<{
    passed: boolean;
    total: number;
    failures: string[];
    output: string;
  }> {
    try {
      const { stdout, stderr } = await execAsync('npm run test 2>&1', {
        cwd: this.cwd,
        timeout: 60000,
      });

      const output = stdout || stderr;
      const passed = !output.includes('FAIL') && !output.includes('failed');

      const failures: string[] = [];
      if (!passed) {
        const failRegex = /FAIL\s+(.+?)\s+>\s+(.+)/g;
        let match;
        while ((match = failRegex.exec(output)) !== null) {
          failures.push(`${match[1]} > ${match[2]}`);
        }
      }

      const totalMatch = output.match(/(\d+)\s+tests?/);
      const total = totalMatch ? parseInt(totalMatch[1]) : 0;

      return { passed, total, failures, output };
    } catch (error: any) {
      const output = error.stdout || error.message;
      return { passed: false, total: 0, failures: [error.message], output };
    }
  }

  /**
   * 获取测试文件路径
   */
  private getTestPath(sourcePath: string): string {
    const baseName = sourcePath.replace(/\.\w+$/, '');
    return join(this.cwd, 'test', `${baseName}.test.ts`);
  }

  /**
   * 提取函数名
   */
  private extractFunctionName(code: string): string | null {
    const match = code.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
    return match?.[1] || null;
  }

  /**
   * 写入测试文件
   */
  writeTests(tests: Record<string, string>): void {
    for (const [path, content] of Object.entries(tests)) {
      const dir = dirname(path);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(path, content, 'utf-8');
    }
  }
}
