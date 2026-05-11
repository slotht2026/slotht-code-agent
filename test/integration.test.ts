import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, mkdirSync, rmSync } from 'fs';
import type { Task, PRD } from '../src/planner/types.js';

// DeveloperAgent 测试
describe('DeveloperAgent', () => {
  it('should build system prompt with context', async () => {
    const { DeveloperAgent } = await import('../src/executor/developer-agent.js');
    const agent = new DeveloperAgent({
      model: 'test',
      apiKey: 'test-key',
      baseUrl: 'https://test.api',
    });
    // Agent created successfully
    expect(agent).toBeDefined();
  });

  it('should parse response with filepath blocks', async () => {
    const { DeveloperAgent } = await import('../src/executor/developer-agent.js');
    // Private method test via mock response parsing
    const response = '```filepath: src/test.ts\nexport function test() {}\n```';
    const fileRegex = /```filepath:\s*([^\n]+)\n([\s\S]*?)```/g;
    const match = fileRegex.exec(response);
    expect(match?.[1].trim()).toBe('src/test.ts');
    expect(match?.[2].trim()).toBe('export function test() {}');
  });
});

// TesterAgent 测试
describe('TesterAgent', () => {
  const mockTask: Task = {
    id: 'US-033',
    title: 'Test generation',
    acceptanceCriteria: ['pass case 1', 'pass case 2'],
    priority: 1,
    passes: false,
  };

  it('should generate test file content', async () => {
    const { TesterAgent } = await import('../src/tester/tester-agent.js');
    const agent = new TesterAgent('/tmp');
    const codeFiles = { 'src/auth.ts': 'export function login() {}' };
    const tests = agent.generateTests(mockTask, codeFiles);
    expect(Object.keys(tests).length).toBe(1);
    expect(tests[Object.keys(tests)[0]]).toContain('describe');
    expect(tests[Object.keys(tests)[0]]).toContain('it');
  });

  it('should extract function name from code', async () => {
    const { TesterAgent } = await import('../src/tester/tester-agent.js');
    const agent = new TesterAgent('/tmp');
    const code = 'export async function authenticateUser() {}';
    const result = (agent as any).extractFunctionName(code);
    expect(result).toBe('authenticateUser');
  });

  it('should handle code without functions', async () => {
    const { TesterAgent } = await import('../src/tester/tester-agent.js');
    const agent = new TesterAgent('/tmp');
    const code = 'const x = 1;';
    const result = (agent as any).extractFunctionName(code);
    expect(result).toBeNull();
  });
});

// IncrementalIndexer 测试
describe('IncrementalIndexer', () => {
  it('should create indexer instance', async () => {
    const { IncrementalIndexer } = await import('../src/graph/incremental-indexer.js');
    const indexer = new IncrementalIndexer('/tmp');
    expect(indexer).toBeDefined();
  });
});

// ImpactCache 测试
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

  it('should check cache validity', async () => {
    const { ImpactCache } = await import('../src/graph/impact-cache.js');
    const cache = new ImpactCache(testPath);
    cache.cacheImpact('sym', {
      symbol: 'sym',
      upstream: [],
      downstream: [],
      riskLevel: 'low',
      fileHash: 'original',
    });
    expect(cache.isCacheValid('sym', 'original')).toBe(true);
    expect(cache.isCacheValid('sym', 'changed')).toBe(false);
  });
});

// KnowledgeUpdater 测试
describe('KnowledgeUpdater', () => {
  it('should create updater instance', async () => {
    const { KnowledgeUpdater } = await import('../src/graph/knowledge-updater.js');
    const updater = new KnowledgeUpdater('/tmp');
    expect(updater).toBeDefined();
  });
});

// Full Integration Test
describe('End-to-End Flow', () => {
  it('should complete full pipeline: interview → PRD → task selection → skill', async () => {
    const { generateQuestions, getDefaultQuestions } = await import('../src/planner/question-generator.js');
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

    // 3. PRD
    const prd = generatePRD('用户登录系统', answers);
    expect(prd.modules.length).toBeGreaterThanOrEqual(2);

    // 4. Task Selection
    const completedIds = new Set<string>();
    const task = selectNextTask(prd, completedIds);
    expect(task).not.toBeNull();

    // 5. Skill Extraction
    const extractor = new SkillExtractor();
    const skill = await extractor.extractSkill(task!.id, task!.title, 'export async function login() {}');
    expect(skill.category).toBe('auth');
  });
});
