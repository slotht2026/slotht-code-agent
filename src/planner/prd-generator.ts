import type { InterviewAnswer, PRD, Module, Task, QuestionCategory } from './types.js';

/**
 * 技术栈映射：根据答案确定技术选型
 */
const TECH_MAP: Record<QuestionCategory, Record<string, { stack: string; deps: string[] }>> = {
  database: {
    postgres_prisma: {
      stack: 'PostgreSQL + Prisma ORM',
      deps: ['pg', 'prisma', '@prisma/client'],
    },
    mysql_typeorm: {
      stack: 'MySQL + TypeORM',
      deps: ['mysql2', 'typeorm', 'reflect-metadata'],
    },
    mongodb_mongoose: {
      stack: 'MongoDB + Mongoose',
      deps: ['mongoose'],
    },
    sqlite_drizzle: {
      stack: 'SQLite + Drizzle ORM',
      deps: ['drizzle-orm', 'better-sqlite3'],
    },
  },
  frontend: {
    react_ant: { stack: 'React + Ant Design', deps: ['react', 'antd'] },
    vue_element: { stack: 'Vue 3 + Element Plus', deps: ['vue', 'element-plus'] },
    next_tailwind: { stack: 'Next.js + Tailwind CSS', deps: ['next', 'tailwindcss'] },
    backend_only: { stack: '仅后端 API', deps: [] },
  },
  auth_method: {
    email_password: { stack: '邮箱 + 密码 (bcrypt)', deps: ['bcrypt'] },
    phone_otp: { stack: '手机号 + 验证码', deps: [] },
    oauth: { stack: 'OAuth 第三方登录', deps: ['passport'] },
    all: { stack: '多种认证方式', deps: ['bcrypt', 'passport'] },
  },
  core_features: {
    basic: { stack: '基础认证', deps: [] },
    with_verification: { stack: '认证 + 邮箱验证', deps: ['nodemailer'] },
    with_2fa: { stack: '认证 + 2FA', deps: ['otplib'] },
    full: { stack: '完整用户系统', deps: ['bcrypt', 'nodemailer', 'otplib'] },
  },
  deployment: {
    docker_cloud: { stack: 'Docker + 云服务器', deps: [] },
    vercel: { stack: 'Vercel 托管', deps: [] },
    local: { stack: '本地开发', deps: [] },
  },
};

/**
 * 根据用户输入和 Interview 答案生成结构化 PRD
 */
export function generatePRD(
  userInput: string,
  answers: InterviewAnswer[]
): PRD {
  const answerMap = new Map(answers.map((a) => [a.questionId, a.selectedOption]));

  // 确定技术栈
  const dbAnswer = answerMap.get('database') || 'postgres_prisma';
  const frontendAnswer = answerMap.get('frontend') || 'backend_only';
  const dbConfig = TECH_MAP.database[dbAnswer];
  const frontendConfig = TECH_MAP.frontend[frontendAnswer];

  let projectDescription = `${userInput}\n\n技术栈: ${dbConfig.stack}`;
  if (frontendConfig.stack !== '仅后端 API') {
    projectDescription += ` + ${frontendConfig.stack}`;
  }

  const modules: Module[] = [];

  // 模块 1: 基础设施
  const infraTasks: Task[] = [
    {
      id: 'US-101',
      title: '初始化项目结构和构建配置',
      acceptanceCriteria: [
        '创建标准项目目录结构',
        `配置 ${dbConfig.stack}`,
        'TypeScript 编译通过',
        'npm test 运行成功',
      ],
      priority: 1,
      passes: false,
      tentacle: 'infra',
      estimatedEffort: '15min',
    },
    {
      id: 'US-102',
      title: '配置数据库连接',
      acceptanceCriteria: [
        '数据库连接池配置正确',
        `ORM 模型文件创建 (${dbConfig.stack})`,
        '数据库迁移脚本可执行',
      ],
      priority: 2,
      passes: false,
      tentacle: 'infra',
      estimatedEffort: '20min',
      dependencies: ['US-101'],
    },
  ];
  modules.push({
    id: 'module-infra',
    name: '基础设施',
    description: '项目初始化、数据库配置',
    tasks: infraTasks,
  });

  // 模块 2: 核心功能
  const coreTasks: Task[] = [
    {
      id: 'US-201',
      title: '实现核心业务逻辑',
      acceptanceCriteria: [
        'API 接口实现完成',
        '输入验证通过 Zod',
        '错误处理统一格式',
      ],
      priority: 1,
      passes: false,
      tentacle: 'core',
      estimatedEffort: '30min',
      dependencies: ['US-102'],
    },
  ];
  modules.push({
    id: 'module-core',
    name: '核心功能',
    description: userInput,
    tasks: coreTasks,
  });

  return {
    project: userInput.slice(0, 50),
    description: projectDescription,
    modules,
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
