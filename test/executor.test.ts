import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, appendFileSync, writeFileSync, readFileSync } from 'fs';
import type { PRD, ProgressLog } from '../src/planner/types.js';
import { ProgressLogger } from '../src/core/progress-logger.js';

// ── Task Selector ──
function selectNextTask(prd: PRD, completedIds: Set<string>) {
  const allTasks = prd.modules.flatMap((m) => m.tasks);
  const pending = allTasks.filter((t) => !completedIds.has(t.id) && !t.passes);
  pending.sort((a, b) => a.priority - b.priority);
  for (const task of pending) {
    const deps = task.dependencies || [];
    if (deps.every((dep) => completedIds.has(dep))) return task;
  }
  return pending[0] || null;
}

const mockPRD: PRD = {
  project: 'test',
  description: 'test prd',
  modules: [
    {
      id: 'm1',
      name: 'Module 1',
      description: 'test',
      tasks: [
        { id: 'T1', title: 'Task 1', acceptanceCriteria: ['ok'], priority: 1, passes: false },
        { id: 'T2', title: 'Task 2', acceptanceCriteria: ['ok'], priority: 2, passes: false, dependencies: ['T1'] },
        { id: 'T3', title: 'Task 3', acceptanceCriteria: ['ok'], priority: 3, passes: false },
      ],
    },
  ],
  globalAcceptanceCriteria: [],
  technicalConstraints: [],
};

describe('Task Selector', () => {
  it('should select highest priority task with no dependencies', () => {
    const task = selectNextTask(mockPRD, new Set());
    expect(task?.id).toBe('T1');
  });

  it('should select T2 after T1 is done', () => {
    const task = selectNextTask(mockPRD, new Set(['T1']));
    expect(task?.id).toBe('T2');
  });

  it('should return null when all tasks are done', () => {
    const task = selectNextTask(mockPRD, new Set(['T1', 'T2', 'T3']));
    expect(task).toBeNull();
  });

  it('should select T3 when T1 done but T2 not selected', () => {
    const prd2: PRD = {
      ...mockPRD,
      modules: [{
        ...mockPRD.modules[0],
        tasks: [
          { id: 'T1', title: 'T1', acceptanceCriteria: [], priority: 1, passes: true },
          { id: 'T3', title: 'T3', acceptanceCriteria: [], priority: 2, passes: false },
        ],
      }],
    };
    const task = selectNextTask(prd2, new Set(['T1']));
    expect(task?.id).toBe('T3');
  });
});

// ── ProgressLogger ──
describe('ProgressLogger', () => {
  const testPath = '/tmp';
  const logFile = `${testPath}/progress.txt`;

  beforeEach(() => { if (existsSync(logFile)) unlinkSync(logFile); });
  afterEach(() => { if (existsSync(logFile)) unlinkSync(logFile); });

  it('should append and read lessons', () => {
    const logger = new ProgressLogger(testPath);
    logger.appendLesson('T-001', 'Test lesson content');
    const lessons = logger.getLessons();
    expect(lessons.length).toBeGreaterThanOrEqual(1);
    expect(lessons.some((l) => l.lesson.includes('Test lesson content'))).toBe(true);
  });

  it('should filter by task ID', () => {
    const logger = new ProgressLogger(testPath);
    logger.appendLesson('T-001', 'Lesson A');
    logger.appendLesson('T-002', 'Lesson B');
    const lessons = logger.getLessons('T-001');
    expect(lessons.every((l) => l.taskId === 'T-001')).toBe(true);
  });
});

// ── PRD Generator (降级模式) ──
describe('PRD Generator', () => {
  it('should generate PRD without LLM (template mode)', async () => {
    const { generatePRD } = await import('../src/planner/prd-generator.js');
    const prd = await generatePRD('用户登录系统', [
      { questionId: 'database', selectedOption: 'postgres_prisma' },
      { questionId: 'frontend', selectedOption: 'backend_only' },
    ]);
    expect(prd.project).toBe('用户登录系统');
    expect(prd.modules.length).toBeGreaterThanOrEqual(2);
    expect(prd.modules.flatMap(m => m.tasks).length).toBeGreaterThanOrEqual(3);
  });
});
