// Interview 相关类型

/** Interview 问题 */
export interface InterviewQuestion {
  /** 问题文本 */
  question: string;
  /** 选项列表 */
  options: InterviewOption[];
  /** 问题分类 */
  category: QuestionCategory;
}

/** Interview 选项 */
export interface InterviewOption {
  /** 选项标签 */
  label: string;
  /** 选项值 */
  value: string;
  /** 选项描述 */
  description: string;
}

/** Interview 回答 */
export interface InterviewAnswer {
  /** 问题分类 */
  questionId: QuestionCategory;
  /** 选择的选项 */
  selectedOption: string;
  /** 选择理由 */
  reasoning?: string;
}

/** 问题分类 */
export type QuestionCategory =
  | 'auth_method'
  | 'core_features'
  | 'database'
  | 'frontend'
  | 'deployment';

/** PRD 文档 */
export interface PRD {
  /** 项目名称 */
  project: string;
  /** 项目描述 */
  description: string;
  /** 模块列表 */
  modules: Module[];
  /** 全局验收标准 */
  globalAcceptanceCriteria: string[];
  /** 技术约束 */
  technicalConstraints: string[];
}

/** 模块 */
export interface Module {
  /** 模块 ID */
  id: string;
  /** 模块名称 */
  name: string;
  /** 模块描述 */
  description: string;
  /** 任务列表 */
  tasks: Task[];
  /** 依赖模块 */
  dependencies?: string[];
}

/** 任务 */
export interface Task {
  /** 任务 ID */
  id: string;
  /** 任务标题 */
  title: string;
  /** 任务描述 */
  description?: string;
  /** 验收标准 */
  acceptanceCriteria: string[];
  /** 优先级 */
  priority: number;
  /** 是否通过 */
  passes: boolean;
  /** 所属触手 */
  tentacle?: string;
  /** 预估工时 */
  estimatedEffort?: string;
  /** 依赖任务 */
  dependencies?: string[];
}

/** Ralph 循环状态 */
export interface RalphState {
  /** 当前任务 */
  currentTask: Task | null;
  /** 当前迭代次数 */
  iteration: number;
  /** 循环状态 */
  status: 'idle' | 'running' | 'paused' | 'completed' | 'failed';
  /** 错误信息 */
  lastError?: string;
}

/** 任务进度 */
export interface TaskProgress {
  /** 任务 ID */
  taskId: string;
  /** 尝试次数 */
  attempts: number;
  /** 上次错误 */
  lastError?: string;
  /** 测试输出 */
  testOutput?: string;
}

/** 经验日志 */
export interface ProgressLog {
  /** 时间戳 */
  timestamp: string;
  /** 任务 ID */
  taskId: string;
  /** 教训内容 */
  lesson: string;
}

/** 技能 */
export interface Skill {
  /** 技能名称 */
  name: string;
  /** 技能描述 */
  description: string;
  /** 可复用模式 */
  pattern: string;
  /** 代码模板 */
  template: string;
  /** 使用示例 */
  examples: string[];
  /** 分类 */
  category: SkillCategory;
}

/** 技能分类 */
export type SkillCategory = 'auth' | 'database' | 'api' | 'ui' | 'testing' | 'other';

/** Interview 结果 */
export interface InterviewResult {
  /** 问题列表 */
  questions: InterviewQuestion[];
  /** 回答列表 */
  answers: InterviewAnswer[];
  /** 是否完成 */
  isComplete: boolean;
  /** 轮次 */
  round: number;
}
