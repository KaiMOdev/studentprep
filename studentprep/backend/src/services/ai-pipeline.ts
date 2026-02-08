import { askClaude, type AIModel, DEFAULT_MODEL } from "./claude.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChapterData {
  title: string;
  content: string;
}

export interface ChapterSummary {
  source_language: string;
  main_topics: {
    topic: string;
    explanation: string;
    key_terms: { term: string; definition: string }[];
    importance: "critical" | "important" | "supporting";
  }[];
  side_topics: { topic: string; explanation: string }[];
  prerequisites: string[];
  connections: string[];
}

export interface MultilingualText {
  en: string;
  nl: string;
  fr: string;
}

export type BloomLevel =
  | "remember"
  | "understand"
  | "apply"
  | "analyze"
  | "evaluate"
  | "create";

export interface GeneratedQuestions {
  exam_questions: {
    question: string;
    suggested_answer: string;
    bloom_level: BloomLevel;
    difficulty: 1 | 2 | 3;
    related_topic: string;
  }[];
  discussion_questions: {
    question: string;
    why_useful: string;
    related_topic: string;
  }[];
}

export interface MultilingualQuestions {
  exam_questions: {
    question: MultilingualText;
    suggested_answer: MultilingualText;
    bloom_level: BloomLevel;
    difficulty: 1 | 2 | 3;
  }[];
  discussion_questions: {
    question: MultilingualText;
    why_useful: MultilingualText;
  }[];
}

export interface StudyPlanDay {
  date: string;
  chapters: { id: string; title: string }[];
  total_minutes: number;
  type: "study" | "review" | "buffer" | "practice";
  focus: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Strip markdown code fences from Claude's response and parse JSON.
 * Now also handles partial fences and trailing commas.
 */
function parseJsonResponse<T>(text: string): T {
  let cleaned = text
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/, "")
    .trim();

  // Fix trailing commas before } or ] (common Claude mistake)
  cleaned = cleaned.replace(/,\s*([}\]])/g, "$1");

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // Attempt to extract JSON from surrounding text
    const jsonMatch = cleaned.match(/[\[{][\s\S]*[\]}]/);
    if (jsonMatch) {
      const extracted = jsonMatch[0].replace(/,\s*([}\]])/g, "$1");
      return JSON.parse(extracted);
    }
    throw new Error(`Failed to parse Claude response as JSON: ${(e as Error).message}\nRaw: ${text.slice(0, 500)}`);
  }
}

/**
 * Fuzzy find: locate start_text in fullText, tolerating minor whitespace differences.
 */
function fuzzyIndexOf(fullText: string, marker: string, fromIndex = 0): number {
  // Try exact match first
  const exact = fullText.indexOf(marker, fromIndex);
  if (exact !== -1) return exact;

  // Normalize whitespace and try again
  const normalizeWs = (s: string) => s.replace(/\s+/g, " ").trim();
  const normalizedFull = normalizeWs(fullText);
  const normalizedMarker = normalizeWs(marker);

  const normalizedIdx = normalizedFull.indexOf(normalizedMarker, fromIndex > 0 ? Math.max(0, fromIndex - 50) : 0);
  if (normalizedIdx === -1) return -1;

  // Map back to original index (approximate)
  // Find the closest match in the original text near the normalized position
  const searchWindow = 200;
  const approxStart = Math.max(0, normalizedIdx - searchWindow);
  const approxEnd = Math.min(fullText.length, normalizedIdx + marker.length + searchWindow);
  const window = fullText.slice(approxStart, approxEnd);

  // Try progressively shorter substrings of the marker
  for (let len = marker.length; len >= 20; len -= 5) {
    const sub = normalizeWs(marker.slice(0, len));
    const subWords = sub.split(" ");
    // Build a regex that allows flexible whitespace
    const pattern = subWords.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
    const re = new RegExp(pattern);
    const match = window.match(re);
    if (match && match.index !== undefined) {
      return approxStart + match.index;
    }
  }

  return -1;
}

// ─── Chapter Detection ───────────────────────────────────────────────────────

interface ChapterBoundary {
  title: string;
  start_text: string;
}

