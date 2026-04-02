/** Prefer system voices that tend to sound clearer or more “premium” (names vary by OS). */
export function sortVoicesNaturalFirst(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  return [...voices].sort((a, b) => scoreVoice(b) - scoreVoice(a))
}

function scoreVoice(v: SpeechSynthesisVoice): number {
  const n = v.name.toLowerCase()
  let s = 0
  if (/enhanced|premium|neural|natural|wavenet|google|microsoft|azure/.test(n)) s += 24
  if (/luciana|fernanda|francisca|maria|joana|amanda|helena|camila|ines/.test(n)) s += 8
  if (/samantha|karen|moira|fiona|aaron|daniel|tom/.test(n)) s += 4
  if (v.localService === false) s += 6
  if (v.default) s += 2
  return s
}
