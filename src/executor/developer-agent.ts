import type { Task } from '../planner/types.js';
import type { LLMProvider, LLMMessage } from '../llm/types.js';
import { AppError, ErrorCode } from '../core/errors.js';
import { logger } from '../core/logger.js';

/**
 * Developer Agent — 调用 LLM 生成代码
 */
export class DeveloperAgent {
  private provider: LLMProvider;
  private maxTokens: number;
  private temperature: number;

  constructor(provider: LLMProvider, options?: { maxTokens?: number; temperature?: number }) {
    this.provider = provider;
    this.maxTokens = options?.maxTokens || 4096;
    this.temperature = options?.temperature ?? 0.1;
  }

  /**
   * 根据任务生成代码
   */
  async generateCode(
    task: Task,
    projectContext: string = '',
    progressLessons: string = ''
  ): Promise<{ code: string; files: Record<string, string> }> {
    const systemPrompt = this.buildSystemPrompt(projectContext, progressLessons);
    const userPrompt = this.buildUserPrompt(task);

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    try {
      const response = await this.provider.complete({
        messages,
        maxTokens: this.maxTokens,
        temperature: this.temperature,
      });

      logger.info({
        model: response.model,
        usage: response.usage,
        taskId: task.id,
      }, 'Developer Agent 生成完成');

      const files = this.parseResponse(response.content);
      return { code: response.content, files };
    } catch (error: any) {
      throw new AppError(
        `Developer Agent 调用失败: ${error.message}`,
        ErrorCode.TASK_GENERATION_FAILED,
        error,
        { taskId: task.id }
      );
    }
  }

  /**
   * 构建系统提示
   */
  private buildSystemPrompt(projectContext: string, lessons: string): string {
    return `你是一个专业的软件开发 Agent。

## 核心原则
1. 先想后写 — 显式声明假设，不确定时主动提问
2. 极简至上 — 不为一次性代码做抽象
3. 手术式修改 — 只触碰必须改动的代码
4. 目标驱动 — 将模糊任务转化为可验证目标

${projectContext ? `## 项目上下文\n${projectContext}\n` : ''}
${lessons ? `## 历史教训\n${lessons}\n` : ''}

## 输出格式
你必须使用以下格式回复：

\`\`\`filepath: path/to/file.ts
// 代码内容
\`\`\`

每个文件用一个代码块，以 filepath: 开头指定路径。

## 重要约束
- 如果生成 package.json，必须包含 vitest 作为 devDependency，且 test 脚本设为 "vitest run"
- 如果生成 tsconfig.json，target 设为 ES2022，module 设为 Node16，moduleResolution 设为 Node16
- 所有 TypeScript 文件使用 ES Module 格式（import/export）
- 生成的代码必须是完整可运行的，不要留 TODO 或占位符`;
  }

  /**
   * 构建用户提示
   */
  private buildUserPrompt(task: Task): string {
    const criteria = task.acceptanceCriteria.map((c) => `- ${c}`).join('\n');
    return `## 任务

**ID**: ${task.id}
**标题**: ${task.title}
${task.description ? `**描述**: ${task.description}` : ''}

### 验收标准

${criteria}

请生成满足所有验收标准的完整代码。每个文件都必须是可运行的，不要包含任何 TODO 或占位符。`;
  }

  /**
   * 解析 LLM 响应，提取文件
   */
  private parseResponse(response: string): Record<string, string> {
    const files: Record<string, string> = {};
    const fileRegex = /```filepath:\s*([^\n]+)\n([\s\S]*?)```/g;
    let match;

    while ((match = fileRegex.exec(response)) !== null) {
      const filePath = match[1].trim();
      const content = match[2].trim();
      if (filePath && content) {
        files[filePath] = content;
      }
    }

    return files;
  }
}
