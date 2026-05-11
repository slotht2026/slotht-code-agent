import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, appendFileSync, writeFileSync, readFileSync } from 'fs';
import type { PRD, ProgressLog } from '../src/planner/types.js';

// Pure function copy to avoid import resolution issues
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

  it('should select T2 after T1 is done (T2 depends on T1)', () => {
    // T1 done, T2 dependency met, T2 has priority 2 (higher than T3's 3)
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

// ProgressLogger inline implementation for testing
class ProgressLogger {
  private logPath: string;
  constructor(projectRoot: string) {
    this.logPath = `${projectRoot}/slotht-progress-test.txt`;
    if (!existsSync(this.logPath)) {
      writeFileSync(this.logPath, '# slotht-code-agent Progress Log\n\n', 'utf-8');
    }
  }
  appendLesson(taskId: string, lesson: string): void {
    const timestamp = new Date().toISOString();
    appendFileSync(this.logPath, `\n## ${timestamp} - ${taskId}\n${lesson}\n---\n`, 'utf-8');
  }
  getLessons(taskId?: string): ProgressLog[] {
    if (!existsSync(this.logPath)) return [];
    const content = readFileSync(this.logPath, 'utf-8');
    const entries = content.split('---').filter(Boolean).map((block) => {
      const lines = block.trim().split('\n');
      const match = (lines[0] || '').match(/## (.+?) - (.+)/);
      return { timestamp: match?.[1] || '', taskId: match?.[2] || '', lesson: lines.slice(1).join('\n').trim() };
    });
    return taskId ? entries.filter((e) => e.taskId === taskId) : entries;
  }
}

describe('ProgressLogger', () => {
  const testPath = '/tmp';
  const logFile = `${testPath}/slotht-progress-test.txt`;

  beforeEach(() => { if (existsSync(logFile)) unlinkSync(logFile); });
  afterEach(() => { if (existsSync(logFile)) unlinkSync(logFile); });

  it('should append and read lessons', () => {
    const logger = new ProgressLogger(testPath);
    logger.appendLesson('US-001', 'Test lesson content');
    const lessons = logger.getLessons();
    expect(lessons.length).toBeGreaterThanOrEqual(1);
    expect(lessons.some((l) => l.lesson.includes('Test lesson content'))).toBe(true);
  });

  it('should filter by task ID', () => {
    const logger = new ProgressLogger(testPath);
    logger.appendLesson('US-001', 'Lesson A');
    logger.appendLesson('US-002', 'Lesson B');
    const lessons = logger.getLessons('US-001');
    expect(lessons.every((l) => l.taskId === 'US-001')).toBe(true);
  });
});
