#!/usr/bin/env node

import 'dotenv/config';
import { Command } from 'commander';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pkg = JSON.parse(
  readFileSync(join(__dirname, '../../package.json'), 'utf-8')
);

/**
 * 创建 LLM Provider（延迟加载）
 */
async function getProvider() {
  const { createProviderFromEnv } = await import('../llm/factory.js');
  return createProviderFromEnv();
}

const program = new Command();

program
  .name('slotht')
  .description('🦥 自主编程 Agent 系统 — 慢即是快')
  .version(pkg.version);

// Interview 命令
program
  .command('interview <input>')
  .description('启动 Interview 流程，澄清需求')
  .option('-o, --output <path>', 'PRD 输出路径', 'prd.json')
  .option('--skip-interview', '跳过 Interview，使用默认配置')
  .option('--non-interactive', '非交互模式，使用默认选项')
  .action(async (input: string, options: { output: string; skipInterview: boolean; nonInteractive: boolean }) => {
    console.log('🎯 启动 Interview 流程...');
    console.log(`📝 需求: ${input}`);

    const { generateQuestions, getDefaultQuestions } = await import('../planner/question-generator.js');
    const { collectAnswers, quickAnswers } = await import('../planner/answer-collector.js');
    const { generatePRD } = await import('../planner/prd-generator.js');

    let questions;
    if (options.skipInterview) {
      questions = getDefaultQuestions();
    } else {
      questions = generateQuestions(input);
    }

    console.log(`\n📋 生成了 ${questions.length} 个问题:\n`);

    let answers;
    if (options.nonInteractive || options.skipInterview) {
      // 非交互模式：显示问题和默认选项
      questions.forEach((q: any, idx: number) => {
        console.log(`Q${idx + 1}. ${q.question}`);
        q.options.forEach((opt: any, optIdx: number) => {
          console.log(`   ${optIdx + 1}. ${opt.label} — ${opt.description}`);
        });
        console.log(`   → 默认选择: ${q.options[0].label}\n`);
      });
      answers = quickAnswers(questions, questions.map((q: any) => q.options[0].value));
    } else {
      // 交互模式：让用户选择
      questions.forEach((q: any, idx: number) => {
        console.log(`Q${idx + 1}. ${q.question}`);
        q.options.forEach((opt: any, optIdx: number) => {
          console.log(`   ${optIdx + 1}. ${opt.label} — ${opt.description}`);
        });
        console.log();
      });
      answers = await collectAnswers(questions);
    }

    // 生成 PRD
    console.log('📄 正在生成 PRD...');
    let provider;
    try {
      provider = await getProvider();
    } catch {
      console.log('⚠️  未配置 LLM API Key，使用模板生成 PRD');
    }

    const prd = await generatePRD(input, answers, provider);
    const totalTasks = prd.modules.reduce((s, m) => s + m.tasks.length, 0);
    console.log(`\n✅ PRD 已生成:`);
    console.log(`   📦 模块数: ${prd.modules.length}`);
    console.log(`   📝 总任务数: ${totalTasks}`);

    prd.modules.forEach((m) => {
      console.log(`\n   📂 ${m.name}:`);
      m.tasks.forEach((t) => {
        const deps = t.dependencies?.length ? ` (依赖: ${t.dependencies.join(', ')})` : '';
        console.log(`      - ${t.id}: ${t.title}${deps}`);
      });
    });

    writeFileSync(join(process.cwd(), options.output), JSON.stringify(prd, null, 2));
    console.log(`\n📄 PRD 已保存到: ${options.output}`);
  });

