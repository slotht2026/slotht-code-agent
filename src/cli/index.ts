#!/usr/bin/env node

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
  .description('自主编程 Agent 系统')
  .version(pkg.version);

program
  .command('interview <input>')
  .description('启动 Interview 流程，澄清需求')
  .option('-o, --output <path>', 'PRD 输出路径', 'prd.json')
  .option('--skip-interview', '跳过 Interview，使用默认配置')
  .action(async (input: string, options: { output: string; skipInterview: boolean }) => {
    console.log('🎯 启动 Interview 流程...');
    console.log(`📝 需求: ${input}`);
    console.log(`📄 输出: ${options.output}`);
    console.log('⚠️  此功能正在开发中...');
    // TODO: implement interview flow
  });

program
  .command('execute <prd>')
  .description('执行 PRD 中的任务')
  .option('-m, --max-iterations <n>', '最大迭代次数', '25')
  .option('--dry-run', '只打印计划，不执行')
  .action(async (prd: string, options: { maxIterations: string; dryRun: boolean }) => {
    console.log('🔄 启动 Ralph 循环...');
    console.log(`📄 PRD: ${prd}`);
    console.log(`🔢 最大迭代: ${options.maxIterations}`);
    console.log('⚠️  此功能正在开发中...');
    // TODO: implement Ralph loop execution
  });

program
  .command('status')
  .description('查看项目状态')
  .action(async () => {
    console.log('📊 项目状态');
    console.log('⚠️  此功能正在开发中...');
    // TODO: implement status command
  });

program.parse(process.argv);
