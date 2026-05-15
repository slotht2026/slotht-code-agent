import type { InterviewAnswer, PRD, Module, Task } from './types.js';
import type { LLMProvider, LLMMessage } from '../llm/types.js';
import { AppError, ErrorCode } from '../core/errors.js';
import { logger } from '../core/logger.js';

/**
 * 根据用户输入和 Interview 答案生成结构化 PRD（使用 LLM）
 */
export async function generatePRD(
  userInput: string,
  answers: InterviewAnswer[],
  provider?: LLMProvider
): Promise<PRD> {
  // 如果没有 LLM provider，使用降级方案
  if (!provider) {
    logger.warn('无 LLM Provider，使用模板 PRD 生成');
    return generateTemplatePRD(userInput, answers);
  }

  const answerSummary = answers
    .map((a) => `- ${a.questionId}: ${a.selectedOption}${a.reasoning ? ` (${a.reasoning})` : ''}`)
    .join('\n');

  const messages: LLMMessage[] = [
    {
      role: 'system',
      content: `你是一个资深产品经理兼技术架构师。根据用户需求和 Interview 答案，生成详细的 PRD（产品需求文档）。

输出必须是严格的 JSON 格式，结构如下：
{
  "project": "项目名称（简短）",
  "description": "项目详细描述，包含技术栈选择",
  "modules": [
    {
      "id": "module-xxx",
      "name": "模块名称",
      "description": "模块描述",
      "tasks": [
        {
          "id": "T-xxx",
          "title": "任务标题",
          "description": "任务详细描述",
          "acceptanceCriteria": ["验收标准1", "验收标准2"],
          "priority": 1,
          "passes": false,
          "dependencies": ["T-yyy"],
          "estimatedEffort": "30min"
        }
      ]
    }
  ],
  "globalAcceptanceCriteria": ["全局验收标准"],
  "technicalConstraints": ["技术约束"]
}

要求：
1. 模块划分要合理，每个模块职责单一
2. 任务粒度适中，每个任务 15-60 分钟可完成
3. 依赖关系要正确，不能有循环依赖
4. 验收标准必须具体可测试
5. 至少包含：基础设施模块、核心功能模块、测试模块
6. 根据 Interview 答案选择合适的技术栈`,
    },
    {
      role: 'user',
      content: `## 用户需求
${userInput}

## Interview 答案
${answerSummary}

请生成完整的 PRD JSON。`,
    },
  ];

  try {
    const response = await provider.complete({
      messages,
      maxTokens: 4096,
      temperature: 0.2,
    });

    // 提取 JSON
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('LLM 响应中未找到 JSON');
    }

    const prd = JSON.parse(jsonMatch[0]) as PRD;

    // 验证 PRD 结构
    validatePRD(prd);

    logger.info({
      modules: prd.modules.length,
      tasks: prd.modules.reduce((s, m) => s + m.tasks.length, 0),
      usage: response.usage,
    }, 'PRD 生成完成');

    return prd;
  } catch (error: any) {
    logger.warn({ error: error.message }, 'LLM PRD 生成失败，降级到模板');
    return generateTemplatePRD(userInput, answers);
  }
}

/**
 * 验证 PRD 结构完整性
 */
function validatePRD(prd: PRD): void {
  if (!prd.project) throw new Error('PRD 缺少 project 字段');
  if (!prd.modules || !Array.isArray(prd.modules) || prd.modules.length === 0) {
    throw new Error('PRD 缺少 modules 或为空');
  }

  const allTaskIds = new Set<string>();
  for (const mod of prd.modules) {
    if (!mod.tasks || !Array.isArray(mod.tasks)) {
      throw new Error(`模块 ${mod.id} 缺少 tasks`);
    }
    for (const task of mod.tasks) {
      if (!task.id || !task.title) {
        throw new Error(`任务缺少 id 或 title`);
      }
      if (allTaskIds.has(task.id)) {
        throw new Error(`任务 ID 重复: ${task.id}`);
      }
      allTaskIds.add(task.id);
      // 确保必要字段有默认值
      task.passes = task.passes ?? false;
      task.priority = task.priority ?? 5;
      task.acceptanceCriteria = task.acceptanceCriteria || [];
    }
  }

  // 验证依赖引用有效性
  for (const mod of prd.modules) {
    for (const task of mod.tasks) {
      for (const dep of task.dependencies || []) {
        if (!allTaskIds.has(dep)) {
          logger.warn({ taskId: task.id, dependency: dep }, '任务依赖引用不存在');
        }
      }
    }
  }
}

