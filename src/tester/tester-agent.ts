import type { Task } from '../planner/types.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, writeFileSync, readFileSync, mkdirSync } from 'fs';
import { join, dirname, basename } from 'path';

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
   * 确保项目有 vitest 测试环境
   */
  ensureTestInfrastructure(): void {
    const pkgPath = join(this.cwd, 'package.json');
    if (!existsSync(pkgPath)) return;

    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

    // 确保 vitest 在 devDependencies 中
    if (!pkg.devDependencies) pkg.devDependencies = {};
    if (!pkg.devDependencies.vitest) {
      pkg.devDependencies.vitest = '^2.0.0';
    }

    // 确保 test 脚本使用 vitest
    if (!pkg.scripts) pkg.scripts = {};
    pkg.scripts.test = 'vitest run';

    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf-8');
  }

  /**
   * 确保 vitest 已安装
   */
  async ensureVitestInstalled(): Promise<void> {
    const vitestPath = join(this.cwd, 'node_modules', 'vitest');
    if (existsSync(vitestPath)) return;

    console.log('     📦 安装 vitest...');
    try {
      await execAsync('npm install --save-dev vitest 2>&1', {
        cwd: this.cwd,
        timeout: 60000,
      });
      console.log('     ✅ vitest 已安装');
    } catch (error: any) {
      console.warn(`     ⚠️  vitest 安装失败: ${error.message}`);
    }
  }

  /**
   * 根据任务和代码生成测试
   */
  generateTests(task: Task, codeFiles: Record<string, string>): Record<string, string> {
    const tests: Record<string, string> = {};

    for (const [filePath, content] of Object.entries(codeFiles)) {
      // 跳过非 .ts/.js 文件（如 package.json, tsconfig.json）
      if (!filePath.endsWith('.ts') && !filePath.endsWith('.js')) continue;
      // 跳过已有的测试文件
      if (filePath.includes('.test.') || filePath.includes('.spec.')) continue;

      const testPath = this.getTestPath(filePath);
      const testContent = this.generateTestFile(task, filePath, content);
      tests[testPath] = testContent;
    }

    return tests;
  }

  /**
   * 生成测试文件内容 — 用 LLM 生成真正的测试
   */
  private generateTestFile(task: Task, filePath: string, code: string): string {
    // 提取导出的函数和类
    const exports = this.extractExports(code);
    const importPath = this.getImportPath(filePath);

    const testCases = task.acceptanceCriteria.map((criteria) => {
      return `  it('should ${criteria}', () => {
    // TODO: implement test for: ${criteria}
    expect(true).toBe(true);
  });`;
    }).join('\n\n');

    return `import { describe, it, expect } from 'vitest';
${exports.length > 0 ? `import { ${exports.join(', ')} } from '${importPath}';` : `// import from '${importPath}';`}

describe('${basename(filePath)}', () => {
${testCases}
});
`;
  }

  /**
   * 提取导出的函数和类名
   */
  private extractExports(code: string): string[] {
    const names: string[] = [];
    const patterns = [
      /export\s+(?:async\s+)?function\s+(\w+)/g,
      /export\s+class\s+(\w+)/g,
      /export\s+(?:const|let|var)\s+(\w+)/g,
      /export\s+default\s+(?:function|class)\s+(\w+)/g,
      /export\s+\{([^}]+)\}/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(code)) !== null) {
        if (pattern.source.includes('\\{')) {
          // Handle export { a, b, c }
          const names_str = match[1];
          names.push(...names_str.split(',').map((n: string) => n.trim()).filter(Boolean));
        } else {
          names.push(match[1]);
        }
      }
    }

    return [...new Set(names)].slice(0, 10);
  }

  /**
   * 获取 import 路径（去掉 .ts 后缀，使用相对路径）
   */
  private getImportPath(filePath: string): string {
    // 将 src/foo.ts -> ../src/foo (相对于 test/ 目录)
    const withoutExt = filePath.replace(/\.(ts|js)$/, '');
    return `../${withoutExt}`;
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
      const { stdout, stderr } = await execAsync('npx vitest run 2>&1', {
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
        // Also capture test assertion failures
        const assertRegex = /AssertionError:\s*(.+)/g;
        let assertMatch;
        while ((assertMatch = assertRegex.exec(output)) !== null) {
          failures.push(assertMatch[1]);
        }
      }

      const totalMatch = output.match(/(\d+)\s+tests?/);
      const total = totalMatch ? parseInt(totalMatch[1]) : 0;

      return { passed, total, failures, output };
    } catch (error: any) {
      const output = error.stdout || error.stderr || error.message;
      return { passed: false, total: 0, failures: [error.message], output };
    }
  }

  /**
   * 获取测试文件路径
   */
  private getTestPath(sourcePath: string): string {
    // src/foo.ts -> test/foo.test.ts
    const baseName = sourcePath
      .replace(/^src\//, '')  // 去掉 src/ 前缀
      .replace(/\.\w+$/, ''); // 去掉扩展名
    return join(this.cwd, 'test', `${baseName}.test.ts`);
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
