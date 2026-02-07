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
 * Strip markdown code fences from Claude's response and parse JSON.
 */
function parseJsonResponse<T>(text: string): T {
  // Remove ```json ... ``` or ``` ... ``` wrappers
  const stripped = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/, "");
  return JSON.parse(stripped);
}

interface ChapterBoundary {
  title: string;
  start_text: string;
}

/**
 * Split raw PDF text into chapters using Claude.
 * Step 1: Ask Claude for chapter titles + first ~60 chars of each chapter.
 * Step 2: Use those markers to split the full text locally.
 */
export async function detectChapters(fullText: string): Promise<ChapterData[]> {
  const system = `You identify chapter boundaries in course text. Return ONLY valid JSON, no markdown fences.`;

  const prompt = `Analyze this course text and identify where each chapter starts.

Return a JSON array: [{"title": "Chapter title", "start_text": "first 50-60 characters of that chapter exactly as they appear"}]

Rules:
- "start_text" must be an EXACT substring from the text (I will use it to find the position)
- Include enough characters to be unique (50-60 chars)
- Maximum 20 chapters
- If there are no clear chapters, split by major topic shifts
- If the text is very short, return a single chapter

Text:
---
${fullText.slice(0, 80000)}
---`;

  const response = await askClaude(system, prompt);
  const boundaries: ChapterBoundary[] = parseJsonResponse(response);

  // Split the full text using the boundary markers
  const chapters: ChapterData[] = [];

  for (let i = 0; i < boundaries.length; i++) {
    const boundary = boundaries[i];
    const startIdx = fullText.indexOf(boundary.start_text);

    let content: string;
    if (startIdx === -1) {
      // Marker not found — skip or use remaining text for last entry
      if (i === 0) {
        // First chapter not found, use full text as single chapter
        return [{ title: boundary.title, content: fullText }];
      }
      continue;
    }

    if (i < boundaries.length - 1) {
      // Find where the next chapter starts
      const nextBoundary = boundaries[i + 1];
      const nextIdx = fullText.indexOf(nextBoundary.start_text, startIdx + 1);
      content = nextIdx !== -1
        ? fullText.slice(startIdx, nextIdx)
        : fullText.slice(startIdx);
    } else {
      // Last chapter — take everything until the end
      content = fullText.slice(startIdx);
    }

    chapters.push({ title: boundary.title, content: content.trim() });
  }

  // Fallback: if no chapters were created, use full text as one chapter
  if (chapters.length === 0) {
    return [{ title: "Full Course", content: fullText }];
  }

  return chapters;
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
  return parseJsonResponse(response);
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
  return parseJsonResponse(response);
}
