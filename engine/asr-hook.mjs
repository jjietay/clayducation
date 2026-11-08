// Loaded with "node --import" when "make config --whisper large" is set. It changes one function of
// explainroo, transcribeWords, so that its word timing uses a large Whisper model (engine/tts/hear.py,
// faster-whisper) in place of its small base.en model. Everything else in explainroo stays the same.
import { register } from 'node:module';
register(new URL('./asr-loader.mjs', import.meta.url));