/**
 * Split raw PDF text into chapters using Claude.
 * Improved: better prompt, fuzzy matching, validation.
 */
export async function detectChapters(fullText: string, model: AIModel = DEFAULT_MODEL): Promise<ChapterData[]> {
  const textPreview = fullText.slice(0, 80000);

  const system = `You are a document structure analyzer. Your job is to identify chapter or section boundaries in academic/course text. You return ONLY raw JSON — no markdown fences, no explanation.`;

  const prompt = `I have extracted text from a PDF course document. Identify where each chapter or major section starts.

INSTRUCTIONS:
1. Look for structural markers: numbered chapters, bold headings, "Chapter X", Roman numerals, or clear topic transitions.
2. For each chapter, give me its title and a verbatim snippet from the VERY BEGINNING of that chapter (the first 60-80 characters, copied exactly — I will use string matching to find the position).
3. The start_text must be EXACTLY as it appears in the text, including any numbering, whitespace, or punctuation.
4. If the document has no clear chapters, identify 3-8 major topic shifts.
5. Maximum 20 entries.

OUTPUT FORMAT (raw JSON array, no fences):
[{"title": "Descriptive chapter title", "start_text": "exact first 60-80 chars from the text"}]

EXAMPLES of good start_text values:
- "Chapter 3: Database Normalization\\nNormalization is the proc"
- "3.1 Introduction to Machine Learning\\n\\nMachine learning is"
- "PART II: ADVANCED TOPICS\\n\\nIn this section we explore"

TEXT:
---
${textPreview}
---`;

  const response = await askClaude(system, prompt, 8192, model);
  const boundaries: ChapterBoundary[] = parseJsonResponse(response);

  if (!boundaries || boundaries.length === 0) {
    return [{ title: "Full Course", content: fullText }];
  }

  // Split using fuzzy matching
  const chapters: ChapterData[] = [];
  const foundPositions: { idx: number; boundary: ChapterBoundary }[] = [];

  for (const boundary of boundaries) {
    const idx = fuzzyIndexOf(fullText, boundary.start_text);
    if (idx !== -1) {
      foundPositions.push({ idx, boundary });
    }
  }

  // Sort by position in text
  foundPositions.sort((a, b) => a.idx - b.idx);

  // Remove duplicates (positions too close together)
  const deduplicated = foundPositions.filter(
    (pos, i) => i === 0 || pos.idx - foundPositions[i - 1].idx > 100
  );

  for (let i = 0; i < deduplicated.length; i++) {
    const start = deduplicated[i].idx;
    const end = i < deduplicated.length - 1 ? deduplicated[i + 1].idx : fullText.length;
    const content = fullText.slice(start, end).trim();

    if (content.length > 50) {
      chapters.push({ title: deduplicated[i].boundary.title, content });
    }
  }

  if (chapters.length === 0) {
    return [{ title: "Full Course", content: fullText }];
  }

  return chapters;
}

// ─── Chapter Summary ─────────────────────────────────────────────────────────

/**
 * Summarize a chapter: extract main topics, side topics, key terms with definitions,
 * prerequisite knowledge, and connections to other topics.
 */
