import PDFDocument from "pdfkit";

// ─── Types (mirroring ai-pipeline.ts) ────────────────────────────────────────

interface KeyTerm {
  term: string;
  definition: string;
}

interface MainTopic {
  topic: string;
  explanation: string;
  key_terms?: (KeyTerm | string)[];
  importance?: "critical" | "important" | "supporting";
}

interface SideTopic {
  topic: string;
  explanation: string;
}

export interface ChapterPdfData {
  title: string;
  sort_order: number;
  summary_main: MainTopic[] | null;
  summary_side: SideTopic[] | null;
}

// ─── Colors ──────────────────────────────────────────────────────────────────

const YELLOW_BG: [number, number, number] = [255, 251, 235]; // warm yellow bg
const YELLOW_BORDER: [number, number, number] = [250, 204, 21]; // yellow-400
const GREEN_BG: [number, number, number] = [240, 253, 244]; // green bg
const GREEN_BORDER: [number, number, number] = [74, 222, 128]; // green-400
const KEY_TERM_BG: [number, number, number] = [254, 240, 138]; // yellow-200

const COLOR_DARK: [number, number, number] = [31, 41, 55]; // gray-800
const COLOR_MUTED: [number, number, number] = [75, 85, 99]; // gray-600
const COLOR_YELLOW_TITLE: [number, number, number] = [161, 98, 7]; // yellow-700
const COLOR_GREEN_TITLE: [number, number, number] = [21, 128, 61]; // green-700

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PAGE_MARGIN = 50;
const CONTENT_WIDTH = 595.28 - PAGE_MARGIN * 2; // A4 width minus margins

function ensureSpace(doc: PDFKit.PDFDocument, needed: number) {
  if (doc.y + needed > doc.page.height - PAGE_MARGIN) {
    doc.addPage();
  }
}

function drawColorBlock(
  doc: PDFKit.PDFDocument,
  bgColor: [number, number, number],
  borderColor: [number, number, number],
  startY: number,
  height: number
) {
  const x = PAGE_MARGIN - 8;
  const width = CONTENT_WIDTH + 16;

  // Background
  doc
    .save()
    .roundedRect(x, startY - 4, width, height + 8, 4)
    .fill(bgColor)
    .restore();

  // Left border
  doc
    .save()
    .roundedRect(x, startY - 4, 4, height + 8, 2)
    .fill(borderColor)
    .restore();
}

// ─── Main Generator ──────────────────────────────────────────────────────────

/**
 * Generate a highlighted study summary PDF for a course.
 * Returns a Buffer containing the PDF data.
 *
 * Layout:
 *  - Title page with course name
 *  - For each chapter:
 *    - Chapter heading
 *    - Main topics (yellow highlight): topic name, explanation, key terms
 *    - Side topics (green highlight): topic name, explanation
 */
