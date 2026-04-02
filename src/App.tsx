import { useCallback, useEffect, useMemo, useState } from 'react'
import { extractTextFromPdf } from './lib/extractPdf'
import { extractTextFromEpub } from './lib/extractEpub'
import { chunkForSpeech } from './lib/chunkText'
import {
  cumulativeDurationSec,
  formatTimeMmSs,
  totalDurationSec,
} from './lib/readingTime'
import { type LangMode, useSpeechQueue, useVoices } from './lib/useSpeech'
import './App.css'

type LoadState = 'idle' | 'loading' | 'ready' | 'error'

const LANG_OPTIONS: { value: LangMode; label: string }[] = [
  { value: 'pt-BR', label: 'Português (Brasil)' },
  { value: 'en-US', label: 'English (US)' },
]

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

export default function App() {
  const [loadState, setLoadState] = useState<LoadState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [lang, setLang] = useState<LangMode>('pt-BR')
  const [rate, setRate] = useState(0.95)
  const [pitch, setPitch] = useState(1)
  const [voiceIndex, setVoiceIndex] = useState(0)
  const [chunkIndex, setChunkIndex] = useState(0)
  const [playback, setPlayback] = useState<'idle' | 'playing' | 'paused'>('idle')

  const chunks = useMemo(() => chunkForSpeech(text), [text])
  const totalChunks = chunks.length

  const voices = useVoices(lang)
  const selectedVoice = voices[voiceIndex] ?? null
  const hasMicrosoftFranciscaOrAntonio = useMemo(
    () =>
      voices.some((v) => {
        const name = v.name.toLowerCase()
        return name.includes('francisca') || name.includes('antonio')
      }),
    [voices],
  )

  useEffect(() => {
    setVoiceIndex(0)
  }, [lang, voices.length])

  useEffect(() => {
    setChunkIndex(0)
  }, [text])

  const onChunkIndex = useCallback((zeroBased: number, total: number) => {
    setChunkIndex(zeroBased)
    if (total === 0) setChunkIndex(0)
  }, [])

  const onDone = useCallback(() => {
    setPlayback('idle')
    setChunkIndex(0)
  }, [])

  const { speak, pause, resume, stop, seekToChunk, skipChunks } = useSpeechQueue(
    lang,
    selectedVoice,
    rate,
    pitch,
    onChunkIndex,
    onDone,
  )

  const preview = useMemo(() => {
    if (text.length <= 4000) return text
    return `${text.slice(0, 4000)}…`
  }, [text])

  const elapsedApprox = useMemo(
    () => cumulativeDurationSec(chunks, chunkIndex, rate),
    [chunks, chunkIndex, rate],
  )

  const totalApprox = useMemo(() => totalDurationSec(chunks, rate), [chunks, rate])

  const processFile = async (file: File) => {
    const lower = file.name.toLowerCase()
    setError(null)
    setFileName(file.name)
    setLoadState('loading')
    setText('')
    stop()
    setPlayback('idle')
    setChunkIndex(0)

    try {
      let extracted = ''
      if (lower.endsWith('.pdf')) {
        extracted = await extractTextFromPdf(file)
      } else if (lower.endsWith('.epub')) {
        extracted = await extractTextFromEpub(file)
      } else {
        throw new Error('Use um arquivo .pdf ou .epub.')
      }

      if (!extracted.trim()) {
        setLoadState('error')
        setError(
          'Não foi possível extrair texto. PDFs escaneados (só imagem) precisam de OCR; este app usa só o texto embutido no arquivo.',
        )
        return
      }

      setText(extracted)
      setLoadState('ready')
    } catch (e) {
      setLoadState('error')
      setError(e instanceof Error ? e.message : 'Falha ao ler o arquivo.')
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) void processFile(f)
  }

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) void processFile(f)
    e.target.value = ''
  }

  const resumePlayback = playback === 'playing' || playback === 'paused'

  const handleSeekSlider = (next: number) => {
    const i = clamp(Math.round(next), 0, Math.max(0, totalChunks - 1))
    if (resumePlayback) {
      seekToChunk(i, true)
    } else {
      setChunkIndex(i)
    }
  }

  const handleSkip = (delta: number) => {
    if (totalChunks === 0) return
    const next = clamp(chunkIndex + delta, 0, totalChunks - 1)
    if (resumePlayback) {
      skipChunks(delta, true)
    } else {
      setChunkIndex(next)
    }
  }

  const handlePlay = () => {
    if (!text.trim() || totalChunks === 0) return
    setPlayback('playing')
    speak(chunks, chunkIndex)
  }

  const handlePause = () => {
    pause()
    setPlayback('paused')
  }

  const handleResume = () => {
    resume()
    setPlayback('playing')
  }

  const handleStop = () => {
    stop()
    setPlayback('idle')
    setChunkIndex(0)
  }

  const progressPct =
    totalChunks > 0 ? Math.round(((chunkIndex + 1) / totalChunks) * 100) : 0

  const showTransport = totalChunks > 0

  return (
    <div className="app">
      <header className="header">
        <h1>Ebook → áudio</h1>
        <p className="lede">
          Envie um PDF ou EPUB e ouça com a voz do seu navegador — gratuito, sem conta e sem
          servidor (tudo roda no seu computador).
        </p>
      </header>

      <section
        className="dropzone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        <input
          type="file"
          accept=".pdf,.epub,application/pdf,application/epub+zip"
          onChange={onFileInput}
          className="file-input"
          id="file"
        />
        <label htmlFor="file" className="drop-label">
          <span className="drop-title">Arraste um arquivo ou clique para escolher</span>
          <span className="drop-hint">.pdf ou .epub</span>
        </label>
      </section>

      {fileName && (
        <p className="file-meta">
          Arquivo: <strong>{fileName}</strong>
          {loadState === 'loading' && ' — extraindo texto…'}
        </p>
      )}

      {error && <div className="banner error">{error}</div>}

      {loadState === 'ready' && text && (
        <>
          <section className="controls">
            <div className="row">
              <label htmlFor="lang">Idioma da leitura</label>
              <select
                id="lang"
                value={lang}
                onChange={(e) => setLang(e.target.value as LangMode)}
              >
                {LANG_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="row">
              <label htmlFor="voice">Voz (prioridade: mais naturais / premium no topo)</label>
              <select
                id="voice"
                value={voiceIndex}
                onChange={(e) => setVoiceIndex(Number(e.target.value))}
                disabled={voices.length === 0}
              >
                {voices.length === 0 ? (
                  <option value={0}>Nenhuma voz encontrada para este idioma</option>
                ) : (
                  voices.map((v, i) => (
                    <option key={`${v.name}-${v.lang}-${i}`} value={i}>
                      {v.name} ({v.lang})
                    </option>
                  ))
                )}
              </select>
              {lang === 'pt-BR' && (
                <p className="hint">
                  {hasMicrosoftFranciscaOrAntonio
                    ? 'Microsoft Francisca/Antonio detectada: estas vozes ficam priorizadas no topo.'
                    : 'Se você instalar Microsoft Francisca ou Antonio no sistema, elas aparecerão aqui e ficarão no topo automaticamente.'}
                </p>
              )}
            </div>

            <div className="row">
              <label htmlFor="rate">Velocidade: {rate.toFixed(2)}×</label>
              <input
                id="rate"
                type="range"
                min={0.65}
                max={1.35}
                step={0.05}
                value={rate}
                onChange={(e) => setRate(Number(e.target.value))}
              />
              <p className="hint">Valores um pouco abaixo de 1× costumam soar mais claros em pt-BR.</p>
            </div>

            <div className="row">
              <label htmlFor="pitch">Tom (pitch): {pitch.toFixed(2)}</label>
              <input
                id="pitch"
                type="range"
                min={0.85}
                max={1.12}
                step={0.01}
                value={pitch}
                onChange={(e) => setPitch(Number(e.target.value))}
              />
              <p className="hint">Ajuste fino do tom; 1,0 é o padrão da voz.</p>
            </div>

            <div className="buttons">
              {playback === 'idle' && (
                <button type="button" className="primary" onClick={handlePlay}>
                  Ouvir
                </button>
              )}
              {playback === 'playing' && (
                <button type="button" onClick={handlePause}>
                  Pausar
                </button>
              )}
              {playback === 'paused' && (
                <>
                  <button type="button" className="primary" onClick={handleResume}>
                    Continuar
                  </button>
                  <button type="button" onClick={handleStop}>
                    Parar
                  </button>
                </>
              )}
              {playback === 'playing' && (
                <button type="button" onClick={handleStop}>
                  Parar
                </button>
              )}
            </div>

            {showTransport && (
              <div className="transport">
                <p className="time-row">
                  <span className="time-label">Tempo aproximado</span>
                  <span className="time-values">
                    {formatTimeMmSs(elapsedApprox)} / {formatTimeMmSs(totalApprox)}
                  </span>
                </p>
                <p className="chunk-label">
                  Trecho {totalChunks ? chunkIndex + 1 : 0} de {totalChunks}
                </p>

                <div className="seek-row">
                  <button
                    type="button"
                    className="icon-btn"
                    title="Voltar 5 trechos"
                    onClick={() => handleSkip(-5)}
                    disabled={totalChunks <= 1}
                  >
                    −5
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    title="Trecho anterior"
                    onClick={() => handleSkip(-1)}
                    disabled={totalChunks <= 1}
                  >
                    ◀
                  </button>
                  <div className="seek-slider-wrap">
                    <input
                      type="range"
                      className="seek-slider"
                      min={0}
                      max={Math.max(0, totalChunks - 1)}
                      step={1}
                      value={clamp(chunkIndex, 0, Math.max(0, totalChunks - 1))}
                      onChange={(e) => handleSeekSlider(Number(e.target.value))}
                      aria-label="Posição na leitura (por trecho)"
                    />
                  </div>
                  <button
                    type="button"
                    className="icon-btn"
                    title="Próximo trecho"
                    onClick={() => handleSkip(1)}
                    disabled={totalChunks <= 1}
                  >
                    ▶
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    title="Avançar 5 trechos"
                    onClick={() => handleSkip(5)}
                    disabled={totalChunks <= 1}
                  >
                    +5
                  </button>
                </div>
                <p className="transport-note">
                  A posição é por <strong>trechos de texto</strong> (não segundos exatos): o
                  navegador não expõe tempo como um player de MP3.
                </p>
              </div>
            )}

            {totalChunks > 0 && playback !== 'idle' && (
              <div className="progress-wrap" aria-live="polite">
                <div
                  className="progress-bar"
                  role="progressbar"
                  style={{ width: `${progressPct}%` }}
                />
                <span className="progress-label">{progressPct}% do texto</span>
              </div>
            )}
          </section>

          <section className="preview">
            <h2>Prévia do texto</h2>
            <pre className="preview-text">{preview}</pre>
          </section>
        </>
      )}

      <section className="help">
        <details>
          <summary>Ajuda: melhorar a voz (pt-BR / en-US)</summary>
          <div className="help-body">
            <p>
              Este site usa a <strong>Web Speech API</strong>. Ela não gera áudio
              “neural” própria; ela fala usando as <strong>vozes instaladas no seu sistema</strong>
              (portanto a qualidade varia conforme macOS/Windows e navegador).
            </p>

            <p>
              Para ficar mais natural, você pode baixar vozes de melhor qualidade no sistema e
              depois selecionar a voz no dropdown do app. Se você atualizar as vozes, recarregue
              a página (ou reinicie o navegador).
            </p>

            <p>
              <strong>macOS:</strong>{' '}
              baixe vozes em <a href="https://support.apple.com/en-tm/guide/mac-help/mchlp2290/mac" target="_blank" rel="noreferrer">System Settings → Accessibility → Read & Speak</a>.
              Procure “System voice” e use “Add a new voice/Download” quando disponível.
            </p>

            <p>
              <strong>Windows 10/11:</strong>{' '}
              instale idiomas/vozes com conversão de texto em voz em{' '}
              <a href="https://support.microsoft.com/pt-br/topic/baixar-idiomas-e-vozes-para-leitura-avan%25C3%25A7ada-modo-de-leitura-e-leitura-em-voz-alta-4c83a8d8-7486-42f7-8e46-2b0fdf753130" target="_blank" rel="noreferrer">
                Settings → Language & region → Add a language
              </a>
              . Em geral, o pacote com ícone de “Text-to-speech” libera novas vozes. Quando o
              Windows/navegador expõe <strong>Microsoft Francisca</strong> ou{' '}
              <strong>Microsoft Antonio</strong>, este app passa a colocá-las no topo da lista.
            </p>

            <p>
              Importante: este projeto <strong>não consegue instalar nem baixar</strong> vozes da
              Microsoft por conta própria, porque roda 100% no navegador e só enxerga as vozes que
              o sistema operacional já disponibiliza para a Web Speech API.
            </p>
          </div>
        </details>
      </section>

      <footer className="footer">
        <p>
          Usa a <strong>Web Speech API</strong> do seu navegador. Para vozes mais naturais, instale
          vozes “premium” ou “melhoradas” no sistema (macOS: Acessibilidade → Conteúdo falado).
        </p>
      </footer>
    </div>
  )
}
