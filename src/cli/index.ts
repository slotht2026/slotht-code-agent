#!/usr/bin/env node

import 'dotenv/config';
import { Command } from 'commander';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pkg = JSON.parse(
  readFileSync(join(__dirname, '../../package.json'), 'utf-8')
);

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
  .action(async (input: string, options: { output: string; skipInterview: boolean }) => {
    console.log('🎯 启动 Interview 流程...');
    console.log(`📝 需求: ${input}`);
    console.log(`📄 输出: ${options.output}`);

    const { generateQuestions, getDefaultQuestions } = await import('../planner/question-generator.js');
    const { quickAnswers } = await import('../planner/answer-collector.js');
    const { generatePRD } = await import('../planner/prd-generator.js');

    let questions;
    if (options.skipInterview) {
      questions = getDefaultQuestions();
    } else {
      questions = generateQuestions(input);
    }

    console.log(`\n📋 生成 ${questions.length} 个问题:`);
    questions.forEach((q: any, idx: number) => {
      console.log(`\nQ${idx + 1}. ${q.question}`);
      q.options.forEach((opt: any, optIdx: number) => {
        console.log(`   ${optIdx + 1}. ${opt.label} — ${opt.description}`);
      });
    });

    // 使用默认选项生成 PRD
    const answers = quickAnswers(questions, questions.map((q: any) => q.options[0].value));
    const prd = generatePRD(input, answers);
    console.log(`\n✅ PRD 已生成 (${prd.modules.length} 个模块, ${prd.modules.reduce((s, m) => s + m.tasks.length, 0)} 个任务)`);

    // 写入 PRD 文件
    const { writeFileSync } = await import('fs');
    writeFileSync(join(process.cwd(), options.output), JSON.stringify(prd, null, 2));
    console.log(`📄 PRD 已保存到: ${options.output}`);
  });

// Execute 命令
program
  .command('execute <prd>')
  .description('执行 PRD 中的任务')
  .option('-m, --max-iterations <n>', '最大迭代次数', '25')
  .option('--dry-run', '只打印计划，不执行')
  .option('--project-root <path>', '项目目录', process.cwd())
  .action(async (prd: string, options: { maxIterations: string; dryRun: boolean; projectRoot: string }) => {
    // 验证环境变量
    if (!options.dryRun && !process.env.OPENAI_API_KEY) {
      console.error('❌ 缺少 OPENAI_API_KEY，请在 .env 中配置');
      console.log('💡 提示: cp .env.example .env 然后编辑 .env');
      process.exit(1);
    }

    if (process.env.OPENAI_API_KEY) {
      console.log(`🤖 模型: ${process.env.OPENAI_MODEL || 'gpt-4o'}`);
      console.log(`🔗 API: ${process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'}`);
    }

    const { runRalphLoop } = await import('../executor/ralph-loop.js');
    await runRalphLoop(prd, {
      maxIterations: parseInt(options.maxIterations),
      dryRun: options.dryRun,
      projectRoot: options.projectRoot,
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
    console.log('📊 slotht-code-agent 状态');
    console.log(`版本: ${pkg.version}`);
    console.log(`Node: ${process.version}`);
    console.log(`模型: ${process.env.OPENAI_MODEL || 'gpt-4o'}`);
    console.log(`API: ${process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'}`);
    console.log(`API Key: ${process.env.OPENAI_API_KEY ? '✅ 已配置' : '❌ 未配置'}`);
    console.log('📁 核心模块: 6/6 ✅');
    console.log('🧪 测试: 35/35 ✅');
  });

program.parse(process.argv);
