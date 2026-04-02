import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  cumulativeDurationSec,
  estimateChunkDurationSec,
} from './readingTime'

export type PlaybackMode = 'idle' | 'playing' | 'paused'

/**
 * Tempo decorrido na reprodução: durante a fala usa relógio + início real do trecho (onstart).
 * Em pausa/parado, o valor segue o ponto do livro (scrub) exceto logo após “pausar no meio”.
 */
export function usePlaybackElapsed(
  chunks: string[],
  chunkIndex: number,
  rate: number,
  playback: PlaybackMode,
) {
  const chunkIndexRef = useRef(chunkIndex)
  const frozenAtPauseRef = useRef(0)

  const [nowPlaying, setNowPlaying] = useState(0)
  const [utteranceStartMs, setUtteranceStartMs] = useState<number | null>(
    null,
  )
  const [utteranceIdx, setUtteranceIdx] = useState<number | null>(null)
  const [pausedAnchorSec, setPausedAnchorSec] = useState<number | null>(null)

  useEffect(() => {
    chunkIndexRef.current = chunkIndex
  }, [chunkIndex])

  const onUtteranceStart = useCallback((index: number) => {
    setUtteranceIdx(index)
    const t = performance.now()
    setUtteranceStartMs(t)
  }, [])

  useEffect(() => {
    if (playback !== 'playing') return
    const tick = () => {
      setNowPlaying(performance.now())
    }
    tick()
    const id = window.setInterval(tick, 100)
    return () => window.clearInterval(id)
  }, [playback])

  const scrubElapsed = useMemo(
    () => cumulativeDurationSec(chunks, chunkIndex, rate),
    [chunks, chunkIndex, rate],
  )

  const playingElapsed = useMemo(() => {
    if (playback !== 'playing') return scrubElapsed
    const idx = utteranceIdx ?? chunkIndex
    const base = cumulativeDurationSec(chunks, idx, rate)
    if (utteranceStartMs == null) return base
    const dur = estimateChunkDurationSec(chunks[idx] ?? '', rate)
    return base + Math.min(dur, (nowPlaying - utteranceStartMs) / 1000)
  }, [
    playback,
    scrubElapsed,
    chunks,
    chunkIndex,
    rate,
    utteranceIdx,
    utteranceStartMs,
    nowPlaying,
  ])

  const elapsedSec =
    playback === 'idle'
      ? scrubElapsed
      : playback === 'paused'
        ? (pausedAnchorSec ?? scrubElapsed)
        : playingElapsed

  const snapshotForPause = useCallback(() => {
    const idx = utteranceIdx ?? chunkIndexRef.current
    const base = cumulativeDurationSec(chunks, idx, rate)
    let x = base
    if (utteranceStartMs != null) {
      const dur = estimateChunkDurationSec(chunks[idx] ?? '', rate)
      x = base + Math.min(dur, (performance.now() - utteranceStartMs) / 1000)
    }
    frozenAtPauseRef.current = x
    setPausedAnchorSec(x)
  }, [chunks, rate, utteranceIdx, utteranceStartMs])

  const prepareResume = useCallback(() => {
    const idx = utteranceIdx ?? chunkIndexRef.current
    const base = cumulativeDurationSec(chunks, idx, rate)
    const frozen = frozenAtPauseRef.current
    const inChunk = Math.max(0, frozen - base)
    setUtteranceStartMs(performance.now() - inChunk * 1000)
  }, [chunks, rate, utteranceIdx])

  const resetClock = useCallback(() => {
    setUtteranceStartMs(null)
    setUtteranceIdx(null)
    frozenAtPauseRef.current = 0
    setPausedAnchorSec(null)
  }, [])

  const clearPauseAnchor = useCallback(() => {
    setPausedAnchorSec(null)
  }, [])

  return {
    elapsedSec,
    onUtteranceStart,
    snapshotForPause,
    prepareResume,
    resetClock,
    clearPauseAnchor,
  }
}
