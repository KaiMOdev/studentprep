import { askClaude } from "./claude.js";

export interface ChapterData {
  title: string;
  content: string;
}

export interface ChapterSummary {
  main_topics: { topic: string; explanation: string; key_terms: string[] }[];
  side_topics: { topic: string; explanation: string }[];
}

export interface MultilingualText {
  en: string;
  nl: string;
  fr: string;
}

export interface GeneratedQuestions {
  exam_questions: { question: string; suggested_answer: string }[];
  discussion_questions: { question: string; why_useful: string }[];
}

export interface MultilingualQuestions {
  exam_questions: {
    question: MultilingualText;
    suggested_answer: MultilingualText;
  }[];
  discussion_questions: {
    question: MultilingualText;
    why_useful: MultilingualText;
  }[];
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
  const system = `You are a study assistant that creates structured summaries strictly based on the provided course material. Return ONLY valid JSON, no markdown fences. Keep language consistent with the source material.`;

  const prompt = `Analyze this chapter and provide a structured summary based ONLY on the content provided below.

1. MAIN TOPICS: The core concepts a student MUST know for an exam.
   Return as: {"topic": "...", "explanation": "...", "key_terms": ["..."]}

2. SIDE TOPICS: Supporting details, examples, context that help understanding.
   Return as: {"topic": "...", "explanation": "..."}

IMPORTANT RULES:
- Only include topics and concepts that are explicitly covered in the chapter text below.
- Do NOT add information from external sources or other courses.
- Do NOT include topics about the author or publication metadata.

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
  const system = `You generate study questions strictly based on the provided course material. Return ONLY valid JSON, no markdown fences.`;

  const prompt = `Based ONLY on the chapter content provided below, generate:

1. Five questions a university professor would ask on a written exam.
   These should test deep understanding, not just memorization.

2. Five questions a student could ask the professor during class
   to get more insight or clarification.

IMPORTANT RULES:
- Questions MUST be derived exclusively from the concepts, theories, and information presented in the chapter text below. Do NOT use external knowledge or content from other courses/subjects.
- Do NOT generate questions about the author, publisher, publication date, or any other metadata about the course material itself.
- Focus on the subject matter, key concepts, theories, and practical applications covered in the chapter.

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

/**
 * Generate exam and discussion questions for a chapter in English, Dutch, and French.
 */
export async function generateMultilingualQuestions(
  chapterTitle: string,
  chapterText: string
): Promise<MultilingualQuestions> {
  const system = `You generate study questions in multiple languages strictly based on the provided course material. Return ONLY valid JSON, no markdown fences.`;

  const prompt = `Based ONLY on the chapter content provided below, generate:

1. Five questions a university professor would ask on a written exam.
   These should test deep understanding, not just memorization.

2. Five questions a student could ask the professor during class
   to get more insight or clarification.

IMPORTANT RULES:
- Questions MUST be derived exclusively from the concepts, theories, and information presented in the chapter text below. Do NOT use external knowledge or content from other courses/subjects.
- Do NOT generate questions about the author, publisher, publication date, or any other metadata about the course material itself.
- Focus on the subject matter, key concepts, theories, and practical applications covered in the chapter.
- Provide each question and answer in THREE languages: English (en), Dutch (nl), and French (fr).

Return JSON:
{
  "exam_questions": [
    {
      "question": {"en": "English question", "nl": "Dutch question", "fr": "French question"},
      "suggested_answer": {"en": "English answer", "nl": "Dutch answer", "fr": "French answer"}
    }
  ],
  "discussion_questions": [
    {
      "question": {"en": "English question", "nl": "Dutch question", "fr": "French question"},
      "why_useful": {"en": "English explanation", "nl": "Dutch explanation", "fr": "French explanation"}
    }
  ]
}

Chapter: "${chapterTitle}"
---
${chapterText.slice(0, 30000)}
---`;

  const response = await askClaude(system, prompt);
  return parseJsonResponse(response);
}

export interface StudyPlanDay {
  date: string;
  chapters: { id: string; title: string }[];
  total_minutes: number;
  type: "study" | "review" | "buffer";
}

/**
 * Generate a study plan for a course.
 */
export async function generateStudyPlan(
  chapters: { id: string; title: string }[],
  examDate: string,
  hoursPerDay: number
): Promise<StudyPlanDay[]> {
  const system = `You create realistic study schedules. Return ONLY valid JSON, no markdown fences. Use ISO date format (YYYY-MM-DD).`;

  const today = new Date().toISOString().split("T")[0];

  const prompt = `Create a study plan for a student with these parameters:

- Today: ${today}
- Exam date: ${examDate}
- Available study hours per day: ${hoursPerDay}
- Chapters to cover:
${chapters.map((ch, i) => `  ${i + 1}. "${ch.title}" (id: "${ch.id}")`).join("\n")}

Rules:
- Spread chapters evenly across available days
- Include 1-2 review days before the exam
- Add a buffer day if there's enough time
- Each day should have a realistic workload
- Don't schedule study on the exam day itself

Return a JSON array:
[{"date": "YYYY-MM-DD", "chapters": [{"id": "...", "title": "..."}], "total_minutes": 120, "type": "study|review|buffer"}]`;

  const response = await askClaude(system, prompt);
  return parseJsonResponse(response);
}
