// Real tokens. Every chip /v3 shows (chapter 04's rows, and the chips the stage-2B effects of chapters 03, 07, 09, 13, 14 and 16 move) is a token of the o200k_base
// vocabulary (GPT-4o), cut by tiktoken and committed in src/data/v3-tokens.json by web/scripts/v3-tokens.py: the page never cuts text into tokens by a heuristic of its own.
// The only heuristic left is specimen A of chapter 08 (the free-typing box), which is labelled ILUSTRATIVO (specimens.ts `tokenize`).
// This file is pure (no window, no document at module scope): the server renders chapter 04's chips with it, the effects read the same data from the page.

/** One token: its text exactly as the vocabulary has it (a word's leading space included), then its id. The pieces of one string join back into the string. */
export type Piece = [text: string, ...ids: number[]];
export type TokenMap = Record<string, Piece[]>;
export interface TokenFile { encoding: string; library: string; es: TokenMap; en: TokenMap }

/** A token's leading space is shown as «·» (a chip cannot show a space). */
export const show = (text: string) => (text.startsWith(' ') ? '·' + text.slice(1) : text);

/** The word each piece belongs to (the index in the text split on whitespace): a piece that starts with a space, or the first piece, opens a new word. Punctuation sticks to the word before it. */
export function wordsOf(pieces: readonly Piece[]): number[] {
  let w = -1;
  return pieces.map(([t], i) => { if (i === 0 || t.startsWith(' ')) w++; return w; });
}

/** The pieces of `text`. Fail closed: a string that is not in the file is an error, never a guess. */
export function piecesOf(map: TokenMap, text: string): Piece[] {
  const p = Object.prototype.hasOwnProperty.call(map, text) ? map[text] : undefined;
  if (!p || !p.length) throw new Error(`v3 tokens: no real tokens for «${text.slice(0, 48)}». Run: uv run --with tiktoken python3 web/scripts/v3-tokens.py`);
  if (p.map((x) => x[0]).join('') !== text) throw new Error(`v3 tokens: the pieces of «${text.slice(0, 48)}» do not join back into it (the string changed: regenerate the file)`);
  return p;
}

/** The token map the page embeds for the visitor's language (<script type="application/json" id="v3-tokens">). Client side only. */
export function tokensFromPage(): TokenMap {
  const e = document.getElementById('v3-tokens');
  if (!e || !e.textContent) throw new Error('v3 tokens: the page ships no #v3-tokens data');
  return JSON.parse(e.textContent) as TokenMap;
}
