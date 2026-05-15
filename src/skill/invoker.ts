import type { Skill } from '../planner/types.js';
import { SkillStorage } from './storage.js';
import { existsSync, readFileSync, writeFileSync } from 'fs';

/**
 * 技能调用接口
 */
export class SkillInvoker {
  private storage: SkillStorage;
  private statsPath: string;

  constructor(projectRoot: string = process.cwd()) {
    this.storage = new SkillStorage(projectRoot);
    this.statsPath = `${projectRoot}/skills/usage-stats.json`;
  }

  /**
   * 调用技能
   */
  async invokeSkill(skillName: string, context: Record<string, any> = {}): Promise<string> {
    const skills = this.storage.searchSkills(skillName);
    if (skills.length === 0) {
      return `⚠️  未找到技能：${skillName}`;
    }

    const skill = skills[0];
    const usage = this.generateUsage(skill, context);
    this.recordUsage(skillName);

    return usage;
  }

  /**
   * 生成技能使用说明
   */
  private generateUsage(skill: Skill, context: Record<string, any>): string {
    return `## 技能：${skill.name}

**描述**: ${skill.description}
**分类**: ${skill.category}

### 使用模板

\`\`\`typescript
${skill.template}
\`\`\`

### 示例

\`\`\`typescript
${skill.examples[0] || '暂无示例'}
\`\`\`

### 上下文参数

${Object.entries(context)
  .map(([k, v]) => `- ${k}: ${JSON.stringify(v)}`)
  .join('\n')}
`;
  }

  /**
   * 记录技能使用统计
   */
  private recordUsage(skillName: string): void {
    try {
      let stats: Record<string, number> = {};
      if (existsSync(this.statsPath)) {
        stats = JSON.parse(readFileSync(this.statsPath, 'utf-8'));
      }
      stats[skillName] = (stats[skillName] || 0) + 1;
      writeFileSync(this.statsPath, JSON.stringify(stats, null, 2));
    } catch {
      // ignore
    }
  }
}
