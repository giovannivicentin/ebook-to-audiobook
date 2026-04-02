/** Rough duration at rate 1.0; scales inversely with speech `rate`. */
const CHARS_PER_SEC_BASE = 13.5

export function estimateChunkDurationSec(chunk: string, rate: number): number {
  const r = Math.max(0.5, rate)
  return chunk.length / (CHARS_PER_SEC_BASE * r)
}

export function cumulativeDurationSec(
  chunks: string[],
  upToExclusive: number,
  rate: number,
): number {
  let t = 0
  const n = Math.min(upToExclusive, chunks.length)
  for (let i = 0; i < n; i++) {
    t += estimateChunkDurationSec(chunks[i], rate)
  }
  return t
}

export function totalDurationSec(chunks: string[], rate: number): number {
  return cumulativeDurationSec(chunks, chunks.length, rate)
}

export function formatTimeMmSs(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00'
  const s = Math.floor(totalSeconds)
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}
