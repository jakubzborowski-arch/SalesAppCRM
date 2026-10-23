/** Najdłuższy transkrypt, jaki przyjmujemy (ok. 3 godziny rozmowy). */
export const MAX_TRANSCRIPT_CHARS = 200_000;
/** Pliki, które czytamy jako tekst: eksport ze Spinach, Zoom, Meet, Teams albo zwykły tekst. */
export const TRANSCRIPT_FILE_ACCEPT = ".txt,.md,.vtt,.srt,text/plain,text/markdown,text/vtt";

const TIMING = /^\s*(?:\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3}\s*-->\s*(?:\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3}/;

type Cue = { speaker: string; text: string };

/** Napisy WebVTT / SRT (np. z Zooma albo Teams) → „Mówca: tekst”, jedna wypowiedź na linię. */
function subtitlesToDialogue(text: string) {
  const out: Cue[] = [];
  for (const block of text.split(/\n\s*\n/)) {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (!lines.length || /^(WEBVTT|NOTE|STYLE|REGION)\b/.test(lines[0])) continue;
    const timing = lines.findIndex((line) => TIMING.test(line));
    // Bez znacznika czasu to nie jest napis — zostawiamy blok jak jest.
    const body = timing >= 0 ? lines.slice(timing + 1) : lines;
    let speaker = out[out.length - 1]?.speaker ?? "";
    const parts: string[] = [];
    for (const line of body) {
      let content = line;
      const voice = content.match(/^<v(?:\.[^\s>]+)?\s+([^>]+)>([\s\S]*)$/);
      if (voice) {
        speaker = voice[1].trim();
        content = voice[2];
      }
      content = content.replace(/<\/?[^>]+>/g, "").trim();
      const named = voice ? null : content.match(/^([^:\d][^:]{1,40}):\s+(.+)$/);
      if (named) {
        speaker = named[1].trim();
        content = named[2];
      }
      if (content) parts.push(content);
    }
    if (!parts.length) continue;
    const said = parts.join(" ");
    const last = out[out.length - 1];
    // Kolejne napisy tej samej osoby to jedna wypowiedź. Bez mówcy każdy napis zostaje osobną linią.
    if (last && speaker && last.speaker === speaker) last.text = `${last.text} ${said}`;
    else out.push({ speaker, text: said });
  }
  return out.map((cue) => (cue.speaker ? `${cue.speaker}: ${cue.text}` : cue.text)).join("\n");
}

function looksLikeSubtitles(text: string, fileName: string) {
  if (/\.(vtt|srt)$/i.test(fileName)) return true;
  if (/^\s*WEBVTT/.test(text)) return true;
  return text.split("\n").filter((line) => TIMING.test(line)).length >= 3;
}

/** Porządkuje wklejony albo wczytany transkrypt: napisy na dialog, bez pustych linii i spacji na końcach. */
export function cleanTranscript(raw: string, fileName = "") {
  let text = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  if (looksLikeSubtitles(text, fileName)) text = subtitlesToDialogue(text);
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function wordCount(text: string) {
  return text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

/** „ok. 1 240 słów” — do listy transkryptów. */
export function wordsLabel(text: string) {
  const words = wordCount(text);
  const n = words.toLocaleString("pl-PL");
  if (words === 1) return "1 słowo";
  const last = words % 10;
  const lastTwo = words % 100;
  const few = last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14);
  return `${n} ${few ? "słowa" : "słów"}`;
}
