import type { Skill, SkillCategory } from '../planner/types.js';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * 技能存储管理
 */
export class SkillStorage {
  private skillsDir: string;

  constructor(projectRoot: string = process.cwd()) {
    this.skillsDir = join(projectRoot, 'skills');
    if (!existsSync(this.skillsDir)) {
      mkdirSync(this.skillsDir, { recursive: true });
    }
  }

  /**
   * 保存技能到 skills/ 目录
   */
  saveSkill(skill: Skill): string {
    const filename = `${skill.category}-${skill.name}.md`;
    const filepath = join(this.skillsDir, filename);
    const content = this.formatSkill(skill);
    writeFileSync(filepath, content, 'utf-8');
    return filepath;
  }

  /**
   * 加载所有技能
   */
  loadSkills(): Skill[] {
    if (!existsSync(this.skillsDir)) return [];

    const files = readdirSync(this.skillsDir).filter((f) => f.endsWith('.md'));
    return files
      .map((f) => {
        const content = readFileSync(join(this.skillsDir, f), 'utf-8');
        return this.parseSkill(content);
      })
      .filter((s): s is Skill => s !== null);
  }

  /**
   * 搜索技能
   */
  searchSkills(query: string): Skill[] {
    const skills = this.loadSkills();
    const lower = query.toLowerCase();
    return skills.filter(
      (s) =>
        s.name.toLowerCase().includes(lower) ||
        s.description.toLowerCase().includes(lower) ||
        s.category.includes(lower)
    );
  }

  /**
   * 格式化技能为 Markdown
   */
  private formatSkill(skill: Skill): string {
    return `# ${skill.name}

**分类**: ${skill.category}
**描述**: ${skill.description}

## 模式

\`\`\`typescript
${skill.pattern}
\`\`\`

## 模板

\`\`\`typescript
${skill.template}
\`\`\`

## 示例

\`\`\`typescript
${skill.examples[0] || '// 暂无示例'}
\`\`\`
`;
  }

  /**
   * 从 Markdown 解析技能
   */
  private parseSkill(content: string): Skill | null {
    const nameMatch = content.match(/^# (.+)$/m);
    const descMatch = content.match(/\*\*描述\*\*: (.+)$/m);
    const catMatch = content.match(/\*\*分类\*\*: (.+)$/m);

    if (!nameMatch) return null;

    return {
      name: nameMatch[1],
      description: descMatch?.[1] || '',
      category: (catMatch?.[1] || 'other') as SkillCategory,
      pattern: this.extractCodeBlock(content, 1),
      template: this.extractCodeBlock(content, 2),
      examples: [this.extractCodeBlock(content, 3)],
    };
  }

  private extractCodeBlock(content: string, index: number): string {
    const blocks = content.match(/```typescript\n([\s\S]*?)\n```/g);
    if (!blocks || !blocks[index - 1]) return '';
    return blocks[index - 1].replace(/```typescript\n|\n```/g, '');
  }
}
