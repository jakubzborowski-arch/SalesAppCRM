import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Block } from "./contract-template";

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = { x: 56, top: 64, bottom: 64 };
const STYLE = {
  title: { size: 16, lead: 22, before: 0, after: 14 },
  heading: { size: 11.5, lead: 16, before: 12, after: 4 },
  paragraph: { size: 10.5, lead: 15, before: 0, after: 8 },
  bullet: { size: 10.5, lead: 15, before: 0, after: 3 },
} as const;
const INK = rgb(0.1, 0.11, 0.2);
/** Znaki spoza czcionki zamieniamy na najbliższe dostępne. */
const FALLBACK: Record<string, string> = { "→": "->", "←": "<-", "✓": "v", "✔": "v", "×": "x", "\t": " " };
const MUTED = rgb(0.42, 0.45, 0.55);

/** Dzieli tekst na linie mieszczące się w szerokości. */
export function wrapText(text: string, width: number, measure: (s: string) => number) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (measure(next) <= width || !line) {
      // Pojedyncze bardzo długie słowo tniemy, żeby nie wyszło poza stronę.
      if (!line && measure(word) > width) {
        let chunk = "";
        for (const ch of word) {
          if (measure(chunk + ch) > width) {
            lines.push(chunk);
            chunk = ch;
          } else chunk += ch;
        }
        line = chunk;
      } else line = next;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function loadFont(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Nie udało się wczytać czcionki (${res.status}).`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Składa PDF umowy z bloków tekstu. Czcionka z polskimi znakami z /fonts. */
export async function buildContractPdf(
  blocks: Block[],
  meta: { title: string; footer: string },
  fonts?: { regular: Uint8Array; bold: Uint8Array },
) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(meta.title);
  doc.setCreator("Lutra CRM");
  const [regularBytes, boldBytes] = fonts
    ? [fonts.regular, fonts.bold]
    : await Promise.all([loadFont("/fonts/NotoSans-Regular.ttf"), loadFont("/fonts/NotoSans-Bold.ttf")]);
  // Bez podzbioru: fontkit gubi glify przy subsetowaniu Noto Sans.
  const regular = await doc.embedFont(regularBytes, { subset: false });
  const bold = await doc.embedFont(boldBytes, { subset: false });
  const glyphs = new Set(regular.getCharacterSet());
  const safe = (text: string) =>
    [...text].map((ch) => (glyphs.has(ch.codePointAt(0)!) ? ch : (FALLBACK[ch] ?? "?"))).join("");

  const width = A4.width - MARGIN.x * 2;
  let page: PDFPage = doc.addPage([A4.width, A4.height]);
  let y = A4.height - MARGIN.top;
  const newPage = () => {
    page = doc.addPage([A4.width, A4.height]);
    y = A4.height - MARGIN.top;
  };

  for (const block of blocks) {
    const style = STYLE[block.kind];
    const font: PDFFont = block.kind === "title" || block.kind === "heading" ? bold : regular;
    const indent = block.kind === "bullet" ? 14 : 0;
    const lines = wrapText(safe(block.text), width - indent, (s) => font.widthOfTextAtSize(s, style.size));
    y -= style.before;
    // Nagłówek nie zostaje sam na dole strony.
    const keep = block.kind === "heading" ? style.lead + STYLE.paragraph.lead * 2 : style.lead;
    if (y - keep < MARGIN.bottom) newPage();
    lines.forEach((text, i) => {
      if (y - style.lead < MARGIN.bottom) newPage();
      y -= style.lead;
      if (block.kind === "bullet" && i === 0) {
        page.drawText("•", { x: MARGIN.x + 2, y, size: style.size, font: regular, color: INK });
      }
      page.drawText(text, { x: MARGIN.x + indent, y, size: style.size, font, color: INK });
    });
    y -= style.after;
  }

  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const label = safe(`${meta.footer} · strona ${i + 1} z ${pages.length}`);
    p.drawText(label, { x: MARGIN.x, y: 32, size: 8, font: regular, color: MUTED });
  });
  return doc.save();
}
