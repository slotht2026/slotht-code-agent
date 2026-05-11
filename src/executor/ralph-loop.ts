import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import type { PRD, Task, TaskProgress, ProgressLog } from '../planner/types.js';
import { GitOps } from '../committer/git-ops.js';
import { AutoCommit } from '../committer/auto-commit.js';
import { DeveloperAgent } from './developer-agent.js';
import { TesterAgent } from '../tester/tester-agent.js';
import { SkillExtractor } from '../skill/extractor.js';
import { SkillStorage } from '../skill/storage.js';

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
 * 获取项目上下文（读取已有源码作为上下文）
 */
function getProjectContext(projectRoot: string): string {
  try {
    const { execSync } = require('child_process');
    const files = execSync('find src -name "*.ts" -type f 2>/dev/null | head -20', {
      cwd: projectRoot,
      encoding: 'utf-8',
      timeout: 5000,
    }).trim().split('\n').filter(Boolean);

    if (files.length === 0) return '';

    let context = '## 现有项目文件\n\n';
    for (const file of files.slice(0, 10)) {
      try {
        const content = readFileSync(join(projectRoot, file), 'utf-8');
        context += `### ${file}\n\`\`\`typescript\n${content.slice(0, 2000)}\n\`\`\`\n\n`;
      } catch {
        // skip unreadable files
      }
    }
    return context;
  } catch {
    return '';
  }
}

/**
 * Ralph 主循环
 */
