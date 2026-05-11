import * as readline from 'readline';
import type { InterviewQuestion, InterviewAnswer } from './types.js';

/**
 * 交互式收集用户对 Interview 问题的回答
 * @param questions Interview 问题列表
 * @param maxRounds 最大轮次
 * @returns 回答列表
 */
export async function collectAnswers(
  questions: InterviewQuestion[],
  maxRounds: number = 2
): Promise<InterviewAnswer[]> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answers: InterviewAnswer[] = [];

  for (const q of questions) {
    console.log(`\n📝 ${q.question}`);
    q.options.forEach((opt, idx) => {
      console.log(`  ${idx + 1}. ${opt.label} — ${opt.description}`);
    });

    const answer = await prompt(rl, `请选择 (1-${q.options.length}): `);
    const idx = parseInt(answer) - 1;

    if (idx >= 0 && idx < q.options.length) {
      answers.push({
        questionId: q.category,
        selectedOption: q.options[idx].value,
      });
    } else {
      // 默认选第一个
      answers.push({
        questionId: q.category,
        selectedOption: q.options[0].value,
        reasoning: '使用默认选项',
      });
    }
  }

  rl.close();
  return answers;
}

/**
 * 非交互式快速回答（用于测试/默认配置）
 */
export function quickAnswers(
  questions: InterviewQuestion[],
  selections: string[]
): InterviewAnswer[] {
  return questions.map((q, idx) => ({
    questionId: q.category,
    selectedOption: selections[idx] || q.options[0].value,
  }));
}

/**
 * 提示用户输入
 */
function prompt(rl: readline.Interface, query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      resolve(answer.trim());
    });
  });
}
