import type { Task } from '../planner/types.js';

/**
 * Developer Agent — 调用 LLM 生成代码
 */
export interface DeveloperAgentConfig {
  model: string;
  apiKey: string;
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
}

export class DeveloperAgent {
  private config: DeveloperAgentConfig;

  constructor(config: DeveloperAgentConfig) {
    this.config = {
      model: config.model || 'gpt-4o',
      apiKey: config.apiKey,
      baseUrl: config.baseUrl || 'https://api.openai.com/v1',
      maxTokens: config.maxTokens || 4000,
      temperature: config.temperature ?? 0.1,
    };
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

    try {
      const response = await this.callLLM(systemPrompt, userPrompt);
      return this.parseResponse(response);
    } catch (error: any) {
      throw new Error(`Developer Agent 调用失败: ${error.message}`);
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
- 所有 TypeScript 文件使用 ES Module 格式（import/export）`;
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

请生成满足所有验收标准的代码。`;
  }

  /**
   * 调用 LLM API
   */
  private async callLLM(systemPrompt: string, userPrompt: string): Promise<string> {
    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`LLM API 错误 (${response.status}): ${error}`);
    }

    const data = (await response.json()) as {
      choices: { message: { content: string } }[];
    };
    return data.choices[0].message.content;
  }

  /**
   * 解析 LLM 响应，提取文件
   */
  private parseResponse(response: string): { code: string; files: Record<string, string> } {
    const files: Record<string, string> = {};
    const fileRegex = /```filepath:\s*([^\n]+)\n([\s\S]*?)```/g;
    let match;

    while ((match = fileRegex.exec(response)) !== null) {
      files[match[1].trim()] = match[2].trim();
    }

    return { code: response, files };
  }
}