export async function runRalphLoop(
  prdPath: string,
  options: {
    maxIterations?: number;
    dryRun?: boolean;
    projectRoot?: string;
  } = {}
): Promise<void> {
  const maxIterations = options.maxIterations || 25;
  const dryRun = options.dryRun || false;
  const projectRoot = options.projectRoot || process.cwd();

  console.log('🦥 slotht-code-agent · Ralph 循环启动');
  console.log(`📄 PRD: ${prdPath}`);
  console.log(`🔢 最大迭代: ${maxIterations}`);
  console.log(`📁 项目目录: ${projectRoot}`);

  // 读取 PRD
  const fullPrdPath = join(projectRoot, prdPath);
  if (!existsSync(fullPrdPath)) {
    console.error(`❌ PRD 文件不存在: ${fullPrdPath}`);
    process.exit(1);
  }
  const prd: PRD = JSON.parse(readFileSync(fullPrdPath, 'utf-8'));
  console.log(`📋 项目: ${prd.project}`);
  console.log(`📦 模块数: ${prd.modules.length}`);
  console.log(`📝 总任务数: ${prd.modules.reduce((sum, m) => sum + m.tasks.length, 0)}`);

  // 初始化组件
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || 'gpt-4o';
  const baseUrl = process.env.OPENAI_BASE_URL;
  const maxRetries = parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD || '3');

  if (!apiKey && !dryRun) {
    console.error('❌ OPENAI_API_KEY 未配置');
    process.exit(1);
  }

  const developer = new DeveloperAgent({
    model,
    apiKey: apiKey || '',
    baseUrl: baseUrl || undefined,
  });
  const tester = new TesterAgent(projectRoot);
  const git = new GitOps(projectRoot);
  const autoCommit = new AutoCommit(projectRoot);
  const progress = new ProgressLogger(projectRoot);
  const skillExtractor = new SkillExtractor();
  const skillStorage = new SkillStorage(projectRoot);

  const completedIds = new Set<string>();
  const taskAttempts = new Map<string, number>();
  let consecutiveFailures = 0;

  let lastIteration = 0;
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    lastIteration = iteration;
    const task = selectNextTask(prd, completedIds);
    if (!task) {
      console.log('\n✅ 所有任务已完成！');
      break;
    }

    const attempts = taskAttempts.get(task.id) || 0;
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔄 迭代 #${iteration + 1} — ${task.id}: ${task.title}`);
    console.log(`   优先级: ${task.priority} | 尝试: ${attempts + 1}/${maxRetries}`);
    console.log(`${'='.repeat(60)}`);

    // 断路器检查
    if (attempts >= maxRetries) {
      console.log(`⛔ 任务 ${task.id} 已达最大重试次数 (${maxRetries})，跳过`);
      progress.appendLesson(task.id, `断路器触发：超过最大重试次数 ${maxRetries}`);
      completedIds.add(task.id);
      continue;
    }

    if (dryRun) {
      console.log(`  [DRY RUN] 将执行: ${task.title}`);
      console.log(`  验收标准:`);
      task.acceptanceCriteria.forEach((c) => console.log(`    - ${c}`));
      completedIds.add(task.id);
      continue;
    }

    taskAttempts.set(task.id, attempts + 1);

    // ── Step 1: Developer Agent 生成代码 ──
    console.log(`\n  ⏳ [1/4] Developer Agent 正在生成代码...`);
    let generatedFiles: Record<string, string>;
    try {
      const projectContext = getProjectContext(projectRoot);
      const lessons = progress.getLessons(task.id).map((l) => l.lesson).join('\n');
      const result = await developer.generateCode(task, projectContext, lessons);
      generatedFiles = result.files;

      if (Object.keys(generatedFiles).length === 0) {
        throw new Error('Developer Agent 未生成任何文件');
      }

      console.log(`  ✅ 生成了 ${Object.keys(generatedFiles).length} 个文件:`);
      for (const path of Object.keys(generatedFiles)) {
        console.log(`     📄 ${path}`);
      }
    } catch (error: any) {
      console.error(`  ❌ 代码生成失败: ${error.message}`);
      progress.appendLesson(task.id, `代码生成失败: ${error.message}`);
      consecutiveFailures++;
      continue;
    }

    // ── Step 2: 写入文件 ──
    console.log(`\n  ⏳ [2/4] 写入文件...`);
    for (const [filePath, content] of Object.entries(generatedFiles)) {
      const fullPath = join(projectRoot, filePath);
      const dir = dirname(fullPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(fullPath, content, 'utf-8');
      console.log(`     📝 ${filePath}`);
    }

    // ── Step 3: Tester Agent 运行测试 ──
    console.log(`\n  ⏳ [3/4] Tester Agent 运行测试...`);
    let testResults: { passed: boolean; total: number; failures: string[]; output: string };

    // 先生成测试文件
    const testFiles = tester.generateTests(task, generatedFiles);
    tester.writeTests(testFiles);
    console.log(`     📝 生成了 ${Object.keys(testFiles).length} 个测试文件`);

    // 运行测试
    testResults = await tester.runTests();

    if (testResults.passed) {
      console.log(`  ✅ 测试通过 (${testResults.total} 个测试)`);
    } else {
      console.log(`  ❌ 测试失败`);
      console.log(`     失败数: ${testResults.failures.length}`);
      if (testResults.failures.length > 0) {
        testResults.failures.slice(0, 3).forEach((f) => console.log(`     ⚠️  ${f}`));
      }
      // 记录教训
      const lesson = `测试失败:\n${testResults.output.slice(-1000)}`;
      progress.appendLesson(task.id, lesson);
      consecutiveFailures++;
      continue;
    }

    // ── Step 4: 提交代码 ──
    console.log(`\n  ⏳ [4/4] 提交代码...`);
    const commitMsg = await autoCommit.commitOnTestPass(task, testResults);
    if (commitMsg) {
      console.log(`  ✅ 已提交: ${commitMsg}`);
      consecutiveFailures = 0;

      // 沉淀技能
      try {
        const codeChanges = Object.values(generatedFiles).join('\n\n');
        const skill = await skillExtractor.extractSkill(task.id, task.title, codeChanges);
        if (skill) {
          const skillPath = skillStorage.saveSkill(skill);
          console.log(`  📚 技能已沉淀: ${skillPath}`);
        }
      } catch {
        // 技能沉淀失败不影响主流程
      }
    }

    // 标记任务完成
    task.passes = true;
    completedIds.add(task.id);
    progress.appendLesson(task.id, `任务完成 (${taskAttempts.get(task.id)} 次尝试)`);

    // 更新 PRD 文件
    writeFileSync(fullPrdPath, JSON.stringify(prd, null, 2));
  }

  // 输出总结
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 Ralph 循环执行总结');
  console.log(`${'='.repeat(60)}`);
  console.log(`✅ 已完成: ${completedIds.size} 个任务`);
  console.log(`📝 总迭代: ${lastIteration + 1}`);
  console.log(`❌ 未完成: ${prd.modules.flatMap((m) => m.tasks).filter((t) => !completedIds.has(t.id)).length} 个任务`);

  if (!dryRun) {
    try {
      await git.add('.');
      await git.commit(`feat: [ralph-loop] 完成 ${completedIds.size} 个任务`);
      console.log('\n💾 已提交到 Git');
    } catch {
      console.log('\nℹ️  Git 提交跳过（可能没有变更）');
    }
  }
}


