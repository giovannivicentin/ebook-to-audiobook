import { useCallback, useEffect, useRef, useState } from 'react'
import { chunkForSpeech } from './chunkText'
import { sortVoicesNaturalFirst } from './voiceRank'

export type LangMode = 'pt-BR' | 'en-US'

/** BCP-47 usado em cada utterance (evita o motor “adivinhar” outro idioma no texto). */
function utteranceLang(mode: LangMode): string {
  return mode === 'pt-BR' ? 'pt-BR' : 'en-US'
}

function filterVoicesByMode(list: SpeechSynthesisVoice[], mode: LangMode): SpeechSynthesisVoice[] {
  if (mode === 'pt-BR') {
    const br = list.filter((v) => {
      const L = v.lang.toLowerCase().replace('_', '-')
      return L === 'pt-br' || L.startsWith('pt-br')
    })
    if (br.length) return br
    return list.filter((v) => v.lang.toLowerCase().startsWith('pt'))
  }
  const us = list.filter((v) => {
    const L = v.lang.toLowerCase().replace('_', '-')
    return L === 'en-us' || L.startsWith('en-us')
  })
  if (us.length) return us
  return list.filter((v) => v.lang.toLowerCase().startsWith('en'))
}

/**
 * Objeto SpeechSynthesisVoice pode ficar inválido após `voiceschanged`;
 * resolve de novo a cada trecho para não cair na voz padrão (muitas vezes em inglês).
 */
function resolveVoiceForUtterance(
  pick: { name: string; lang: string } | null,
  mode: LangMode,
): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices()
  const wantLang = utteranceLang(mode)

  if (pick) {
    let v = voices.find((x) => x.name === pick.name && x.lang === pick.lang)
    if (!v) {
      v = voices.find(
        (x) =>
          x.name === pick.name &&
          (mode === 'pt-BR'
            ? x.lang.toLowerCase().startsWith('pt')
            : x.lang.toLowerCase().startsWith('en')),
      )
    }
    if (!v) v = voices.find((x) => x.name === pick.name)
    if (v) return v
  }

  const pool = filterVoicesByMode(voices, mode)
  const byLang = pool.find((x) => x.lang.toLowerCase().replace('_', '-') === wantLang.toLowerCase())
  if (byLang) return byLang
  return pool[0]
}

export function useVoices(mode: LangMode) {
  const filter = useCallback(
    (list: SpeechSynthesisVoice[]) => sortVoicesNaturalFirst(filterVoicesByMode(list, mode)),
    [mode],
  )

  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() =>
    typeof window === 'undefined' ? [] : filter(window.speechSynthesis.getVoices()),
  )

  useEffect(() => {
    const sync = () => setVoices(filter(window.speechSynthesis.getVoices()))
    sync()
    window.speechSynthesis.addEventListener('voiceschanged', sync)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', sync)
  }, [filter])

  return voices
}

type SpeechControls = {
  speak: (chunks: string[], startIndex?: number) => void
  speakFromFullText: (text: string, startIndex?: number) => void
  pause: () => void
  resume: () => void
  stop: () => void
  seekToChunk: (zeroBasedIndex: number, resumePlayback: boolean) => void
  skipChunks: (delta: number, resumePlayback: boolean) => void
}

export function useSpeechQueue(
  lang: LangMode,
  voice: SpeechSynthesisVoice | null,
  rate: number,
  pitch: number,
  onChunkIndex: (zeroBasedIndex: number, total: number) => void,
  onUtteranceStart: ((chunkIndex: number) => void) | undefined,
  onDone: () => void,
): SpeechControls {
  const onChunkIndexRef = useRef(onChunkIndex)
  const onUtteranceStartRef = useRef(onUtteranceStart)
  const onDoneRef = useRef(onDone)

  useEffect(() => {
    onChunkIndexRef.current = onChunkIndex
    onUtteranceStartRef.current = onUtteranceStart
    onDoneRef.current = onDone
  }, [onChunkIndex, onUtteranceStart, onDone])

  const stateRef = useRef({ chunks: [] as string[], index: 0 })
  const speakNextRef = useRef<() => void>(() => {})
  const sessionVoiceRef = useRef<{ name: string; lang: string } | null>(null)
  const voicePickRef = useRef<{ name: string; lang: string } | null>(null)

  useEffect(() => {
    voicePickRef.current = voice ? { name: voice.name, lang: voice.lang } : null
  }, [voice])

  useEffect(() => {
    speakNextRef.current = () => {
      const { chunks, index } = stateRef.current
      if (index >= chunks.length) {
        onDoneRef.current()
        return
      }
      onChunkIndexRef.current(index, chunks.length)
      const u = new SpeechSynthesisUtterance(chunks[index])
      const fixedLang = utteranceLang(lang)
      u.lang = fixedLang
      u.rate = rate
      u.pitch = pitch
      u.volume = 1

      const resolved = resolveVoiceForUtterance(sessionVoiceRef.current, lang)
      if (resolved) u.voice = resolved

      u.onstart = () => {
        onUtteranceStartRef.current?.(index)
      }
      u.onend = () => {
        stateRef.current.index += 1
        speakNextRef.current()
      }
      u.onerror = () => {
        stateRef.current.index += 1
        speakNextRef.current()
      }
      window.speechSynthesis.speak(u)
    }
  }, [lang, rate, pitch])

  const speak = useCallback((chunks: string[], startIndex = 0) => {
    window.speechSynthesis.cancel()
    sessionVoiceRef.current = voicePickRef.current
    const idx = Math.max(0, Math.min(startIndex, Math.max(0, chunks.length - 1)))
    stateRef.current = { chunks, index: chunks.length ? idx : 0 }
    if (chunks.length === 0) {
      onChunkIndexRef.current(0, 0)
      onDoneRef.current()
      return
    }
    speakNextRef.current()
  }, [])

  const speakFromFullText = useCallback((text: string, startIndex = 0) => {
    speak(chunkForSpeech(text), startIndex)
  }, [speak])

  const seekToChunk = useCallback((zeroBasedIndex: number, resumePlayback: boolean) => {
    const { chunks } = stateRef.current
    if (chunks.length === 0) return
    const idx = Math.max(0, Math.min(zeroBasedIndex, chunks.length - 1))
    window.speechSynthesis.cancel()
    stateRef.current = { chunks, index: idx }
    onChunkIndexRef.current(idx, chunks.length)
    if (resumePlayback) speakNextRef.current()
  }, [])

  const skipChunks = useCallback(
    (delta: number, resumePlayback: boolean) => {
      const { chunks, index } = stateRef.current
      if (chunks.length === 0) return
      seekToChunk(index + delta, resumePlayback)
    },
    [seekToChunk],
  )

  const pause = useCallback(() => {
    window.speechSynthesis.pause()
  }, [])

  const resume = useCallback(() => {
    window.speechSynthesis.resume()
  }, [])

  const stop = useCallback(() => {
    window.speechSynthesis.cancel()
    stateRef.current = { chunks: [], index: 0 }
    sessionVoiceRef.current = null
    onChunkIndexRef.current(0, 0)
    onDoneRef.current()
  }, [])

  return { speak, speakFromFullText, pause, resume, stop, seekToChunk, skipChunks }
}
