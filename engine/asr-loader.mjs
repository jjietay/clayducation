// Module hook for asr-hook.mjs: explainroo's src/models.js becomes a module that exports everything
// of the original, with transcribeWords from engine/asr-large.mjs.
const LARGE = new URL('./asr-large.mjs', import.meta.url).href;
export async function load(url, context, next) {
  if (url.endsWith('/src/models.js') && !url.includes('orig=1') && /explainroo/.test(url)) {
    const orig = `${url}?orig=1`;
    return { format: 'module', shortCircuit: true,
      source: `export * from ${JSON.stringify(orig)};\nexport { transcribeWords } from ${JSON.stringify(LARGE)};\n` };
  }
  return next(url, context);
}
