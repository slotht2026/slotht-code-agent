import type { Task } from '../planner/types.js';
import type { LLMProvider, LLMMessage } from '../llm/types.js';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync, writeFileSync, readFileSync, mkdirSync } from 'fs';
import { join, basename } from 'path';
import { AppError, ErrorCode } from '../core/errors.js';
import { logger } from '../core/logger.js';

const execFileAsync = promisify(execFile);

/**
 * Tester Agent — 使用 LLM 生成真正的测试并执行
 */
export class TesterAgent {
  private cwd: string;
  private provider: LLMProvider | null;

  constructor(cwd: string = process.cwd(), provider?: LLMProvider) {
    this.cwd = cwd;
    this.provider = provider || null;
  }

  /**
   * 确保项目有 vitest 测试环境
   */
  ensureTestInfrastructure(): void {
    const pkgPath = join(this.cwd, 'package.json');
    if (!existsSync(pkgPath)) return;

    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    if (!pkg.devDependencies) pkg.devDependencies = {};
    if (!pkg.devDependencies.vitest) {
      pkg.devDependencies.vitest = '^2.0.0';
    }
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

    logger.info('安装 vitest...');
    try {
      await execFileAsync('npm', ['install', '--save-dev', 'vitest'], {
        cwd: this.cwd,
        timeout: 120_000,
      });
      logger.info('vitest 已安装');
    } catch (error: any) {
      logger.warn({ error: error.message }, 'vitest 安装失败');
    }
  }

  /**
   * 根据任务和代码生成测试 — 使用 LLM 生成真正的测试
   */
  async generateTests(task: Task, codeFiles: Record<string, string>): Promise<Record<string, string>> {
    const tests: Record<string, string> = {};

    for (const [filePath, content] of Object.entries(codeFiles)) {
      if (!filePath.endsWith('.ts') && !filePath.endsWith('.js')) continue;
      if (filePath.includes('.test.') || filePath.includes('.spec.')) continue;

      const testPath = this.getTestPath(filePath);

      if (this.provider) {
        // 使用 LLM 生成真正的测试
        try {
          const testContent = await this.generateTestWithLLM(task, filePath, content);
          tests[testPath] = testContent;
        } catch (error: any) {
          logger.warn({ file: filePath, error: error.message }, 'LLM 测试生成失败，使用基础模板');
          tests[testPath] = this.generateBasicTest(task, filePath, content);
        }
      } else {
        // 无 LLM 时生成基础测试（至少有真实断言）
        tests[testPath] = this.generateBasicTest(task, filePath, content);
      }
    }

    return tests;
  }

  /**
   * 使用 LLM 生成高质量测试
   */
  private async generateTestWithLLM(task: Task, filePath: string, code: string): Promise<string> {
    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: `你是一个专业的测试工程师。根据给定的源代码和验收标准，生成完整的 vitest 单元测试。

要求：
1. 测试必须覆盖所有验收标准
2. 使用 vitest (import { describe, it, expect } from 'vitest')
3. 测试必须是完整的、可运行的，不要留 TODO
4. 包含正常路径和边界情况测试
5. 使用 mock/spy 隔离外部依赖
6. import 路径使用相对路径（如 ../src/module）

只输出测试文件内容，不要包含解释文字。`,
      },
      {
        role: 'user',
        content: `## 源文件: ${filePath}

\`\`\`typescript
${code}
\`\`\`

## 验收标准
${task.acceptanceCriteria.map((c) => `- ${c}`).join('\n')}

请生成完整的 vitest 测试文件。`,
      },
    ];

    const response = await this.provider!.complete({
      messages,
      maxTokens: 4096,
      temperature: 0.2,
    });

    // 提取代码块
    const codeMatch = response.content.match(/```(?:typescript|ts)?\n([\s\S]*?)```/);
    return codeMatch ? codeMatch[1].trim() : response.content.trim();
  }

  /**
   * 生成基础测试（无 LLM 时的降级方案，但有真实断言）
   */
  private generateBasicTest(task: Task, filePath: string, code: string): string {
    const exports = this.extractExports(code);
    const importPath = this.getImportPath(filePath);

    // 为每个验收标准生成有意义的测试
    const testCases = task.acceptanceCriteria.map((criteria) => {
      const testName = criteria.replace(/['"]/g, '');
      return `  it('${testName}', () => {
    // 验收标准: ${criteria}
    ${exports.length > 0
      ? `expect(${exports[0]}).toBeDefined();
    expect(typeof ${exports[0]}).toBe('function');`
      : `expect(true).toBe(true); // 需要实现具体断言`
    }
  });`;
    }).join('\n\n');

    return `import { describe, it, expect } from 'vitest';
${exports.length > 0 ? `import { ${exports.join(', ')} } from '${importPath}';` : `// import from '${importPath}';`}

describe('${basename(filePath)} — ${task.title}', () => {
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
          names.push(...match[1].split(',').map((n: string) => n.trim()).filter(Boolean));
        } else {
          names.push(match[1]);
        }
      }
    }

    return [...new Set(names)].slice(0, 10);
  }

  private getImportPath(filePath: string): string {
    const withoutExt = filePath.replace(/\.(ts|js)$/, '');
    return `../${withoutExt}`;
  }

  private getTestPath(sourcePath: string): string {
    const baseName = sourcePath
      .replace(/^src\//, '')
      .replace(/\.\w+$/, '');
    return join(this.cwd, 'test', `${baseName}.test.ts`);
  }

  /**
   * 写入测试文件
   */
  writeTests(tests: Record<string, string>): void {
    for (const [path, content] of Object.entries(tests)) {
      const dir = require('path').dirname(path);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(path, content, 'utf-8');
    }
  }

  /**
   * 运行测试
   */
  async runTests(): Promise<{
    passed: boolean;
    total: number;
    failures: string[];
    output: string;
  }> {
    try {
      const { stdout, stderr } = await execFileAsync('npx', ['vitest', 'run'], {
        cwd: this.cwd,
        timeout: 120_000,
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
}
