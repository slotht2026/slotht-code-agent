# slotht-code-agent · Agent Rules

> 四条核心原则 (Karpathy 风格)

## 核心原则

### 1. 先想后写 (Think First)
- 显式声明假设，不要默默选择
- 提出多种方案后再动手
- 不确定时主动提问，不要猜测

### 2. 极简至上 (Minimalist)
- 不为一次性代码做抽象
- 不写未被请求的灵活性和配置项
- 200 行能解决就不要写多余代码
- 如果高级工程师会说"这过度复杂了"，那就简化它

### 3. 手术式修改 (Surgical Changes)
- 只触碰必须改动的代码
- 不顺手改进相邻代码
- 改动风格与现有代码一致

### 4. 目标驱动执行 (Goal-Driven)
- 将模糊任务转化为可验证目标
- 先写测试再实现
- 验收标准必须可机器检测

## 代码约定

### 命名规范
- 文件: kebab-case (`question-generator.ts`)
- 类/接口: PascalCase (`InterviewQuestion`)
- 函数/变量: camelCase (`generateQuestions`)
- 常量: UPPER_SNAKE_CASE (`MAX_ITERATIONS`)

### 目录结构
- `src/` - 源代码
- `test/` - 测试文件（镜像 src/ 结构）
- `tentacles/` - 触手工作区（上下文隔离）
- `skills/` - 可复用技能
- `scripts/` - 构建和工具脚本

### 提交规范
- 格式: `feat: [US-XXX] 任务标题`
- 格式: `fix: [US-XXX] 修复描述`
- 格式: `test: [US-XXX] 测试描述`
- 每次提交只包含一个任务的变更

### TypeScript 约定
- 使用 ES Module (`"type": "module"`)
- strict 模式必须开启
- 优先使用 `const`，仅在必要时使用 `let`
- 避免 `any`，使用 `unknown` 替代
- 接口命名不加 `I` 前缀

### 测试约定
- 测试文件命名: `xxx.test.ts`
- 使用 vitest 框架
- 覆盖率目标: >80%
- 每个公开函数至少一个测试用例