export async function summarizeChapter(
  chapterTitle: string,
  chapterText: string,
  model: AIModel = DEFAULT_MODEL
): Promise<ChapterSummary> {
  const system = `You are an expert academic tutor creating study materials. You produce structured summaries that help students prepare for university exams. Respond in the SAME LANGUAGE as the source material. Return ONLY raw JSON — no markdown fences, no commentary.`;

  const prompt = `Analyze this chapter and create a comprehensive study summary.

INSTRUCTIONS:
- Respond in the SAME LANGUAGE as the chapter text below.
- Base your summary EXCLUSIVELY on the content provided — no external knowledge.
- Ignore metadata (author, publisher, ISBN, etc.).

PRODUCE THIS STRUCTURE:
{
  "source_language": "detected language code (en/nl/fr/de/...)",
  "main_topics": [
    {
      "topic": "Topic name",
      "explanation": "Clear 2-4 sentence explanation a student can study from. Include the WHY, not just the WHAT.",
      "key_terms": [
        {"term": "Technical term", "definition": "Concise definition as used in this course"}
      ],
      "importance": "critical | important | supporting"
    }
  ],
  "side_topics": [
    {"topic": "Supporting topic", "explanation": "Brief explanation of why it matters in context"}
  ],
  "prerequisites": ["concepts a student should already know before reading this chapter"],
  "connections": ["how this chapter relates to broader themes or other possible chapters"]
}

GUIDELINES:
- Mark topics "critical" if a student would fail the exam without knowing them.
- Mark topics "important" if they're likely exam material but not make-or-break.
- Mark topics "supporting" if they provide context or depth.
- Key terms should include definitions AS USED IN THIS COURSE (not generic dictionary definitions).
- Prerequisites help students identify gaps before studying this chapter.
- Connections help students see the bigger picture.

Chapter: "${chapterTitle}"
---
${chapterText.slice(0, 30000)}
---`;

  const response = await askClaude(system, prompt, 8192, model);
  return parseJsonResponse(response);
}

// ─── Question Generation ─────────────────────────────────────────────────────

/**
 * Generate graded exam questions using Bloom's taxonomy + discussion questions.
 * Optionally accepts the chapter summary for better question targeting.
 */
export async function generateQuestions(
  chapterTitle: string,
  chapterText: string,
  summary?: ChapterSummary,
  model: AIModel = DEFAULT_MODEL
): Promise<GeneratedQuestions> {
  const summaryContext = summary
    ? `\nKEY TOPICS IDENTIFIED:\n${summary.main_topics.map((t) => `- [${t.importance}] ${t.topic}`).join("\n")}\n`
    : "";

  const system = `You are a university professor designing exam questions. You create questions at varying cognitive levels (Bloom's taxonomy). Questions must be answerable ONLY from the provided material. Return ONLY raw JSON — no markdown fences.`;

  const prompt = `Create study questions for this chapter.
${summaryContext}
EXAM QUESTIONS (generate 8):
Distribute across Bloom's taxonomy levels:
- 2x "remember/understand" (difficulty: 1) — definitions, recall, basic comprehension
- 3x "apply/analyze" (difficulty: 2) — apply concepts to scenarios, compare/contrast, find patterns
- 3x "evaluate/create" (difficulty: 3) — critique, justify, design, synthesize arguments

For each question, provide:
- The question itself (clear, specific, exam-worthy)
- A model answer (what would earn full marks — 3-6 sentences)
- The Bloom level: remember | understand | apply | analyze | evaluate | create
- Difficulty: 1, 2, or 3
- Which topic from the chapter it tests

DISCUSSION QUESTIONS (generate 5):
Questions a curious student would ask in class to deepen understanding. These should:
- Challenge assumptions in the material
- Ask about real-world applications
- Explore edge cases or limitations
- Connect to other fields

Return JSON:
{
  "exam_questions": [
    {
      "question": "...",
      "suggested_answer": "...",
      "bloom_level": "analyze",
      "difficulty": 2,
      "related_topic": "topic name from the chapter"
    }
  ],
  "discussion_questions": [
    {
      "question": "...",
      "why_useful": "what insight this question helps develop",
      "related_topic": "topic name"
    }
  ]
}

RULES:
- Questions MUST be answerable from the chapter content below only.
- Do NOT ask about metadata (author, publication, etc.).
- Vary question formats: explain, compare, apply-to-scenario, evaluate, design.
- Model answers should demonstrate deep understanding, not just keyword matching.

Chapter: "${chapterTitle}"
---
${chapterText.slice(0, 30000)}
---`;

  const response = await askClaude(system, prompt, 8192, model);
  return parseJsonResponse(response);
}

// ─── Multilingual Questions ──────────────────────────────────────────────────

/**
 * Generate questions in one language, then translate.
 * More token-efficient and higher quality than generating in 3 languages at once.
 */
