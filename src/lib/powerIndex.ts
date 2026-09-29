"use client";

const NO_POWER_SENTINEL = 500;

export interface QuestionWord {
  text: string;
  start: number;
  end: number;
}

export function getQuestionWords(question: string): QuestionWord[] {
  const words: QuestionWord[] = [];
  const wordRegex = /\S+/g;
  let match: RegExpExecArray | null;

  while ((match = wordRegex.exec(question)) !== null) {
    words.push({
      text: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  return words;
}

export function getEffectivePowerWordIndex(question: string, powerIndex: number): number {
  const words = getQuestionWords(question);

  if (powerIndex <= 0) return 0;
  if (powerIndex >= NO_POWER_SENTINEL) return 0;

  return Math.min(powerIndex, words.length);
}

export function countWordsRevealed(question: string, charIndex: number): number {
  return getQuestionWords(question).filter(word => charIndex > word.start).length;
}