// Execute 命令
program
  .command('execute <prd>')
  .description('执行 PRD 中的任务')
  .option('-m, --max-iterations <n>', '最大迭代次数', '25')
  .option('--dry-run', '只打印计划，不执行')
  .option('--project-root <path>', '项目目录', process.cwd())
  .action(async (prd: string, options: { maxIterations: string; dryRun: boolean; projectRoot: string }) => {
    if (!options.dryRun && !process.env.OPENAI_API_KEY) {
      console.error('❌ 缺少 OPENAI_API_KEY，请在 .env 中配置');
      console.log('💡 提示: cp .env.example .env 然后编辑 .env');
      process.exit(1);
    }

    const { runRalphLoop } = await import('../executor/ralph-loop.js');

    let provider;
    if (!options.dryRun) {
      provider = await getProvider();
      console.log(`🤖 LLM Provider: ${provider.name}`);
    }

    await runRalphLoop(prd, {
      maxIterations: parseInt(options.maxIterations),
      dryRun: options.dryRun,
      projectRoot: options.projectRoot,
      provider,
    });
  });

// Graph 命令
program
  .command('graph:update')
  .description('更新知识图谱')
  .option('--full', '全量索引')
  .action(async (options: { full: boolean }) => {
    const { KnowledgeUpdater } = await import('../graph/knowledge-updater.js');
    const updater = new KnowledgeUpdater();

    if (options.full) {
      await updater.forceFullIndex();
    } else {
      await updater.updateOnCommit('HEAD');
    }
  });

// Skill 命令
program
  .command('skill:search <query>')
  .description('搜索已沉淀的技能')
  .action(async (query: string) => {
    const { SkillStorage } = await import('../skill/storage.js');
    const storage = new SkillStorage();
    const skills = storage.searchSkills(query);

    if (skills.length === 0) {
      console.log(`⚠️  未找到匹配的技能：${query}`);
    } else {
      console.log(`📚 找到 ${skills.length} 个技能：`);
      skills.forEach((s: any) => {
        console.log(`\n- ${s.name} (${s.category})`);
        console.log(`  ${s.description}`);
      });
    }
  });

// Status 命令
program
  .command('status')
  .description('查看项目状态')
  .action(async () => {
    const { existsSync } = await import('fs');

    console.log('📊 slotht-code-agent 状态');
    console.log(`版本: ${pkg.version}`);
    console.log(`Node: ${process.version}`);

    // LLM 状态
    const hasApiKey = !!process.env.OPENAI_API_KEY;
    console.log(`\n🤖 LLM 配置:`);
    console.log(`  Provider: ${process.env.LLM_PROVIDER || 'openai'}`);
    console.log(`  Model: ${process.env.OPENAI_MODEL || 'gpt-4o'}`);
    console.log(`  API: ${process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'}`);
    console.log(`  API Key: ${hasApiKey ? '✅ 已配置' : '❌ 未配置'}`);

    if (hasApiKey) {
      try {
        const provider = await getProvider();
        const valid = await provider.validate();
        console.log(`  连接状态: ${valid ? '✅ 正常' : '⚠️ 无法验证'}`);
      } catch (e: any) {
        console.log(`  连接状态: ❌ ${e.message}`);
      }
    }

    // GitNexus 状态
    const gitnexusEnabled = process.env.GITNEXUS_ENABLED === 'true';
    console.log(`\n🧠 GitNexus: ${gitnexusEnabled ? '✅ 已启用' : '⏸️ 未启用'}`);

    // PRD 状态
    const prdPath = join(process.cwd(), 'prd.json');
    if (existsSync(prdPath)) {
      try {
        const prd = JSON.parse(readFileSync(prdPath, 'utf-8'));
        const total = prd.modules.reduce((s: number, m: any) => s + m.tasks.length, 0);
        const done = prd.modules.flatMap((m: any) => m.tasks).filter((t: any) => t.passes).length;
        console.log(`\n📄 PRD: ${prd.project}`);
        console.log(`  进度: ${done}/${total} 任务完成`);
      } catch {
        console.log(`\n📄 PRD: ⚠️ 解析失败`);
      }
    } else {
      console.log(`\n📄 PRD: 未创建`);
    }

    // 技能状态
    const skillsDir = join(process.cwd(), 'skills');
    if (existsSync(skillsDir)) {
      const { readdirSync } = await import('fs');
      const skillFiles = readdirSync(skillsDir).filter((f) => f.endsWith('.md'));
      console.log(`\n📚 技能库: ${skillFiles.length} 个技能`);
    }
  });

program.parse(process.argv);
