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

export interface StudyPlanDay {
  date: string;
  chapters: { id: string; title: string }[];
  total_minutes: number;
  type: "study" | "review" | "buffer" | "practice";
  focus: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Escape literal control characters (newlines, tabs, etc.) AND unescaped
 * double-quotes that appear inside JSON string values.
 *
 * Claude sometimes outputs raw newlines or unescaped quotes in JSON strings
 * when the source material (e.g. PDF text) contains them, which is invalid
 * JSON. To distinguish a real string-closing quote from an embedded one we
 * use a look-ahead: after a `"` inside a string, the next non-whitespace
 * character in valid JSON must be one of `,`, `}`, `]`, or `:`. If it isn't,
 * the quote is treated as embedded content and escaped as `\"`.
 */
function sanitizeJsonControlChars(text: string): string {
  let result = "";
  let inString = false;
  let escape = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (escape) {
      result += ch;
      escape = false;
      continue;
    }

    if (ch === "\\" && inString) {
      result += ch;
      escape = true;
      continue;
    }

    if (ch === '"') {
      if (!inString) {
        // Opening a new string
        inString = true;
        result += ch;
        continue;
      }

      // Inside a string — decide if this quote closes it or is embedded.
      // Peek ahead past any whitespace to find the next meaningful character.
      let j = i + 1;
      while (
        j < text.length &&
        (text[j] === " " || text[j] === "\t" ||
         text[j] === "\n" || text[j] === "\r")
      ) {
        j++;
      }
      const next = j < text.length ? text[j] : "";

      if (next === "," || next === "}" || next === "]" || next === ":" || next === "") {
        // Looks like a real string terminator
        inString = false;
        result += ch;
      } else {
        // Embedded quote from content — escape it
        result += '\\"';
      }
      continue;
    }

    if (inString) {
      const code = ch.charCodeAt(0);
      if (code < 0x20) {
        // Escape control characters that are invalid inside JSON strings
        if (ch === "\n") { result += "\\n"; continue; }
        if (ch === "\r") { result += "\\r"; continue; }
        if (ch === "\t") { result += "\\t"; continue; }
        result += `\\u${code.toString(16).padStart(4, "0")}`;
        continue;
      }
    }

    result += ch;
  }

  return result;
}

/**
 * Aggressively sanitize JSON text when string-aware sanitization fails.
 * Fixes invalid escape sequences and replaces ALL control characters
 * (including newlines) with spaces. JSON structure is preserved because
 * spaces are valid whitespace between tokens. String values lose their
 * newlines but that's acceptable vs. failing entirely.
 */
function aggressiveSanitize(text: string): string {
  return text
    // Fix invalid JSON escape sequences (e.g. \H, \S, \C from PDF file paths).
    // Valid JSON escapes: \" \\ \/ \b \f \n \r \t \uXXXX
    .replace(/\\(?!["\\\/bfnrtu])/g, "\\\\")
    // Replace ALL control characters (including newlines/tabs) with spaces.
    // This works because spaces are valid JSON whitespace between tokens,
    // and inside strings the values just lose newlines (acceptable trade-off).
    .replace(/[\x00-\x1f]/g, " ")
    // Fix trailing commas
    .replace(/,\s*([}\]])/g, "$1");
}

/**
 * Try multiple parse strategies on a piece of text.
 * Returns the parsed result or null if all strategies fail.
 */
function tryParseJson<T>(text: string): T | null {
  // Direct parse
  try { return JSON.parse(text); } catch { /* continue */ }

  // Extract JSON from surrounding text
  const jsonMatch = text.match(/[\[{][\s\S]*[\]}]/);
  if (jsonMatch) {
    const extracted = jsonMatch[0].replace(/,\s*([}\]])/g, "$1");
    try { return JSON.parse(extracted); } catch { /* continue */ }
  }

  // Repair truncated JSON
  const repaired = repairTruncatedJson(text);
  if (repaired) {
    try { return JSON.parse(repaired); } catch { /* continue */ }
  }

  return null;
}

/**
 * Strip markdown code fences from Claude's response and parse JSON.
 * Handles partial fences, trailing commas, unescaped control characters,
 * invalid escape sequences, and truncated responses.
 */
