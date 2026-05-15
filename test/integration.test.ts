import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync } from 'fs';
import type { Task, PRD } from '../src/planner/types.js';

// ── DeveloperAgent 测试 ──
describe('DeveloperAgent', () => {
  it('should create instance with LLM provider', async () => {
    const { DeveloperAgent } = await import('../src/executor/developer-agent.js');
    const { OpenAIProvider } = await import('../src/llm/openai-provider.js');
    const provider = new OpenAIProvider({ apiKey: 'test-key', baseUrl: 'https://test.api' });
    const agent = new DeveloperAgent(provider);
    expect(agent).toBeDefined();
  });
});

// ── LLM Provider 测试 ──
describe('OpenAIProvider', () => {
  it('should create instance', async () => {
    const { OpenAIProvider } = await import('../src/llm/openai-provider.js');
    const provider = new OpenAIProvider({
      apiKey: 'test-key',
      baseUrl: 'https://api.test.com',
      model: 'gpt-4o',
    });
    expect(provider.name).toBe('openai');
  });
});

describe('LLM Factory', () => {
  it('should create openai provider', async () => {
    const { createLLMProvider } = await import('../src/llm/factory.js');
    const provider = createLLMProvider('openai', { apiKey: 'test' });
    expect(provider.name).toBe('openai');
  });

  it('should create ollama provider', async () => {
    const { createLLMProvider } = await import('../src/llm/factory.js');
    const provider = createLLMProvider('ollama', { apiKey: 'test' });
    expect(provider.name).toBe('openai'); // ollama uses OpenAI-compatible API
  });

  it('should throw for unknown provider', async () => {
    const { createLLMProvider } = await import('../src/llm/factory.js');
    expect(() => createLLMProvider('unknown' as any, { apiKey: 'test' })).toThrow();
  });
});

// ── TesterAgent 测试 ──
describe('TesterAgent', () => {
  const mockTask: Task = {
    id: 'T-001',
    title: 'Test generation',
    acceptanceCriteria: ['pass case 1', 'pass case 2'],
    priority: 1,
    passes: false,
  };

  it('should generate test file content without LLM', async () => {
    const { TesterAgent } = await import('../src/tester/tester-agent.js');
    const agent = new TesterAgent('/tmp');
    const codeFiles = { 'src/auth.ts': 'export function login() {}' };
    const tests = await agent.generateTests(mockTask, codeFiles);
    expect(Object.keys(tests).length).toBe(1);
    const testContent = tests[Object.keys(tests)[0]];
    expect(testContent).toContain('describe');
    expect(testContent).toContain('it');
    // 新版本：基础测试有真实断言
    expect(testContent).toContain('toBeDefined');
  });

  it('should extract exports from code', async () => {
    const { TesterAgent } = await import('../src/tester/tester-agent.js');
    const agent = new TesterAgent('/tmp');
    const code = 'export async function authenticateUser() {}';
    const result = (agent as any).extractExports(code);
    expect(result).toContain('authenticateUser');
  });

  it('should handle code without exports', async () => {
    const { TesterAgent } = await import('../src/tester/tester-agent.js');
    const agent = new TesterAgent('/tmp');
    const code = 'const x = 1;';
    const result = (agent as any).extractExports(code);
    expect(result).toEqual([]);
  });
});

// ── Errors 测试 ──
describe('AppError', () => {
  it('should create error with code', async () => {
    const { AppError, ErrorCode } = await import('../src/core/errors.js');
    const error = new AppError('test error', ErrorCode.LLM_REQUEST_FAILED);
    expect(error.message).toBe('test error');
    expect(error.code).toBe(ErrorCode.LLM_REQUEST_FAILED);
    expect(error.name).toBe('AppError');
  });

  it('should convert from Error', async () => {
    const { AppError, ErrorCode } = await import('../src/core/errors.js');
    const original = new Error('original');
    const error = AppError.fromError(original, ErrorCode.GIT_OPERATION_FAILED);
    expect(error.cause).toBe(original);
  });

  it('should serialize to JSON', async () => {
    const { AppError, ErrorCode } = await import('../src/core/errors.js');
    const error = new AppError('test', ErrorCode.UNKNOWN, undefined, { key: 'value' });
    const json = error.toJSON();
    expect(json.code).toBe('UNKNOWN');
    expect(json.context).toEqual({ key: 'value' });
  });
});

// ── ImpactCache 测试 ──
describe('ImpactCache', () => {
  const testPath = '/tmp/impact-cache-test';

  beforeEach(() => {
    if (!existsSync(testPath)) mkdirSync(testPath, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testPath)) rmSync(testPath, { recursive: true });
  });

  it('should cache and retrieve impact', async () => {
    const { ImpactCache } = await import('../src/graph/impact-cache.js');
    const cache = new ImpactCache(testPath);
    cache.cacheImpact('testSymbol', {
      symbol: 'testSymbol',
      upstream: ['file1.ts'],
      downstream: ['file2.ts'],
      riskLevel: 'medium',
      fileHash: 'abc123',
    });
    const entry = cache.getImpact('testSymbol');
    expect(entry).not.toBeNull();
    expect(entry?.upstream).toContain('file1.ts');
  });

  it('should invalidate by changed files', async () => {
    const { ImpactCache } = await import('../src/graph/impact-cache.js');
    const cache = new ImpactCache(testPath);
    cache.cacheImpact('sym1', {
      symbol: 'sym1',
      upstream: ['file1.ts'],
      downstream: ['file2.ts'],
      riskLevel: 'low',
      fileHash: 'hash1',
    });
    cache.cacheImpact('sym2', {
      symbol: 'sym2',
      upstream: ['file3.ts'],
      downstream: ['file4.ts'],
      riskLevel: 'high',
      fileHash: 'hash2',
    });
    cache.invalidateByFiles(['file1.ts']);
    expect(cache.getImpact('sym1')).toBeNull();
    expect(cache.getImpact('sym2')).not.toBeNull();
  });
});

// ── End-to-End Flow ──
describe('End-to-End Flow', () => {
  it('should complete full pipeline: interview → PRD → task selection → skill', async () => {
    const { generateQuestions } = await import('../src/planner/question-generator.js');
    const { quickAnswers } = await import('../src/planner/answer-collector.js');
    const { generatePRD } = await import('../src/planner/prd-generator.js');
    const { selectNextTask } = await import('../src/executor/ralph-loop.js');
    const { SkillExtractor } = await import('../src/skill/extractor.js');

    // 1. Interview
    const questions = generateQuestions('用户登录系统');
    expect(questions.length).toBeGreaterThanOrEqual(2);

    // 2. Answer
    const answers = quickAnswers(questions, questions.map(q => q.options[0].value));
    expect(answers.length).toBe(questions.length);

    // 3. PRD（降级模式，无 LLM）
    const prd = await generatePRD('用户登录系统', answers);
    expect(prd.modules.length).toBeGreaterThanOrEqual(2);

    // 4. Task Selection
    const completedIds = new Set<string>();
    const task = selectNextTask(prd, completedIds);
    expect(task).not.toBeNull();

    // 5. Skill Extraction（降级模式）
    const extractor = new SkillExtractor();
    const skill = await extractor.extractSkill(task!.id, task!.title, 'export async function login() {}');
    expect(skill).not.toBeNull();
    expect(skill!.category).toBe('auth');
  });
});
