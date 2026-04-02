/** Split into segments the speech engine can handle without truncating mid-sentence when possible. */
export function chunkForSpeech(text: string, maxLen = 320): string[] {
  const t = text.trim()
  if (!t) return []

  const chunks: string[] = []
  const sentences = t.split(/(?<=[.!?…])\s+/u)
  let buf = ''

  const flushBuf = () => {
    if (buf) {
      chunks.push(buf)
      buf = ''
    }
  }

  for (const sentence of sentences) {
    if (!sentence) continue
    if (sentence.length <= maxLen) {
      const next = buf ? `${buf} ${sentence}` : sentence
      if (next.length <= maxLen) {
        buf = next
      } else {
        flushBuf()
        buf = sentence
      }
    } else {
      flushBuf()
      for (let i = 0; i < sentence.length; i += maxLen) {
        chunks.push(sentence.slice(i, i + maxLen))
      }
    }
  }
  flushBuf()
  return chunks
}
