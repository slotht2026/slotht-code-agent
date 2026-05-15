import type { Skill, SkillCategory } from '../planner/types.js';
import type { LLMProvider, LLMMessage } from '../llm/types.js';
import { logger } from '../core/logger.js';

/**
 * 技能提取器 — 使用 LLM 从完成的任务中提取可复用模式
 */
export class SkillExtractor {
  private provider: LLMProvider | null;

  constructor(provider?: LLMProvider) {
    this.provider = provider || null;
  }

  /**
   * 从任务和代码变更中提取技能
   */
  async extractSkill(
    taskId: string,
    title: string,
    codeChanges: string
  ): Promise<Skill | null> {
    if (!codeChanges.trim()) return null;

    if (this.provider) {
      return this.extractWithLLM(taskId, title, codeChanges);
    }

    // 降级方案：基础关键词提取
    return this.extractBasic(taskId, title, codeChanges);
  }

  /**
   * 使用 LLM 提取高质量技能
   */
  private async extractWithLLM(taskId: string, title: string, code: string): Promise<Skill | null> {
    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: `你是一个代码模式分析专家。分析给定的代码，提取可复用的编程模式/技能。

输出严格的 JSON 格式：
{
  "name": "技能名称（简短，如 auth-jwt-login）",
  "description": "技能描述",
  "category": "分类，必须是以下之一: auth, database, api, ui, testing, other",
  "pattern": "可复用的代码模式（关键部分，不超过 20 行）",
  "template": "通用模板代码（可填参数的骨架）",
  "examples": ["使用示例代码"]
}

如果代码没有明显的可复用模式，返回 null（输出空 JSON: null）。`,
      },
      {
        role: 'user',
        content: `## 任务: ${title} (${taskId})

## 代码变更
\`\`\`typescript
${code.slice(0, 3000)}
\`\`\`

请提取可复用的技能模式。`,
      },
    ];

    try {
      const response = await this.provider!.complete({
        messages,
        maxTokens: 2048,
        temperature: 0.2,
      });

      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const skill = JSON.parse(jsonMatch[0]) as Skill;
      if (!skill.name || !skill.category) return null;

      logger.info({ skill: skill.name, category: skill.category }, '技能已提取');
      return skill;
    } catch (error: any) {
      logger.warn({ error: error.message }, 'LLM 技能提取失败');
      return this.extractBasic(taskId, title, code);
    }
  }

  /**
   * 基础关键词提取（降级方案）
   */
  private extractBasic(taskId: string, title: string, code: string): Skill | null {
    const category = this.detectPattern(code);
    if (!category) return null;

    const lines = code.split('\n');
    const imports = lines.filter((l) => l.startsWith('import ')).join('\n');
    const exports = lines.filter((l) => l.startsWith('export ')).join('\n');

    return {
      name: `${category}-${taskId}`,
      description: title,
      pattern: `${imports}\n\n// ...\n\n${exports}`,
      template: this.extractFunctionSkeleton(code),
      examples: [code.slice(0, 200)],
      category,
    };
  }

  private detectPattern(code: string): SkillCategory | null {
    const lower = code.toLowerCase();
    if (lower.includes('auth') || lower.includes('login') || lower.includes('password')) return 'auth';
    if (lower.includes('database') || lower.includes('query') || lower.includes('model')) return 'database';
    if (lower.includes('api') || lower.includes('route') || lower.includes('endpoint')) return 'api';
    if (lower.includes('test') || lower.includes('spec')) return 'testing';
    if (lower.includes('component') || lower.includes('ui') || lower.includes('view')) return 'ui';
    return 'other';
  }

  private extractFunctionSkeleton(code: string): string {
    const funcRegex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\([^)]*\)\s*\{/g;
    const matches = [...code.matchAll(funcRegex)];
    if (matches.length === 0) return code;
    return matches.map((m) => `${m[0]}\n  // TODO: implement\n}`).join('\n\n');
  }
}
