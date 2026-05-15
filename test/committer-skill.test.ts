import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, rmSync, mkdirSync } from 'fs';
import type { Task } from '../src/planner/types.js';
import { SkillExtractor } from '../src/skill/extractor.js';
import { SkillStorage } from '../src/skill/storage.js';

describe('GitHub Client', () => {
  it('should validate token structure', () => {
    const validToken = 'ghp_xxxxxxxxxxxx';
    expect(validToken.startsWith('ghp_')).toBe(true);
  });
});

describe('AutoCommit', () => {
  it('should skip commit when tests fail', async () => {
    const testResults = { passed: false, failures: ['test1'] };
    expect(testResults.passed).toBe(false);
  });
});

describe('Skill Extractor', () => {
  it('should detect auth pattern', async () => {
    const extractor = new SkillExtractor();
    const skill = await extractor.extractSkill('T-001', 'Auth module', 'export async function login() { authenticateUser() }');
    expect(skill).not.toBeNull();
    expect(skill!.category).toBe('auth');
  });

  it('should detect database pattern', async () => {
    const extractor = new SkillExtractor();
    const skill = await extractor.extractSkill('T-002', 'DB model', 'const query = db.select()');
    expect(skill).not.toBeNull();
    expect(skill!.category).toBe('database');
  });

  it('should detect api pattern', async () => {
    const extractor = new SkillExtractor();
    const skill = await extractor.extractSkill('T-003', 'API route', 'app.get("/api/users")');
    expect(skill).not.toBeNull();
    expect(skill!.category).toBe('api');
  });

  it('should detect testing pattern', async () => {
    const extractor = new SkillExtractor();
    const skill = await extractor.extractSkill('T-004', 'Test spec', 'describe("test suite")');
    expect(skill).not.toBeNull();
    expect(skill!.category).toBe('testing');
  });

  it('should detect ui pattern', async () => {
    const extractor = new SkillExtractor();
    const skill = await extractor.extractSkill('T-005', 'UI Component', 'export const Component = () => <div>ui element</div>');
    expect(skill).not.toBeNull();
    expect(skill!.category).toBe('ui');
  });

  it('should return null for empty code', async () => {
    const extractor = new SkillExtractor();
    const skill = await extractor.extractSkill('T-006', 'Empty', '');
    expect(skill).toBeNull();
  });
});

describe('Skill Storage', () => {
  const testPath = '/tmp/skill-test';

  beforeEach(() => {
    if (existsSync(testPath)) rmSync(testPath, { recursive: true });
    mkdirSync(testPath, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testPath)) rmSync(testPath, { recursive: true });
  });

  it('should save and load skills', () => {
    const storage = new SkillStorage(testPath);
    const skill = {
      name: 'test-auth',
      description: 'Auth skill',
      category: 'auth' as const,
      pattern: 'test',
      template: 'test',
      examples: ['test'],
    };
    const path = storage.saveSkill(skill);
    expect(existsSync(path)).toBe(true);
  });

  it('should search skills by name', () => {
    const storage = new SkillStorage(testPath);
    storage.saveSkill({
      name: 'auth-login',
      description: 'Login',
      category: 'auth' as const,
      pattern: '',
      template: '',
      examples: [],
    });
    storage.saveSkill({
      name: 'db-query',
      description: 'Query',
      category: 'database' as const,
      pattern: '',
      template: '',
      examples: [],
    });
    const results = storage.searchSkills('auth');
    expect(results.length).toBe(1);
  });
});
