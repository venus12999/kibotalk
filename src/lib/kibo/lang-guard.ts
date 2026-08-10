import type { ConvLang } from "./types";

/**
 * Cheap script check used to drop hallucinated transcripts. The STT model
 * occasionally answers in Korean/Russian/Thai or emits mojibake even when the
 * language is pinned; those characters can never belong to the chosen
 * conversation language, so the segment is discarded instead of shown.
 */
const FOREIGN =
  /[\uAC00-\uD7AF\u1100-\u11FF\u0400-\u04FF\u0600-\u06FF\u0900-\u097F\u0E00-\u0E7F\u0590-\u05FF]/;
const CJK = /[\u4E00-\u9FFF\u3400-\u4DBF]/;
const KANA = /[\u3040-\u30FF]/;
const LATIN = /[A-Za-z]/;
/** Replacement chars and lone control bytes mean the decode went wrong. */
const GARBLED = /[\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F]/;

export function matchesLanguage(text: string, lang: ConvLang): boolean {
  const value = text.trim();
  if (!value) return false;
  if (GARBLED.test(value)) return false;
  if (FOREIGN.test(value)) return false;

  if (lang === "ja") {
    // Japanese is kana and/or kanji; pure latin output means it drifted.
    return KANA.test(value) || CJK.test(value) || !LATIN.test(value);
  }
  if (lang === "zh") {
    return (CJK.test(value) || !LATIN.test(value)) && !KANA.test(value);
  }

  // English: reject text that is mostly non-latin script.
  const letters = value.replace(/[^\p{L}]/gu, "");
  if (!letters) return true;
  const latin = letters.replace(/[^A-Za-z]/g, "").length;
  return latin / letters.length >= 0.6;
}
