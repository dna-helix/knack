/**
 * Fuzzy answer checker for NAQT-style quizbowl answers.
 *
 * Handles:
 * - HTML tag stripping (<u>, <b>, etc.)
 * - Alternate answers: [or ...], [accept ...]
 * - Prompt-on answers: [prompt on ...] — returns needsPrompt instead of correct/incorrect
 * - Levenshtein-based fuzzy matching for typo tolerance
 * - Plural/singular normalization
 */

// ── Levenshtein Distance ──────────────────────────────────────────────
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

// ── Normalize text for comparison ─────────────────────────────────────
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, '')          // strip HTML tags
    .replace(/['']/g, "'")            // normalize smart quotes
    .replace(/[^a-z0-9\s']/g, '')     // strip punctuation except apostrophes
    .replace(/\s+/g, ' ')             // collapse whitespace
    .trim();
}

// ── Strip bracket/paren groups from raw answer ────────────────────────
// Removes ALL [...] and (...) groups so underline extraction only runs
// on the primary answer text, not on prompt/accept/or directives.
function stripBracketGroups(raw: string): string {
  return raw.replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '');
}

// ── Parse prompt-on answers ───────────────────────────────────────────
interface PromptEntry {
  answer: string;
  promptMessage: string;
}

export function parsePromptAnswers(rawAnswer: string): PromptEntry[] {
  const prompts: PromptEntry[] = [];

  // Match [prompt on ...] and (prompt on ...) groups
  const promptGroups = rawAnswer.match(/[\[(]prompt\s+on\s[^\])]*[\])]/gi) || [];
  for (const group of promptGroups) {
    // Extract custom prompt message if present: "by asking ..."
    let promptMessage = 'Can you be more specific?';
    const byAskingMatch = group.match(/by\s+asking\s+[""\u201c]([^""\u201d]+)[""\u201d]|by\s+asking\s+"([^"]+)"/i);
    if (byAskingMatch) {
      promptMessage = byAskingMatch[1] || byAskingMatch[2] || promptMessage;
    }

    // Remove the bracket, keyword, conditions like "before mention", and "by asking" clause
    const inner = group
      .replace(/^[\[(]\s*prompt\s+on\s+/i, '')
      .replace(/[\])]$/, '')
      .replace(/\s+before\s+.*/i, '')     // remove "before mention" clauses
      .replace(/\s+by\s+asking\s.*/i, '') // remove "by asking" clauses
      .replace(/\s+but\s+do\s+not\s+.*/i, '') // remove "but do not accept" clauses
      .trim();

    // Split on semicolons first
    const semiParts = inner.split(';');
    for (const semiPart of semiParts) {
      // Then split on " or " to handle "ellipse or oval" → ["ellipse", "oval"]
      const orParts = semiPart.split(/\s+or\s+/i);
      for (const part of orParts) {
        const cleaned = part.replace(/<[^>]+>/g, '').trim();
        // Skip meta-instructions
        if (/reasonable|equivalent|do not|anti|descriptive|partial/i.test(cleaned)) continue;
        if (cleaned) {
          prompts.push({ answer: normalize(cleaned), promptMessage });
        }
      }
    }
  }
  return prompts;
}

// ── Parse the raw answer string into acceptable answers ───────────────
export function parseAcceptableAnswers(rawAnswer: string): string[] {
  const answers: string[] = [];

  // Strip all bracket/paren groups BEFORE extracting underlines.
  // This prevents prompt-on terms (e.g. <u>ellipse</u> inside [prompt on ...])
  // from being treated as acceptable answers.
  const primaryText = stripBracketGroups(rawAnswer);

  // 1. Extract the primary answer (plain text without HTML)
  const mainAnswer = primaryText.replace(/<[^>]+>/g, '').trim();
  if (mainAnswer) {
    answers.push(normalize(mainAnswer));
  }

  // 2. Extract the underlined (required) portions from PRIMARY text only
  const underlineMatches = primaryText.match(/<u>(.*?)<\/u>/g);
  if (underlineMatches) {
    for (const match of underlineMatches) {
      const inner = match.replace(/<\/?u>/g, '').trim();
      if (inner) {
        answers.push(normalize(inner));
      }
    }
  }

  // 3. Extract alternate answers from [or ...], [accept ...], (or ...), (accept ...)
  //    but NOT [prompt on ...] groups
  const bracketGroups = rawAnswer.match(/[\[(](or|accept)[^\])]*[\])]/gi) || [];
  for (const group of bracketGroups) {
    const inner = group
      .replace(/^[\[(]\s*(or|accept)\s*/i, '')
      .replace(/[\])]$/, '')
      .trim();

    const parts = inner.split(';');
    for (const part of parts) {
      const cleaned = part.replace(/<[^>]+>/g, '').trim();
      // Skip meta-instructions
      if (/reasonable|equivalent|prompt|anti|do not/i.test(cleaned)) continue;
      if (cleaned) {
        answers.push(normalize(cleaned));
      }
    }
  }

  // Deduplicate
  return Array.from(new Set(answers.filter(a => a.length > 0)));
}

// ── Fuzzy match check ─────────────────────────────────────────────────
function fuzzyMatch(userAnswer: string, target: string): boolean {
  // Exact match
  if (userAnswer === target) return true;

  // Containment: user typed a key portion of the answer
  if (target.includes(userAnswer) && userAnswer.length >= 3) return true;
  if (userAnswer.includes(target) && target.length >= 3) return true;

  // Levenshtein fuzzy match with scaled threshold
  const maxLen = Math.max(userAnswer.length, target.length);
  const threshold = maxLen <= 5 ? 1 : maxLen <= 10 ? 2 : 3;
  const dist = levenshtein(userAnswer, target);
  if (dist <= threshold) return true;

  // Handle plurals: "strikes" vs "strike"
  if (userAnswer.endsWith('s') && levenshtein(userAnswer.slice(0, -1), target) <= threshold) return true;
  if (target.endsWith('s') && levenshtein(userAnswer, target.slice(0, -1)) <= threshold) return true;

  return false;
}

// ── Public API ────────────────────────────────────────────────────────
export interface AnswerResult {
  isCorrect: boolean;
  needsPrompt: boolean;
  promptMessage: string;
  matchedAnswer: string;
}

export function checkAnswer(userAnswer: string, rawAnswer: string): AnswerResult {
  const normalizedUser = normalize(userAnswer);
  if (!normalizedUser) {
    return { isCorrect: false, needsPrompt: false, promptMessage: '', matchedAnswer: '' };
  }

  // 1. Check against acceptable (correct) answers first
  const acceptableAnswers = parseAcceptableAnswers(rawAnswer);
  for (const acceptable of acceptableAnswers) {
    if (fuzzyMatch(normalizedUser, acceptable)) {
      return { isCorrect: true, needsPrompt: false, promptMessage: '', matchedAnswer: acceptable };
    }
  }

  // 2. Check against prompt-on answers
  const promptAnswers = parsePromptAnswers(rawAnswer);
  for (const prompt of promptAnswers) {
    if (fuzzyMatch(normalizedUser, prompt.answer)) {
      return { isCorrect: false, needsPrompt: true, promptMessage: prompt.promptMessage, matchedAnswer: prompt.answer };
    }
  }

  return { isCorrect: false, needsPrompt: false, promptMessage: '', matchedAnswer: '' };
}
