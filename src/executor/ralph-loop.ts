import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import type { PRD, Task } from '../planner/types.js';
import type { LLMProvider } from '../llm/types.js';
import { GitOps } from '../committer/git-ops.js';
import { AutoCommit } from '../committer/auto-commit.js';
import { DeveloperAgent } from './developer-agent.js';
import { TesterAgent } from '../tester/tester-agent.js';
import { SkillExtractor } from '../skill/extractor.js';
import { SkillStorage } from '../skill/storage.js';
import { ProgressLogger } from '../core/progress-logger.js';
import { AppError, ErrorCode } from '../core/errors.js';
import { logger } from '../core/logger.js';

/**
 * 任务选择器 — 从 PRD 中选择下一个待执行任务
 */
export function selectNextTask(prd: PRD, completedIds: Set<string>): Task | null {
  const allTasks = prd.modules.flatMap((m) => m.tasks);
  const pending = allTasks.filter((t) => !completedIds.has(t.id) && !t.passes);

  pending.sort((a, b) => a.priority - b.priority);

  for (const task of pending) {
    const deps = task.dependencies || [];
    const allDepsMet = deps.every((dep) => completedIds.has(dep));
    if (allDepsMet) {
      return task;
    }
  }

  return pending[0] || null;
}

/**
 * 获取项目上下文（读取已有源码作为上下文）
 */
function getProjectContext(projectRoot: string): string {
  try {
    const { execFileSync } = require('child_process');
    const files = execFileSync('find', ['src', '-name', '*.ts', '-type', 'f'], {
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
    provider?: LLMProvider;
  } = {}
): Promise<void> {
  const maxIterations = options.maxIterations || 25;
  const dryRun = options.dryRun || false;
  const projectRoot = options.projectRoot || process.cwd();

  logger.info({ prdPath, maxIterations, projectRoot }, 'Ralph 循环启动');

  // 读取 PRD
  const fullPrdPath = join(projectRoot, prdPath);
  if (!existsSync(fullPrdPath)) {
    throw new AppError(`PRD 文件不存在: ${fullPrdPath}`, ErrorCode.PRD_NOT_FOUND);
  }

  const prd: PRD = JSON.parse(readFileSync(fullPrdPath, 'utf-8'));
  logger.info({
    project: prd.project,
    modules: prd.modules.length,
    tasks: prd.modules.reduce((sum, m) => sum + m.tasks.length, 0),
  }, 'PRD 已加载');

  // 初始化组件
  const provider = options.provider;
  const developer = provider ? new DeveloperAgent(provider) : null;
  const tester = new TesterAgent(projectRoot, provider || undefined);
  const git = new GitOps(projectRoot);
  const autoCommit = new AutoCommit(projectRoot);
  const progress = new ProgressLogger(projectRoot);
  const skillExtractor = new SkillExtractor(provider || undefined);
  const skillStorage = new SkillStorage(projectRoot);

  const maxRetries = parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD || '3');
  const completedIds = new Set<string>();
  const taskAttempts = new Map<string, number>();
  let consecutiveFailures = 0;
  let lastIteration = 0;

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    lastIteration = iteration;
    const task = selectNextTask(prd, completedIds);
    if (!task) {
      logger.info('所有任务已完成');
      break;
    }

    const attempts = taskAttempts.get(task.id) || 0;
    logger.info({
      iteration: iteration + 1,
      taskId: task.id,
      title: task.title,
      attempt: attempts + 1,
      maxRetries,
    }, '开始执行任务');

    // 断路器检查
    if (attempts >= maxRetries) {
      logger.warn({ taskId: task.id, maxRetries }, '任务已达最大重试次数，跳过');
      progress.appendLesson(task.id, `断路器触发：超过最大重试次数 ${maxRetries}`);
      completedIds.add(task.id);
      continue;
    }

    if (dryRun) {
      logger.info({ taskId: task.id, criteria: task.acceptanceCriteria }, '[DRY RUN] 将执行任务');
      completedIds.add(task.id);
      continue;
    }

    if (!developer) {
      throw new AppError('未配置 LLM Provider，无法执行代码生成', ErrorCode.CONFIG_MISSING);
    }

    taskAttempts.set(task.id, attempts + 1);

    // ── Step 1: Developer Agent 生成代码 ──
    let generatedFiles: Record<string, string>;
    try {
      const projectContext = getProjectContext(projectRoot);
      const lessons = progress.getLessons(task.id).map((l) => l.lesson).join('\n');
      const result = await developer.generateCode(task, projectContext, lessons);
      generatedFiles = result.files;

      if (Object.keys(generatedFiles).length === 0) {
        throw new Error('Developer Agent 未生成任何文件');
      }

      logger.info({ files: Object.keys(generatedFiles) }, '代码生成完成');
    } catch (error: any) {
      logger.error({ error: error.message, taskId: task.id }, '代码生成失败');
      progress.appendLesson(task.id, `代码生成失败: ${error.message}`);
      consecutiveFailures++;
      continue;
    }

    // ── Step 2: 写入文件 ──
    for (const [filePath, content] of Object.entries(generatedFiles)) {
      const fullPath = join(projectRoot, filePath);
      const dir = dirname(fullPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(fullPath, content, 'utf-8');
    }
    logger.info({ count: Object.keys(generatedFiles).length }, '文件已写入');

    // ── Step 3: Tester Agent 运行测试 ──
    tester.ensureTestInfrastructure();
    await tester.ensureVitestInstalled();

    const testFiles = await tester.generateTests(task, generatedFiles);
    tester.writeTests(testFiles);
    logger.info({ testFiles: Object.keys(testFiles).length }, '测试文件已生成');

    const testResults = await tester.runTests();

    if (testResults.passed) {
      logger.info({ total: testResults.total }, '测试通过');
    } else {
      logger.warn({ failures: testResults.failures }, '测试失败');
      const lesson = `测试失败:\n${testResults.output.slice(-1000)}`;
      progress.appendLesson(task.id, lesson);
      consecutiveFailures++;
      continue;
    }

    // ── Step 4: 提交代码 ──
    const commitMsg = await autoCommit.commitOnTestPass(task, testResults);
    if (commitMsg) {
      logger.info({ commit: commitMsg }, '代码已提交');
      consecutiveFailures = 0;

      // 沉淀技能
      try {
        const codeChanges = Object.values(generatedFiles).join('\n\n');
        const skill = await skillExtractor.extractSkill(task.id, task.title, codeChanges);
        if (skill) {
          const skillPath = skillStorage.saveSkill(skill);
          logger.info({ path: skillPath }, '技能已沉淀');
        }
      } catch (error: any) {
        logger.warn({ error: error.message }, '技能沉淀失败');
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
  const totalTasks = prd.modules.flatMap((m) => m.tasks);
  const incomplete = totalTasks.filter((t) => !completedIds.has(t.id));
  logger.info({
    completed: completedIds.size,
    iterations: lastIteration + 1,
    incomplete: incomplete.length,
  }, 'Ralph 循环执行总结');

  if (!dryRun) {
    try {
      await git.add('.');
      await git.commit(`feat: [ralph-loop] 完成 ${completedIds.size} 个任务`);
      logger.info('已提交到 Git');
    } catch {
      logger.info('Git 提交跳过（可能没有变更）');
    }
  }
}