export function generateHighlightedPdf(
  courseTitle: string,
  chapters: ChapterPdfData[]
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    const doc = new PDFDocument({
      size: "A4",
      margins: {
        top: PAGE_MARGIN,
        bottom: PAGE_MARGIN,
        left: PAGE_MARGIN,
        right: PAGE_MARGIN,
      },
      info: {
        Title: `${courseTitle} — Study Summary`,
        Author: "StudyFlow",
        Subject: "Highlighted study summary with main and side topics",
      },
      bufferPages: true,
    });

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // ── Title page ──────────────────────────────────────────────────────

    doc.moveDown(8);
    doc
      .fontSize(28)
      .fillColor([79, 70, 229]) // indigo-600
      .text("StudyFlow", { align: "center" });
    doc.moveDown(0.5);
    doc
      .fontSize(22)
      .fillColor(COLOR_DARK)
      .text(courseTitle, { align: "center" });
    doc.moveDown(1);
    doc
      .fontSize(12)
      .fillColor(COLOR_MUTED)
      .text("Highlighted Study Summary", { align: "center" });

    // Legend
    doc.moveDown(3);
    const legendX = PAGE_MARGIN + 120;

    doc
      .save()
      .roundedRect(legendX, doc.y, 14, 14, 2)
      .fill(YELLOW_BORDER)
      .restore();
    doc
      .fontSize(11)
      .fillColor(COLOR_DARK)
      .text("Main Topics (hoofdzaken)", legendX + 22, doc.y - 11);
    doc.moveDown(0.6);

    doc
      .save()
      .roundedRect(legendX, doc.y, 14, 14, 2)
      .fill(GREEN_BORDER)
      .restore();
    doc
      .fontSize(11)
      .fillColor(COLOR_DARK)
      .text("Side Topics (bijzaken)", legendX + 22, doc.y - 11);
    doc.moveDown(0.6);

    doc
      .save()
      .roundedRect(legendX, doc.y, 14, 14, 2)
      .fill(KEY_TERM_BG)
      .restore();
    doc
      .fontSize(11)
      .fillColor(COLOR_DARK)
      .text("Key Terms", legendX + 22, doc.y - 11);

    // ── Chapters ────────────────────────────────────────────────────────

    const sorted = [...chapters].sort((a, b) => a.sort_order - b.sort_order);

    for (const chapter of sorted) {
      doc.addPage();

      // Chapter title
      doc
        .fontSize(18)
        .fillColor(COLOR_DARK)
        .text(`${chapter.sort_order + 1}. ${chapter.title}`, {
          underline: true,
        });
      doc.moveDown(1);

      // ── Main Topics ─────────────────────────────────────────────────
      if (chapter.summary_main && chapter.summary_main.length > 0) {
        doc
          .fontSize(14)
          .fillColor(COLOR_YELLOW_TITLE)
          .text("Main Topics");
        doc.moveDown(0.5);

        for (const topic of chapter.summary_main) {
          // Estimate height needed for this topic block
          doc.fontSize(10);
          const explanationHeight =
            doc.heightOfString(topic.explanation, {
              width: CONTENT_WIDTH - 20,
            });
          const topicNameHeight = 16;
          const keyTermsHeight =
            topic.key_terms && topic.key_terms.length > 0 ? 30 : 0;
          const importanceHeight = topic.importance ? 14 : 0;
          const blockHeight =
            topicNameHeight +
            explanationHeight +
            keyTermsHeight +
            importanceHeight +
            20;

          ensureSpace(doc, blockHeight + 10);

          const blockStartY = doc.y;

          // Draw background (we'll adjust height after rendering text)
          const savedY = doc.y;

          // Topic name (bold)
          doc
            .fontSize(12)
            .fillColor(COLOR_DARK)
            .font("Helvetica-Bold")
            .text(topic.topic, PAGE_MARGIN + 8, savedY + 4, {
              width: CONTENT_WIDTH - 16,
            });

          // Importance badge
          if (topic.importance) {
            const badge =
              topic.importance === "critical"
                ? "[CRITICAL]"
                : topic.importance === "important"
                  ? "[IMPORTANT]"
                  : "[SUPPORTING]";
            doc
              .fontSize(8)
              .fillColor(COLOR_MUTED)
              .font("Helvetica")
              .text(badge, { width: CONTENT_WIDTH - 16 });
          }

          doc.moveDown(0.2);

          // Explanation
          doc
            .fontSize(10)
            .fillColor(COLOR_MUTED)
            .font("Helvetica")
            .text(topic.explanation, PAGE_MARGIN + 8, doc.y, {
              width: CONTENT_WIDTH - 16,
            });

          // Key terms
          if (topic.key_terms && topic.key_terms.length > 0) {
            doc.moveDown(0.4);
            doc
              .fontSize(9)
              .fillColor(COLOR_DARK)
              .font("Helvetica-Bold")
              .text("Key terms: ", PAGE_MARGIN + 8, doc.y, {
                continued: true,
                width: CONTENT_WIDTH - 16,
              });

            const termsText = topic.key_terms
              .map((t) => {
                if (typeof t === "string") return t;
                return t.definition
                  ? `${t.term} (${t.definition})`
                  : t.term;
              })
              .join(" | ");

            doc
              .font("Helvetica")
              .fontSize(9)
              .fillColor(COLOR_MUTED)
              .text(termsText, { width: CONTENT_WIDTH - 16 });
          }

          const blockEndY = doc.y + 4;

          // Now draw the background block behind the text
          drawColorBlock(
            doc,
            YELLOW_BG,
            YELLOW_BORDER,
            blockStartY,
            blockEndY - blockStartY
          );

          // Re-render text on top of the background
          doc.y = savedY;

          // Topic name (bold)
          doc
            .fontSize(12)
            .fillColor(COLOR_DARK)
            .font("Helvetica-Bold")
            .text(topic.topic, PAGE_MARGIN + 8, savedY + 4, {
              width: CONTENT_WIDTH - 16,
            });

          if (topic.importance) {
            const badge =
              topic.importance === "critical"
                ? "[CRITICAL]"
                : topic.importance === "important"
                  ? "[IMPORTANT]"
                  : "[SUPPORTING]";
            doc
              .fontSize(8)
              .fillColor(COLOR_MUTED)
              .font("Helvetica")
              .text(badge, { width: CONTENT_WIDTH - 16 });
          }

          doc.moveDown(0.2);

          doc
            .fontSize(10)
            .fillColor(COLOR_MUTED)
            .font("Helvetica")
            .text(topic.explanation, PAGE_MARGIN + 8, doc.y, {
              width: CONTENT_WIDTH - 16,
            });

          if (topic.key_terms && topic.key_terms.length > 0) {
            doc.moveDown(0.4);
            doc
              .fontSize(9)
              .fillColor(COLOR_DARK)
              .font("Helvetica-Bold")
              .text("Key terms: ", PAGE_MARGIN + 8, doc.y, {
                continued: true,
                width: CONTENT_WIDTH - 16,
              });

            const termsText = topic.key_terms
              .map((t) => {
                if (typeof t === "string") return t;
                return t.definition
                  ? `${t.term} (${t.definition})`
                  : t.term;
              })
              .join(" | ");

            doc
              .font("Helvetica")
              .fontSize(9)
              .fillColor(COLOR_MUTED)
              .text(termsText, { width: CONTENT_WIDTH - 16 });
          }

          doc.y = blockEndY;
          doc.moveDown(0.6);
        }
      }

      // ── Side Topics ─────────────────────────────────────────────────
      if (chapter.summary_side && chapter.summary_side.length > 0) {
        doc.moveDown(0.5);
        doc
          .fontSize(14)
          .fillColor(COLOR_GREEN_TITLE)
          .text("Side Topics");
        doc.moveDown(0.5);

        for (const topic of chapter.summary_side) {
          doc.fontSize(10);
          const explanationHeight =
            doc.heightOfString(topic.explanation, {
              width: CONTENT_WIDTH - 20,
            });
          const blockHeight = 16 + explanationHeight + 20;

          ensureSpace(doc, blockHeight + 10);

          const blockStartY = doc.y;
          const savedY = doc.y;

          // Topic name (bold)
          doc
            .fontSize(12)
            .fillColor(COLOR_DARK)
            .font("Helvetica-Bold")
            .text(topic.topic, PAGE_MARGIN + 8, savedY + 4, {
              width: CONTENT_WIDTH - 16,
            });

          doc.moveDown(0.2);

          // Explanation
          doc
            .fontSize(10)
            .fillColor(COLOR_MUTED)
            .font("Helvetica")
            .text(topic.explanation, PAGE_MARGIN + 8, doc.y, {
              width: CONTENT_WIDTH - 16,
            });

          const blockEndY = doc.y + 4;

          // Draw background behind text
          drawColorBlock(
            doc,
            GREEN_BG,
            GREEN_BORDER,
            blockStartY,
            blockEndY - blockStartY
          );

          // Re-render text on top
          doc.y = savedY;

          doc
            .fontSize(12)
            .fillColor(COLOR_DARK)
            .font("Helvetica-Bold")
            .text(topic.topic, PAGE_MARGIN + 8, savedY + 4, {
              width: CONTENT_WIDTH - 16,
            });

          doc.moveDown(0.2);

          doc
            .fontSize(10)
            .fillColor(COLOR_MUTED)
            .font("Helvetica")
            .text(topic.explanation, PAGE_MARGIN + 8, doc.y, {
              width: CONTENT_WIDTH - 16,
            });

          doc.y = blockEndY;
          doc.moveDown(0.6);
        }
      }

      // No summaries at all
      if (
        (!chapter.summary_main || chapter.summary_main.length === 0) &&
        (!chapter.summary_side || chapter.summary_side.length === 0)
      ) {
        doc
          .fontSize(11)
          .fillColor(COLOR_MUTED)
          .font("Helvetica-Oblique")
          .text("This chapter has not been summarized yet.", {
            align: "center",
          });
        doc.font("Helvetica");
      }
    }

    // ── Footer on every page ────────────────────────────────────────────
    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      doc
        .fontSize(8)
        .fillColor([156, 163, 175]) // gray-400
        .text(
          `StudyFlow — ${courseTitle} | Page ${i + 1} of ${pageCount}`,
          PAGE_MARGIN,
          doc.page.height - 30,
          { align: "center", width: CONTENT_WIDTH }
        );
    }

    doc.end();
  });
}
