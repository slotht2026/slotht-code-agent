#!/usr/bin/env node

/**
 * slotht-code-agent
 * 自主编程 Agent 系统
 */

// LLM 抽象层
export { OpenAIProvider, createLLMProvider, createProviderFromEnv } from './llm/index.js';
export type { LLMProvider, LLMMessage, LLMRequestOptions, LLMResponse } from './llm/index.js';

// 核心模块
export { AppError, ErrorCode, createLogger, logger, ProgressLogger } from './core/index.js';

// 执行器
export { DeveloperAgent } from './executor/developer-agent.js';
export { runRalphLoop, selectNextTask } from './executor/ralph-loop.js';

// 测试器
export { TesterAgent } from './tester/tester-agent.js';

// 知识图谱
export { GitNexusWrapper } from './graph/gitnexus-wrapper.js';
export { IncrementalIndexer } from './graph/incremental-indexer.js';
export { ImpactCache } from './graph/impact-cache.js';
export { KnowledgeUpdater } from './graph/knowledge-updater.js';

// 提交器
export { GitOps } from './committer/git-ops.js';
export { GitHubClient } from './committer/github-client.js';
export { AutoCommit } from './committer/auto-commit.js';
export { PRCreator, CommitTracker } from './committer/pr-creator.js';

// 技能
export { SkillExtractor } from './skill/extractor.js';
export { SkillStorage } from './skill/storage.js';
export { SkillInvoker } from './skill/invoker.js';

// 规划器
export { generateQuestions, getDefaultQuestions } from './planner/question-generator.js';
export { collectAnswers, quickAnswers } from './planner/answer-collector.js';
export { generatePRD } from './planner/prd-generator.js';