/**
 * 模板 PRD 生成（降级方案）
 */
function generateTemplatePRD(userInput: string, answers: InterviewAnswer[]): PRD {
  const answerMap = new Map(answers.map((a) => [a.questionId, a.selectedOption]));

  const dbAnswer = answerMap.get('database') || 'postgres_prisma';
  const frontendAnswer = answerMap.get('frontend') || 'backend_only';

  const TECH_MAP: Record<string, { stack: string; deps: string[] }> = {
    postgres_prisma: { stack: 'PostgreSQL + Prisma ORM', deps: ['pg', 'prisma', '@prisma/client'] },
    mysql_typeorm: { stack: 'MySQL + TypeORM', deps: ['mysql2', 'typeorm'] },
    mongodb_mongoose: { stack: 'MongoDB + Mongoose', deps: ['mongoose'] },
    sqlite_drizzle: { stack: 'SQLite + Drizzle ORM', deps: ['drizzle-orm', 'better-sqlite3'] },
  };

  const FRONTEND_MAP: Record<string, string> = {
    react_ant: 'React + Ant Design',
    vue_element: 'Vue 3 + Element Plus',
    next_tailwind: 'Next.js + Tailwind CSS',
    backend_only: '仅后端 API',
  };

  const dbConfig = TECH_MAP[dbAnswer] || TECH_MAP.postgres_prisma;
  const frontendStack = FRONTEND_MAP[frontendAnswer] || '仅后端 API';

  return {
    project: userInput.slice(0, 50),
    description: `${userInput}\n\n技术栈: ${dbConfig.stack}${frontendStack !== '仅后端 API' ? ` + ${frontendStack}` : ''}`,
    modules: [
      {
        id: 'module-infra',
        name: '基础设施',
        description: '项目初始化、数据库配置',
        tasks: [
          {
            id: 'T-101',
            title: '初始化项目结构和构建配置',
            acceptanceCriteria: [
              '创建标准项目目录结构',
              `配置 ${dbConfig.stack}`,
              'TypeScript 编译通过',
              'npm test 运行成功',
            ],
            priority: 1,
            passes: false,
            estimatedEffort: '15min',
          },
          {
            id: 'T-102',
            title: '配置数据库连接',
            acceptanceCriteria: [
              '数据库连接池配置正确',
              `ORM 模型文件创建 (${dbConfig.stack})`,
              '数据库迁移脚本可执行',
            ],
            priority: 2,
            passes: false,
            estimatedEffort: '20min',
            dependencies: ['T-101'],
          },
        ],
      },
      {
        id: 'module-core',
        name: '核心功能',
        description: userInput,
        tasks: [
          {
            id: 'T-201',
            title: '实现核心业务逻辑',
            acceptanceCriteria: [
              'API 接口实现完成',
              '输入验证通过 Zod',
              '错误处理统一格式',
            ],
            priority: 1,
            passes: false,
            estimatedEffort: '30min',
            dependencies: ['T-102'],
          },
        ],
      },
      {
        id: 'module-test',
        name: '测试与质量',
        description: '单元测试、集成测试',
        tasks: [
          {
            id: 'T-301',
            title: '编写单元测试',
            acceptanceCriteria: [
              '核心业务逻辑测试覆盖 >80%',
              '所有测试通过',
            ],
            priority: 2,
            passes: false,
            estimatedEffort: '20min',
            dependencies: ['T-201'],
          },
        ],
      },
    ],
    globalAcceptanceCriteria: [
      '所有 TypeScript 文件编译通过',
      '单元测试覆盖率 >80%',
      'ESLint 和 Prettier 检查通过',
    ],
    technicalConstraints: [
      'Node.js >= 20.0.0',
      'TypeScript >= 5.0.0',
      '使用 ES Module 格式',
      '所有 API 支持 async/await',
    ],
  };
}
