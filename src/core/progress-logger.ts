import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { ProgressLog } from '../planner/types.js';

/**
 * 经验日志管理 — 独立模块，避免循环依赖
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
