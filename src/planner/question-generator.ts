import type { InterviewQuestion, QuestionCategory } from './types.js';

/** 问题分类常量 */
export const QuestionCategories: Record<string, QuestionCategory> = {
  AUTH_METHOD: 'auth_method',
  CORE_FEATURES: 'core_features',
  DATABASE: 'database',
  FRONTEND: 'frontend',
  DEPLOYMENT: 'deployment',
};

/** 预置的 Interview 问题模板 */
const QUESTION_TEMPLATES: Record<QuestionCategory, Omit<InterviewQuestion, 'category'>> = {
  auth_method: {
    question: '用户认证方式？',
    options: [
      { label: '邮箱 + 密码', value: 'email_password', description: '传统邮箱注册，密码登录' },
      { label: '手机号 + 验证码', value: 'phone_otp', description: '国内常用，手机号 + 短信验证码' },
      { label: 'OAuth 登录', value: 'oauth', description: '微信/GitHub/Google 等第三方登录' },
      { label: '全部支持', value: 'all', description: '同时支持多种认证方式' },
    ],
  },
  core_features: {
    question: '需要哪些核心功能？',
    options: [
      { label: '基础认证', value: 'basic', description: '注册 + 登录 + 找回密码' },
      { label: '认证 + 验证', value: 'with_verification', description: '加上邮箱/手机验证' },
      { label: '认证 + 2FA', value: 'with_2fa', description: '加上双因素认证' },
      { label: '完整用户系统', value: 'full', description: '认证 + 验证 + 2FA + 用户资料 + 权限管理' },
    ],
  },
  database: {
    question: '数据库选择？',
    options: [
      { label: 'PostgreSQL + Prisma', value: 'postgres_prisma', description: '类型安全，推荐' },
      { label: 'MySQL + TypeORM', value: 'mysql_typeorm', description: '传统方案，社区成熟' },
      { label: 'MongoDB + Mongoose', value: 'mongodb_mongoose', description: 'NoSQL，灵活 Schema' },
      { label: 'SQLite + Drizzle', value: 'sqlite_drizzle', description: '轻量级，适合原型' },
    ],
  },
  frontend: {
    question: '前端框架？',
    options: [
      { label: 'React + Ant Design', value: 'react_ant', description: '企业级组件库' },
      { label: 'Vue 3 + Element Plus', value: 'vue_element', description: '渐进式框架' },
      { label: 'Next.js + Tailwind', value: 'next_tailwind', description: '全栈框架 + 原子 CSS' },
      { label: '仅后端 API', value: 'backend_only', description: '不需要前端，只提供 API' },
    ],
  },
  deployment: {
    question: '部署环境？',
    options: [
      { label: 'Docker + 云服务器', value: 'docker_cloud', description: '生产环境部署' },
      { label: 'Vercel/Netlify', value: 'vercel', description: '托管平台，一键部署' },
      { label: '本地开发', value: 'local', description: '本地运行即可' },
    ],
  },
};

interface TemplateEntry {
  category: QuestionCategory;
  question: string;
  options: { label: string; value: string; description: string }[];
}

const TEMPLATE_LIST: TemplateEntry[] = [
  { category: 'auth_method', ...QUESTION_TEMPLATES.auth_method },
  { category: 'core_features', ...QUESTION_TEMPLATES.core_features },
  { category: 'database', ...QUESTION_TEMPLATES.database },
  { category: 'frontend', ...QUESTION_TEMPLATES.frontend },
  { category: 'deployment', ...QUESTION_TEMPLATES.deployment },
];

/**
 * 根据用户输入生成 Interview 问题
 */
export function generateQuestions(userInput: string): InterviewQuestion[] {
  const input = userInput.toLowerCase();
  const selected: TemplateEntry[] = [];
  const categories = new Set<QuestionCategory>();

  // 根据需求智能选择相关问题
  if (input.includes('登录') || input.includes('注册') || input.includes('认证') || input.includes('用户')) {
    selected.push(TEMPLATE_LIST.find((t) => t.category === 'auth_method')!);
    categories.add('auth_method');
    selected.push(TEMPLATE_LIST.find((t) => t.category === 'core_features')!);
    categories.add('core_features');
  }

  if (input.includes('数据库') || input.includes('存储') || input.includes('数据')) {
    if (!categories.has('database')) {
      selected.push(TEMPLATE_LIST.find((t) => t.category === 'database')!);
      categories.add('database');
    }
  }

  if (input.includes('前端') || input.includes('页面') || input.includes('界面') || input.includes('UI')) {
    if (!categories.has('frontend')) {
      selected.push(TEMPLATE_LIST.find((t) => t.category === 'frontend')!);
      categories.add('frontend');
    }
  }

  // 默认添加数据库问题
  if (selected.length === 0) {
    selected.push(TEMPLATE_LIST.find((t) => t.category === 'database')!);
    categories.add('database');
  }

  // 确保有部署问题
  if (!categories.has('deployment')) {
    selected.push(TEMPLATE_LIST.find((t) => t.category === 'deployment')!);
    categories.add('deployment');
  }

  // 限制最多 5 个问题
  return selected.slice(0, 5).map((t) => ({
    question: t.question,
    options: t.options,
    category: t.category,
  }));
}

/**
 * 获取默认问题列表（当 skip-interview 时使用）
 */
export function getDefaultQuestions(): InterviewQuestion[] {
  return ['auth_method', 'database', 'deployment'].map((cat) => {
    const t = TEMPLATE_LIST.find((x) => x.category === cat)!;
    return { question: t.question, options: t.options, category: t.category };
  });
}
