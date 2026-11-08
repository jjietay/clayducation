// How the voice check compares what Whisper heard with the script. make.mjs and the selftest
// both import this, so the selftest can plant a bad take with no voice model.
// Number words, so Whisper's digits ("-1", "3") compare with the script's words.
const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const numWords = (n) => (n < 20 ? NUM[n] : n < 100 ? TENS[Math.floor(n / 10)] + (n % 10 ? NUM[n % 10] : '') : String(n));
// Letters only, numbers spelt out, "minus" and "negative" counted as one word: two texts
// that read the same compare equal however Whisper spaces or punctuates them.
export const sayable = (text) => text.toLowerCase()
  .replace(/(^|[^\d.])-(?=\d)/g, '$1 negative ').replace(/\bminus\b/g, 'negative')
  .replace(/\d+(\.\d+)?/g, (m) => m.includes('.') ? m.split('.').map((x) => [...x].map((d) => NUM[d]).join('')).join('point') : numWords(+m))
  .replace(/[^a-z]/g, '');
export function editDistance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

// A word that the voice added or garbled. The letter distance of a whole part missed "We write
// them XTP of omega i given X" for "We write them p of omega i, given x" (2 letters), and the user
// heard "xtp" three times in video 1. So the heard letters are lined up with the script letters,
// and a heard word fails when 2 or more of its letters, and 60 % or more of them, have no match.
// Whisper's number pieces (".75"), and words that sound the same ("pair" for "pear", "mail" for
// "male"), keep most of their letters matched, so they pass.
// Greek letters that Whisper spells as the word that sounds the same.
const SOUNDS = { row: 'rho', pie: 'pi', new: 'nu', mew: 'mu', sigh: 'xi', fee: 'phi', kai: 'chi' };
// Lines up the script letters with the heard letters, and returns which letters of each side
// found a match.
function lineUp(scriptText, heardWords) {
  const words = new Set(scriptText.split(/\s+/).map(sayable));
  // A sound-alike counts as its Greek letter only when the script has that letter and not the word.
  const said = heardWords.map((h) => { const w = h.toLowerCase().replace(/[^a-z]/g, ''); return SOUNDS[w] && !words.has(w) && words.has(SOUNDS[w]) ? SOUNDS[w] : h; });
  const sw = scriptText.split(/\s+/), aOwner = [], A = [], bOwner = [], B = [];
  sw.forEach((w, k) => { for (const c of sayable(w)) { A.push(c); aOwner.push(k); } });
  said.forEach((h, k) => { for (const c of sayable(h)) { B.push(c); bOwner.push(k); } });
  const n = A.length, m = B.length, D = Array.from({ length: n + 1 }, (_, i) => new Int32Array(m + 1).fill(0).map((_, j) => (i ? (j ? 0 : i) : j)));
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) D[i][j] = Math.min(D[i - 1][j] + 1, D[i][j - 1] + 1, D[i - 1][j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1));
  const aHit = new Uint8Array(n), bHit = new Uint8Array(m);
  for (let i = n, j = m; i > 0 || j > 0;) {
    if (i && j && D[i][j] === D[i - 1][j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1)) { if (A[i - 1] === B[j - 1]) aHit[i - 1] = bHit[j - 1] = 1; i--; j--; }
    else if (j && D[i][j] === D[i][j - 1] + 1) j--;
    else i--;
  }
  const count = (owner, hit, len) => { const c = Array.from({ length: len }, () => [0, 0]); owner.forEach((k, x) => { c[k][1]++; if (!hit[x]) c[k][0]++; }); return c; };
  return { sw, a: count(aOwner, aHit, sw.length), b: count(bOwner, bHit, heardWords.length) };
}
// A word that the voice added or garbled. The letter distance of a whole part missed "We write
// them XTP of omega i given X" for "We write them p of omega i, given x" (2 letters), and the user
// heard "xtp" three times in video 1. A heard word fails when 2 or more of its letters, and 60 % or
// more of them, have no match. Whisper's number pieces (".75"), and words that sound the same
// ("pair" for "pear", "mail" for "male"), keep most of their letters matched, so they pass.
export function extraWords(scriptText, heardWords) {
  const { b } = lineUp(scriptText, heardWords);
  // A word with digits is a number, which the letter distance of the whole part already checks;
  // Whisper also cuts numbers into pieces (".14"), which do not line up word by word.
  return heardWords.filter((h, k) => !/\d/.test(h) && b[k][0] >= 2 && b[k][0] >= 0.6 * b[k][1]);
}
// A letter of a spelt-out name that the voice dropped. In video 2 "P C A removes" came out as
// "PC removes" (the user heard "PC, it removes"), a distance of one letter. Each spoken letter
// carries a third of the name, so a missing one is a bad take. Longer missing words are left to
// the letter distance, because Whisper often drops a small word that the voice did say.
export function missingLetters(scriptText, heardWords) {
  const { sw, a } = lineUp(scriptText, heardWords);
  return sw.filter((w, k) => /^[A-Z][.,;:!?]*$/.test(w) && a[k][1] && a[k][0] === a[k][1] && (sw[k - 1]?.match(/^[A-Z][.,;:!?]*$/) || sw[k + 1]?.match(/^[A-Z][.,;:!?]*$/)));
}

// A {shown|spoken} with a second bar: the parser splits at the first bar, so in video 1
// {p(ω_i|x)|p of omega i, given x} spoke "x)|p of omega i, given x" ("XTP") and showed "p(ω_i".
// Returns each such brace, so make voice can stop before any voice is made.
export const twoBars = (script) => [...script.matchAll(/\{[^{}]*\|[^{}]*\|[^{}]*\}/g)].map((m) => m[0]);
