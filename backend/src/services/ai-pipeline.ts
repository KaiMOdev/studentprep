import { askClaude } from "./claude.js";

export interface ChapterData {
  title: string;
  content: string;
}

export interface ChapterSummary {
  main_topics: { topic: string; explanation: string; key_terms: string[] }[];
  side_topics: { topic: string; explanation: string }[];
}

export interface GeneratedQuestions {
  exam_questions: { question: string; suggested_answer: string }[];
  discussion_questions: { question: string; why_useful: string }[];
}

/**
 * Split raw PDF text into chapters using Claude.
 */
export async function detectChapters(fullText: string): Promise<ChapterData[]> {
  const system = `You split course/textbook text into chapters. Return ONLY valid JSON, no markdown fences.`;

  const prompt = `Analyze this course text and split it into chapters. Identify chapter boundaries based on headings, numbering, or topic shifts.

Return a JSON array of objects: [{"title": "Chapter title", "content": "Full text of this chapter..."}]

Rules:
- Keep the original text intact in "content" (don't summarize yet)
- If there are no clear chapters, split by major topic shifts
- Each chapter should be a meaningful unit of study
- Maximum 20 chapters
- If the text is very short (< 500 words), return it as a single chapter

Text:
---
${fullText.slice(0, 80000)}
---`;

  const response = await askClaude(system, prompt);
  return JSON.parse(response);
}

/**
 * Summarize a single chapter: extract main topics and side topics.
 */
export async function summarizeChapter(
  chapterTitle: string,
  chapterText: string
): Promise<ChapterSummary> {
  const system = `You are a study assistant that creates structured summaries. Return ONLY valid JSON, no markdown fences. Keep language consistent with the source material.`;

  const prompt = `Analyze this chapter and provide a structured summary.

1. MAIN TOPICS: The core concepts a student MUST know for an exam.
   Return as: {"topic": "...", "explanation": "...", "key_terms": ["..."]}

2. SIDE TOPICS: Supporting details, examples, context that help understanding.
   Return as: {"topic": "...", "explanation": "..."}

Return JSON: {"main_topics": [...], "side_topics": [...]}

Chapter: "${chapterTitle}"
---
${chapterText.slice(0, 30000)}
---`;

  const response = await askClaude(system, prompt);
  return JSON.parse(response);
}

/**
 * Generate exam and discussion questions for a chapter.
 */
export async function generateQuestions(
  chapterTitle: string,
  chapterText: string
): Promise<GeneratedQuestions> {
  const system = `You generate study questions. Return ONLY valid JSON, no markdown fences.`;

  const prompt = `Based on this chapter, generate:

1. Five questions a university professor would ask on a written exam.
   These should test deep understanding, not just memorization.

2. Five questions a student could ask the professor during class
   to get more insight or clarification.

Return JSON:
{
  "exam_questions": [{"question": "...", "suggested_answer": "..."}],
  "discussion_questions": [{"question": "...", "why_useful": "..."}]
}

Chapter: "${chapterTitle}"
---
${chapterText.slice(0, 30000)}
---`;

  const response = await askClaude(system, prompt);
  return JSON.parse(response);
}
