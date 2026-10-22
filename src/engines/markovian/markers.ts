// Marker protocol (Markovian spec section 3). Canonical markers are
// [STATE_CHECKPOINT] (followed by the state block) and [TASK_COMPLETE].
// Legacy forms are accepted on input and always stripped from display text.

export interface ParsedMarkers {
  state?: string;
  done: boolean;
  cleaned: string;
}

const STATE_TAILS = [/\[STATE_CHECKPOINT\]\s*([\s\S]*)$/, /@@@STATE@@@\s*([\s\S]*)$/, /<CARRYOVER>([\s\S]*?)<\/CARRYOVER>/];
const FINAL = [/\[TASK_COMPLETE\]/, /@@@FINAL@@@/, /(?<![_\w])\[FINAL\]/, /<DONE\s*\/?>/];

export function parseMarkers(raw: string): ParsedMarkers {
  let state: string | undefined;
  for (const re of STATE_TAILS) {
    const m = raw.match(re);
    if (m) {
      state = m[1].replace(/\[TASK_COMPLETE\]/g, "").trim();
      break;
    }
  }
  return { state, done: FINAL.some((re) => re.test(raw)), cleaned: cleanMarkers(raw) };
}

export function cleanMarkers(raw: string): string {
  return raw
    .replace(/<CARRYOVER>[\s\S]*?<\/CARRYOVER>/g, "")
    .replace(/\[STATE_CHECKPOINT\][\s\S]*$/, "")
    .replace(/@@@STATE@@@[\s\S]*$/, "")
    .replace(/\[TASK_COMPLETE\]|@@@FINAL@@@|<DONE\s*\/?>/g, "")
    .replace(/\n\[FINAL\][\s\S]*$/, "")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
