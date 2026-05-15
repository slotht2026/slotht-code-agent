import { describe, it, expect } from 'vitest';
import { generateQuestions, getDefaultQuestions } from '../src/planner/question-generator.js';
import { quickAnswers } from '../src/planner/answer-collector.js';
import { generatePRD } from '../src/planner/prd-generator.js';

describe('Question Generator', () => {
  it('should generate auth-related questions for login requirement', () => {
    const questions = generateQuestions('帮我开发一个用户登录系统');
    expect(questions.length).toBeGreaterThanOrEqual(2);
    expect(questions.some((q) => q.category === 'auth_method')).toBe(true);
    expect(questions.some((q) => q.category === 'core_features')).toBe(true);
  });

  it('should limit to max 5 questions', () => {
    const questions = generateQuestions('帮我开发一个完整的用户系统，包含前端和数据库');
    expect(questions.length).toBeLessThanOrEqual(5);
  });

  it('should include deployment question', () => {
    const questions = generateQuestions('帮我写一个工具');
    expect(questions.some((q) => q.category === 'deployment')).toBe(true);
  });

  it('should return default questions', () => {
    const questions = getDefaultQuestions();
    expect(questions.length).toBe(3);
  });
});

describe('Answer Collector', () => {
  it('should generate quick answers', () => {
    const questions = generateQuestions('用户登录系统');
    const answers = quickAnswers(questions, ['email_password', 'basic', 'local']);
    expect(answers.length).toBe(questions.length);
    expect(answers[0].questionId).toBe('auth_method');
    expect(answers[0].selectedOption).toBe('email_password');
  });
});

describe('PRD Generator', () => {
  it('should generate PRD from answers (template mode)', async () => {
    const answers = quickAnswers(generateQuestions('用户登录系统'), ['email_password', 'basic', 'postgres_prisma', 'local']);
    const prd = await generatePRD('用户登录系统', answers);

    expect(prd.project).toBe('用户登录系统');
    expect(prd.modules.length).toBeGreaterThanOrEqual(2);
    expect(prd.description).toContain('PostgreSQL');
    expect(prd.technicalConstraints.length).toBe(4);
  });

  it('should include database module in PRD', async () => {
    const answers = quickAnswers(getDefaultQuestions(), ['email_password', 'postgres_prisma', 'docker_cloud']);
    const prd = await generatePRD('电商后台', answers);

    const infraModule = prd.modules.find((m) => m.id === 'module-infra');
    expect(infraModule).toBeDefined();
    expect(infraModule!.tasks.length).toBeGreaterThanOrEqual(2);
  });

  it('should have valid task dependencies', async () => {
    const answers = quickAnswers(getDefaultQuestions(), ['email_password', 'postgres_prisma', 'local']);
    const prd = await generatePRD('测试项目', answers);

    const allTaskIds = new Set(prd.modules.flatMap(m => m.tasks).map(t => t.id));
    for (const mod of prd.modules) {
      for (const task of mod.tasks) {
        for (const dep of task.dependencies || []) {
          expect(allTaskIds.has(dep)).toBe(true);
        }
      }
    }
  });
});
