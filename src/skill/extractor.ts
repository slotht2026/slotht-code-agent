import type { Skill, SkillCategory } from '../planner/types.js';

/**
 * 技能提取器 — 从完成的任务中提取可复用模式
 */
export class SkillExtractor {
  /**
   * 从任务和代码变更中提取技能
   */
  async extractSkill(
    taskId: string,
    title: string,
    codeChanges: string
  ): Promise<Skill | null> {
    // 识别代码模式
    const category = this.detectPattern(codeChanges);
    if (!category) return null;

    const skill: Skill = {
      name: `${category}-${taskId}`,
      description: title,
      pattern: this.extractPattern(codeChanges),
      template: this.generateTemplate(codeChanges),
      examples: [this.generateExample(taskId, codeChanges)],
      category,
    };

    return skill;
  }

  /**
   * 检测代码模式
   */
  private detectPattern(code: string): SkillCategory | null {
    const lower = code.toLowerCase();
    if (lower.includes('auth') || lower.includes('login') || lower.includes('password')) {
      return 'auth';
    }
    if (lower.includes('database') || lower.includes('query') || lower.includes('model')) {
      return 'database';
    }
    if (lower.includes('api') || lower.includes('route') || lower.includes('endpoint')) {
      return 'api';
    }
    if (lower.includes('test') || lower.includes('spec')) {
      return 'testing';
    }
    if (lower.includes('component') || lower.includes('ui') || lower.includes('view')) {
      return 'ui';
    }
    return 'other';
  }

  /**
   * 提取可复用模式
   */
  private extractPattern(code: string): string {
    // 简化版：提取 import/export 结构
    const lines = code.split('\n');
    const imports = lines.filter((l) => l.startsWith('import ')).join('\n');
    const exports = lines.filter((l) => l.startsWith('export ')).join('\n');
    return `${imports}\n\n// ...\n\n${exports}`;
  }

  /**
   * 生成代码模板
   */
  private generateTemplate(code: string): string {
    // 简化版：保留函数骨架
    const funcRegex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\([^)]*\)\s*\{/g;
    const matches = [...code.matchAll(funcRegex)];
    if (matches.length === 0) return code;

    return matches
      .map((m) => `${m[0]}\n  // TODO: implement\n}`)
      .join('\n\n');
  }

  /**
   * 生成使用示例
   */
  private generateExample(taskId: string, code: string): string {
    return `// 示例：${taskId}\n// 从实际代码中提取的用法\n${code.slice(0, 200)}...`;
  }
}
