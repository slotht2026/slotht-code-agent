import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { PRD, Task, TaskProgress, ProgressLog } from '../planner/types.js';
import { GitOps } from '../committer/git-ops.js';

/**
 * 经验日志管理
 */
export class ProgressLogger {
  private logPath: string;

  constructor(projectRoot: string = process.cwd()) {
    this.logPath = join(projectRoot, 'progress.txt');
    if (!existsSync(this.logPath)) {
      writeFileSync(this.logPath, '# slotht-code-agent Progress Log\n\n', 'utf-8');
    }
  }

  appendLesson(taskId: string, lesson: string): void {
    const timestamp = new Date().toISOString();
    const entry = `\n## ${timestamp} - ${taskId}\n${lesson}\n---\n`;
    appendFileSync(this.logPath, entry, 'utf-8');
  }

  getLessons(taskId?: string): ProgressLog[] {
    if (!existsSync(this.logPath)) return [];
    const content = readFileSync(this.logPath, 'utf-8');
    const entries = content.split('---').filter(Boolean).map((block) => {
      const lines = block.trim().split('\n');
      const header = lines[0] || '';
      const match = header.match(/## (.+?) - (.+)/);
      return {
        timestamp: match?.[1] || '',
        taskId: match?.[2] || '',
        lesson: lines.slice(1).join('\n').trim(),
      };
    });

    if (taskId) {
      return entries.filter((e) => e.taskId === taskId);
    }
    return entries;
  }
}

/**
 * 任务选择器 — 从 PRD 中选择下一个待执行任务
 */
export function selectNextTask(prd: PRD, completedIds: Set<string>): Task | null {
  const allTasks = prd.modules.flatMap((m) => m.tasks);
  const pending = allTasks.filter((t) => !completedIds.has(t.id) && !t.passes);

  // 按优先级排序
  pending.sort((a, b) => a.priority - b.priority);

  // 选择第一个依赖都已满足的任务
  for (const task of pending) {
    const deps = task.dependencies || [];
    const allDepsMet = deps.every((dep) => completedIds.has(dep));
    if (allDepsMet) {
      return task;
    }
  }

  // 如果没有依赖满足的任务，返回最高优先级的
  return pending[0] || null;
}

/**
 * Ralph 主循环
 */
export async function runRalphLoop(
  prdPath: string,
  options: { maxIterations?: number; dryRun?: boolean } = {}
): Promise<void> {
  const maxIterations = options.maxIterations || 25;
  const dryRun = options.dryRun || false;
  const projectRoot = process.cwd();

  console.log('🦥 slotht-code-agent · Ralph 循环启动');
  console.log(`📄 PRD: ${prdPath}`);
  console.log(`🔢 最大迭代: ${maxIterations}`);

  const prd: PRD = JSON.parse(readFileSync(join(projectRoot, prdPath), 'utf-8'));
  const completedIds = new Set<string>();
  const progress = new ProgressLogger(projectRoot);
  const git = new GitOps(projectRoot);

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const task = selectNextTask(prd, completedIds);
    if (!task) {
      console.log('✅ 所有任务已完成！');
      break;
    }

    console.log(`\n🔄 迭代 #${iteration + 1} — ${task.id}: ${task.title}`);

    if (dryRun) {
      console.log(`  [DRY RUN] 将执行: ${task.title}`);
      console.log(`  验收标准: ${task.acceptanceCriteria.join(', ')}`);
      completedIds.add(task.id);
      continue;
    }

    // TODO: 实际调用 Developer Agent 生成代码
    console.log(`  ⏳ Developer Agent 正在生成代码...`);
    console.log(`  ⚠️  Developer Agent 尚未实现（后续模块）`);

    // TODO: 运行测试
    console.log(`  ⏳ Tester Agent 正在运行测试...`);
    console.log(`  ⚠️  Tester Agent 尚未实现（后续模块）`);

    // 标记完成（占位）
    completedIds.add(task.id);
    task.passes = true;
    progress.appendLesson(task.id, `任务 ${task.id} 完成（占位）`);

    // 更新 PRD
    writeFileSync(join(projectRoot, prdPath), JSON.stringify(prd, null, 2));

    console.log(`  ✅ ${task.id} 标记为完成`);
  }

  // 提交变更
  await git.add('.');
  await git.commit(`feat: [ralph-loop] 批量完成任务`);
  console.log('\n💾 已提交到 Git');
}