function parseJsonResponse<T>(text: string): T {
  let cleaned = text
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/, "")
    .trim();

  // Fix trailing commas before } or ] (common Claude mistake)
  cleaned = cleaned.replace(/,\s*([}\]])/g, "$1");

  // Fix invalid escape sequences (e.g. \H, \S, \C from PDF paths/content).
  // Must run BEFORE sanitizeJsonControlChars so it doesn't confuse string tracking.
  cleaned = cleaned.replace(/\\(?!["\\\/bfnrtu])/g, "\\\\");

  // Sanitize control characters inside JSON string values
  cleaned = sanitizeJsonControlChars(cleaned);

  // Strategy 1: parse the string-aware sanitized text
  const result1 = tryParseJson<T>(cleaned);
  if (result1 !== null) return result1;

  // Strategy 2: aggressive sanitization that doesn't rely on string tracking
  // (handles cases where unescaped quotes in PDF text confuse boundary detection)
  const aggressive = aggressiveSanitize(
    text
      .replace(/^```(?:json)?\s*\n?/i, "")
      .replace(/\n?```\s*$/, "")
      .trim()
  );
  const result2 = tryParseJson<T>(aggressive);
  if (result2 !== null) return result2;

  // Extract error context around the failure position for debugging
  let context = "";
  try {
    JSON.parse(cleaned);
  } catch (e2) {
    const posMatch = (e2 as Error).message.match(/position (\d+)/);
    if (posMatch) {
      const pos = parseInt(posMatch[1]);
      context = `\nContext: ...${cleaned.slice(Math.max(0, pos - 80), pos)}>>HERE>>${cleaned.slice(pos, pos + 80)}...`;
    }
    throw new Error(
      `Failed to parse Claude response as JSON: ${(e2 as Error).message}${context}\nRaw: ${text.slice(0, 500)}`
    );
  }

  // Should not reach here, but satisfy TypeScript
  throw new Error("Failed to parse Claude response as JSON");
}

/**
 * Try to fix JSON that was truncated mid-stream by removing the last
 * incomplete value and closing all open brackets / braces.
 */
function repairTruncatedJson(text: string): string | null {
  // Strip any trailing incomplete string or value
  let trimmed = text.replace(/,\s*$/, "").replace(/,\s*"[^"]*$/, "");

  // Remove a trailing incomplete key-value pair (e.g. `"key": "unterminated...`)
  trimmed = trimmed.replace(/,?\s*"[^"]*":\s*"[^"]*$/, "");
  trimmed = trimmed.replace(/,?\s*"[^"]*":\s*$/, "");

  // Count unclosed brackets
  const opens: string[] = [];
  let inString = false;
  let escape = false;
  for (const ch of trimmed) {
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{" || ch === "[") opens.push(ch);
    if (ch === "}" || ch === "]") opens.pop();
  }

  if (opens.length === 0) return null;

  // Close in reverse order
  const closers = opens.reverse().map((c) => (c === "{" ? "}" : "]")).join("");
  return trimmed + closers;
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
  for (let len = marker.length; len >= 12; len -= 5) {
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
  // Send more text to Claude so it can see chapter start markers that appear later in the document.
  // 120K chars ≈ 30-40K tokens which fits within the context window comfortably.
  const textPreview = fullText.slice(0, 120000);

  const system = `You are a document structure analyzer. Your job is to identify chapter or section boundaries in academic/course text. You return ONLY raw JSON — no markdown fences, no explanation.`;

  const prompt = `I have extracted text from a PDF course document. Identify where each chapter or major section starts, in the exact chronological order they appear in the document.

INSTRUCTIONS:
1. FIRST check if the document has a Table of Contents (Inhoudstafel/Inhoud), Index, or outline at the beginning. If it does, use it as your primary guide to identify ALL content chapters and subchapters.
2. Look for structural markers: numbered chapters, bold headings, "Chapter X", Roman numerals, section numbers (e.g. 1.1, 1.2, 2.1), or clear topic transitions.
3. Include BOTH main chapters AND their subchapters/subsections (e.g. "Chapter 1", "1.1 Introduction", "1.2 Background", "Chapter 2", "2.1 Methods", etc.).
4. For each entry, give me its title (EXACTLY as it appears in the text, including any numbering) and a verbatim snippet from the VERY BEGINNING of that section (the first 60-80 characters, copied exactly — I will use string matching to find the position).
5. The start_text must be EXACTLY as it appears in the text, including any numbering, whitespace, or punctuation.
6. If the document has no clear chapters, identify 3-8 major topic shifts.
7. Maintain the EXACT chronological order as they appear in the document — do NOT reorder by importance.
8. Maximum 40 entries. Cover ALL chapters and subchapters — completeness is critical.
9. SKIP non-content sections: do NOT include forewords (Voorwoord), prefaces, table of contents pages themselves, appendices (Bijlagen), bibliography/references (Literatuuroverzicht/Referenties/Bronnen), index pages, glossaries, acknowledgements, or colophon. Only include actual course/study content chapters.

OUTPUT FORMAT (raw JSON array, no fences):
[{"title": "Chapter title exactly as in the text", "start_text": "exact first 60-80 chars from the text"}]

EXAMPLES of good start_text values:
- "Chapter 3: Database Normalization\\nNormalization is the proc"
- "3.1 Introduction to Machine Learning\\n\\nMachine learning is"
- "PART II: ADVANCED TOPICS\\n\\nIn this section we explore"
- "2.3.1 Gradient Descent\\n\\nGradient descent is an optimizati"

TEXT:
---
${textPreview}
---`;

  const response = await askClaude(system, prompt, 16384, model);
  const boundaries: ChapterBoundary[] = parseJsonResponse(response);

  if (!boundaries || boundaries.length === 0) {
    return [{ title: "Full Course", content: fullText }];
  }

  // Split using fuzzy matching
  const chapters: ChapterData[] = [];
  const foundPositions: { idx: number; boundary: ChapterBoundary }[] = [];
  const missedBoundaries: ChapterBoundary[] = [];

  for (const boundary of boundaries) {
    const idx = fuzzyIndexOf(fullText, boundary.start_text);
    if (idx !== -1) {
      foundPositions.push({ idx, boundary });
    } else {
      missedBoundaries.push(boundary);
    }
  }

  // Second pass: for missed boundaries, try matching just the title text
  // (PDF extraction often garbles the body text but chapter titles are more reliable)
  for (const boundary of missedBoundaries) {
    const titleIdx = fuzzyIndexOf(fullText, boundary.title);
    if (titleIdx !== -1) {
      console.log(`[detectChapters] Recovered boundary via title match: "${boundary.title}"`);
      foundPositions.push({ idx: titleIdx, boundary });
    } else {
      console.warn(`[detectChapters] Could not locate boundary in text: "${boundary.title}" (start_text: "${boundary.start_text.slice(0, 60)}...")`);
    }
  }

  if (foundPositions.length === 0 && boundaries.length > 0) {
    console.warn(`[detectChapters] All ${boundaries.length} boundaries failed fuzzy matching — falling back to full document. First boundary title: "${boundaries[0].title}", start_text: "${boundaries[0].start_text.slice(0, 80)}"`);
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

  console.log(`[detectChapters] Found ${chapters.length} chapters out of ${boundaries.length} boundaries detected by AI`);
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
- CRITICAL: List topics in CHRONOLOGICAL ORDER as they appear in the chapter text. Do NOT reorder by importance — preserve the author's original sequence.
- Cover ALL topics and subtopics discussed in the chapter. Do not skip any section or subsection.

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
- CHRONOLOGICAL ORDER: Topics must follow the exact order they appear in the source text. The first topic in the chapter should be the first in main_topics, and so on.
- Mark topics "critical" if a student would fail the exam without knowing them.
- Mark topics "important" if they're likely exam material but not make-or-break.
- Mark topics "supporting" if they provide context or depth.
- Key terms should include definitions AS USED IN THIS COURSE (not generic dictionary definitions).
- Prerequisites help students identify gaps before studying this chapter.
- Connections help students see the bigger picture.
- COMPLETENESS: Ensure every major concept, subsection, and subtopic in the chapter is represented. Missing a topic means a student might miss it during study.

Chapter: "${chapterTitle}"
---
${chapterText.slice(0, 60000)}
---`;

  const response = await askClaude(system, prompt, 16384, model);
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
${chapterText.slice(0, 60000)}
---`;

  const response = await askClaude(system, prompt, 16384, model);
  return parseJsonResponse(response);
}

// ─── On-demand Translation ──────────────────────────────────────────────────

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  nl: "Dutch",
  fr: "French",
};

/**
 * Translate a single text to a target language.
 * Uses Sonnet 4.5 for fast, cheap translation.
 */
export async function translateText(
  text: string,
  targetLang: "en" | "nl" | "fr"
): Promise<string> {
  const langName = LANGUAGE_NAMES[targetLang] || targetLang;

  const system = `You are a professional academic translator. Translate the given text accurately into ${langName}. Preserve academic terminology and nuance. Return ONLY the translated text — no quotes, no explanation, no markdown.`;

  const prompt = `Translate the following text into ${langName}:\n\n${text}`;

  const TRANSLATION_MODEL: AIModel = "claude-sonnet-4-5-20250929";
  return await askClaude(system, prompt, 4096, TRANSLATION_MODEL);
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
1. CHRONOLOGICAL ORDER: Study new chapters in the exact order they are listed above (chapter 1 first, then chapter 2, etc.). This follows the course structure and ensures prerequisites are covered before dependent material.
2. SPACED REPETITION: Review previously studied material at increasing intervals (1 day, 3 days, 7 days). Review days may mix chapters from different parts of the course — this is the ONLY exception to chronological ordering.
3. INTERLEAVING: Mix chapters on review days rather than blocking.
4. ACTIVE RECALL: Include "practice" days where the student tests themselves.
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
- The last 1-2 days should be review/practice, not new material.
- IMPORTANT: "study" days (first encounter with new material) MUST introduce chapters in the chronological order listed above. Do NOT skip ahead or reorder chapters. Only "review" days may mix chapters from different parts of the course.`;

  const response = await askClaude(system, prompt, 16384, model);
  return parseJsonResponse(response);
}