export async function generateMultilingualQuestions(
  chapterTitle: string,
  chapterText: string,
  summary?: ChapterSummary,
  model: AIModel = DEFAULT_MODEL
): Promise<MultilingualQuestions> {
  // Step 1: Generate high-quality questions in the source language
  const baseQuestions = await generateQuestions(chapterTitle, chapterText, summary, model);

  // Step 2: Translate to all three languages
  const system = `You are a professional academic translator. Translate study questions and answers accurately into English, Dutch, and French. Preserve academic terminology and nuance. Return ONLY raw JSON — no markdown fences.`;

  const prompt = `Translate these exam and discussion questions into English (en), Dutch (nl), and French (fr).

RULES:
- Preserve academic and technical terminology accurately in each language.
- Adapt idioms and phrasing to sound natural in each language.
- Keep the same meaning and level of detail in all translations.
- If the original is already in one of the target languages, still include it.

QUESTIONS TO TRANSLATE:
${JSON.stringify(baseQuestions, null, 2)}

Return JSON:
{
  "exam_questions": [
    {
      "question": {"en": "...", "nl": "...", "fr": "..."},
      "suggested_answer": {"en": "...", "nl": "...", "fr": "..."},
      "bloom_level": "...",
      "difficulty": 1
    }
  ],
  "discussion_questions": [
    {
      "question": {"en": "...", "nl": "...", "fr": "..."},
      "why_useful": {"en": "...", "nl": "...", "fr": "..."}
    }
  ]
}`;

  const response = await askClaude(system, prompt, 8192, model);
  return parseJsonResponse(response);
}

// ─── Study Plan ──────────────────────────────────────────────────────────────

/**
 * Generate a study plan with spaced repetition and active recall sessions.
 */
export async function generateStudyPlan(
  chapters: { id: string; title: string; importance?: string }[],
  examDate: string,
  hoursPerDay: number,
  model: AIModel = DEFAULT_MODEL
): Promise<StudyPlanDay[]> {
  const today = new Date().toISOString().split("T")[0];
  const examD = new Date(examDate);
  const todayD = new Date(today);
  const daysAvailable = Math.floor((examD.getTime() - todayD.getTime()) / (1000 * 60 * 60 * 24));

  const system = `You are a study coach who creates evidence-based study schedules using spaced repetition and active recall principles. Return ONLY raw JSON — no markdown fences. Use ISO date format (YYYY-MM-DD).`;

  const prompt = `Create a study plan for a university student.

PARAMETERS:
- Today: ${today}
- Exam date: ${examDate}
- Days available: ${daysAvailable}
- Study hours per day: ${hoursPerDay}
- Chapters:
${chapters.map((ch, i) => `  ${i + 1}. "${ch.title}" (id: "${ch.id}")${ch.importance ? ` [${ch.importance}]` : ""}`).join("\n")}

STUDY SCIENCE PRINCIPLES TO APPLY:
1. SPACED REPETITION: Review material at increasing intervals (1 day, 3 days, 7 days).
2. INTERLEAVING: Mix chapters on review days rather than blocking.
3. ACTIVE RECALL: Include "practice" days where the student tests themselves.
4. PROGRESSIVE LOAD: Start with the most critical/foundational chapters.
5. BUFFER: Leave a buffer day before the exam for rest and light review.

DAY TYPES:
- "study": First encounter with new material (read, summarize, take notes)
- "review": Revisit previously studied chapters (re-read summaries, key terms)
- "practice": Self-test with questions, practice problems
- "buffer": Light review or rest day

${daysAvailable < chapters.length * 2
    ? "WARNING: Limited time available. Prioritize critical chapters and combine where possible."
    : ""}

Return a JSON array:
[{
  "date": "YYYY-MM-DD",
  "chapters": [{"id": "...", "title": "..."}],
  "total_minutes": 120,
  "type": "study | review | practice | buffer",
  "focus": "brief description of what to do this day"
}]

RULES:
- Don't schedule on the exam day itself.
- Be realistic: max ${hoursPerDay * 60} minutes per day.
- Every chapter should be studied at least once and reviewed at least once.
- The last 1-2 days should be review/practice, not new material.`;

  const response = await askClaude(system, prompt, 8192, model);
  return parseJsonResponse(response);
}
