import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { extractTextFromPdf } from "./lib/extractPdf";
import { extractTextFromEpub } from "./lib/extractEpub";
import { chunkForSpeech } from "./lib/chunkText";
import {
  cumulativeDurationSec,
  formatTimeMmSs,
  totalDurationSec,
} from "./lib/readingTime";
import { HelpBody, HelpSummaryLabel } from "./HelpContent";
import {
  detectClientPlatform,
  footerHintForPlatform,
} from "./lib/detectPlatform";
import { type LangMode, useSpeechQueue, useVoices } from "./lib/useSpeech";
import "./App.css";

type LoadState = "idle" | "loading" | "ready" | "error";

const LANG_OPTIONS: { value: LangMode; label: string }[] = [
  { value: "pt-BR", label: "Português (Brasil)" },
  { value: "en-US", label: "English (US)" },
];

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export default function App() {
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [lang, setLang] = useState<LangMode>("pt-BR");
  const [rate, setRate] = useState(0.95);
  const [pitch, setPitch] = useState(1);
  const [voiceIndex, setVoiceIndex] = useState(0);
  const [chunkIndex, setChunkIndex] = useState(0);
  const [playback, setPlayback] = useState<"idle" | "playing" | "paused">(
    "idle",
  );
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const dragDepthRef = useRef(0);

  const chunks = useMemo(() => chunkForSpeech(text), [text]);
  const totalChunks = chunks.length;

  const voices = useVoices(lang);
  const selectedVoice = voices[voiceIndex] ?? null;
  const hasMicrosoftFranciscaOrAntonio = useMemo(
    () =>
      voices.some((v) => {
        const name = v.name.toLowerCase();
        return name.includes("francisca") || name.includes("antonio");
      }),
    [voices],
  );

  useEffect(() => {
    setVoiceIndex(0);
  }, [lang, voices.length]);

  useEffect(() => {
    setChunkIndex(0);
  }, [text]);

  const onChunkIndex = useCallback((zeroBased: number, total: number) => {
    setChunkIndex(zeroBased);
    if (total === 0) setChunkIndex(0);
  }, []);

  const onDone = useCallback(() => {
    setPlayback("idle");
    setChunkIndex(0);
  }, []);

  const { speak, pause, resume, stop, seekToChunk, skipChunks } =
    useSpeechQueue(lang, selectedVoice, rate, pitch, onChunkIndex, onDone);

  const preview = useMemo(() => {
    if (text.length <= 4000) return text;
    return `${text.slice(0, 4000)}…`;
  }, [text]);

  const elapsedApprox = useMemo(
    () => cumulativeDurationSec(chunks, chunkIndex, rate),
    [chunks, chunkIndex, rate],
  );

  const totalApprox = useMemo(
    () => totalDurationSec(chunks, rate),
    [chunks, rate],
  );

  const processFile = async (file: File) => {
    const lower = file.name.toLowerCase();
    setError(null);
    setFileName(file.name);
    setLoadState("loading");
    setText("");
    stop();
    setPlayback("idle");
    setChunkIndex(0);

    try {
      let extracted = "";
      if (lower.endsWith(".pdf")) {
        extracted = await extractTextFromPdf(file);
      } else if (lower.endsWith(".epub")) {
        extracted = await extractTextFromEpub(file);
      } else {
        throw new Error("Use um arquivo .pdf ou .epub.");
      }

      if (!extracted.trim()) {
        setLoadState("error");
        setError(
          "Não foi possível extrair texto. PDFs escaneados (só imagem) precisam de OCR; este app usa só o texto embutido no arquivo.",
        );
        return;
      }

      setText(extracted);
      setLoadState("ready");
    } catch (e) {
      setLoadState("error");
      setError(e instanceof Error ? e.message : "Falha ao ler o arquivo.");
    }
  };

  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepthRef.current += 1;
    setIsDraggingFile(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDraggingFile(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepthRef.current = 0;
    setIsDraggingFile(false);
    const f = e.dataTransfer.files[0];
    if (f) void processFile(f);
  };

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void processFile(f);
    e.target.value = "";
  };

  const resumePlayback = playback === "playing" || playback === "paused";

  const handleSeekSlider = (next: number) => {
    const i = clamp(Math.round(next), 0, Math.max(0, totalChunks - 1));
    if (resumePlayback) {
      seekToChunk(i, true);
    } else {
      setChunkIndex(i);
    }
  };

  const handleSkip = (delta: number) => {
    if (totalChunks === 0) return;
    const next = clamp(chunkIndex + delta, 0, totalChunks - 1);
    if (resumePlayback) {
      skipChunks(delta, true);
    } else {
      setChunkIndex(next);
    }
  };

  const handlePlay = () => {
    if (!text.trim() || totalChunks === 0) return;
    setPlayback("playing");
    speak(chunks, chunkIndex);
  };

  const handlePause = () => {
    pause();
    setPlayback("paused");
  };

  const handleResume = () => {
    resume();
    setPlayback("playing");
  };

  const handleStop = () => {
    stop();
    setPlayback("idle");
    setChunkIndex(0);
  };

  const progressPct =
    totalChunks > 0 ? Math.round(((chunkIndex + 1) / totalChunks) * 100) : 0;

  const showTransport = totalChunks > 0;
  const textTruncated = text.length > 4000;

  const platform = useMemo(() => detectClientPlatform(), []);
  const ledeDevice =
    platform === "ios" || platform === "android"
      ? "no seu aparelho"
      : "no seu computador";
  const footerHint = footerHintForPlatform(platform);

  return (
    <div className="app">
      <a href="#conteudo-principal" className="skip-link">
        Ir para o conteúdo principal
      </a>
      <header className="header">
        <div className="title-block">
          <h1 className="title-hero">Ebook em áudio</h1>
          <p
            className="title-formats"
            aria-label="Formatos suportados: PDF e EPUB"
          >
            <span className="title-formats__item">PDF</span>
            <span className="title-formats__sep" aria-hidden="true" />
            <span className="title-formats__item">EPUB</span>
          </p>
        </div>
        <p className="lede">
          Envie um PDF ou EPUB e ouça com a voz do seu navegador — gratuito, sem
          conta e sem servidor (tudo roda {ledeDevice}).
        </p>
      </header>

      <section
        className={`dropzone${isDraggingFile ? " dropzone--dragging" : ""}`}
        aria-busy={loadState === "loading"}
        onDragEnter={onDragEnter}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <input
          type="file"
          accept=".pdf,.epub,application/pdf,application/epub+zip"
          onChange={onFileInput}
          className="file-input"
          id="file"
          aria-describedby="drop-hint"
        />
        <label htmlFor="file" className="drop-label">
          <span className="drop-icon" aria-hidden="true">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </span>
          <span className="drop-title">
            Arraste um arquivo ou clique para escolher
          </span>
          <span id="drop-hint" className="drop-hint">
            Formatos aceitos: PDF ou EPUB
          </span>
        </label>
      </section>

      {fileName && (
        <p className="file-meta">
          <span>
            Arquivo: <strong>{fileName}</strong>
          </span>
          {loadState === "loading" && (
            <span className="loading-badge">Extraindo texto…</span>
          )}
        </p>
      )}

      {error && (
        <div className="banner error" role="alert">
          {error}
        </div>
      )}

      {loadState === "ready" && text && (
        <main id="conteudo-principal">
          <section className="controls" aria-labelledby="painel-leitura">
            <h2 id="painel-leitura" className="control-section-title">
              Leitura e voz
            </h2>
            <div className="controls-grid two">
              <div className="field-group">
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

              <div className="field-group">
                <label htmlFor="voice">Voz (mais naturais no topo)</label>
                <select
                  id="voice"
                  value={voiceIndex}
                  onChange={(e) => setVoiceIndex(Number(e.target.value))}
                  disabled={voices.length === 0}
                >
                  {voices.length === 0 ? (
                    <option value={0}>
                      Nenhuma voz encontrada para este idioma
                    </option>
                  ) : (
                    voices.map((v, i) => (
                      <option key={`${v.name}-${v.lang}-${i}`} value={i}>
                        {v.name} ({v.lang})
                      </option>
                    ))
                  )}
                </select>
                {lang === "pt-BR" && (
                  <p className="hint">
                    {hasMicrosoftFranciscaOrAntonio
                      ? "Microsoft Francisca/Antonio detectada: estas vozes ficam priorizadas no topo."
                      : "Se você instalar Microsoft Francisca ou Antonio no sistema, elas aparecerão aqui e ficarão no topo automaticamente."}
                  </p>
                )}
              </div>
            </div>

            <div className="controls-grid">
              <div className="field-group">
                <label htmlFor="rate">
                  Velocidade{" "}
                  <span className="range-value">({rate.toFixed(2)}×)</span>
                </label>
                <div className="range-track">
                  <input
                    id="rate"
                    type="range"
                    min={0.65}
                    max={1.35}
                    step={0.05}
                    value={rate}
                    onChange={(e) => setRate(Number(e.target.value))}
                    aria-valuetext={`${rate.toFixed(2)} vezes`}
                  />
                </div>
                <p className="hint">
                  Valores um pouco abaixo de 1× costumam soar mais claros em
                  pt-BR.
                </p>
              </div>

              <div className="field-group">
                <label htmlFor="pitch">
                  Tom (pitch){" "}
                  <span className="range-value">({pitch.toFixed(2)})</span>
                </label>
                <div className="range-track">
                  <input
                    id="pitch"
                    type="range"
                    min={0.85}
                    max={1.12}
                    step={0.01}
                    value={pitch}
                    onChange={(e) => setPitch(Number(e.target.value))}
                    aria-valuetext={pitch.toFixed(2)}
                  />
                </div>
                <p className="hint">
                  Ajuste fino do tom; 1,0 é o padrão da voz.
                </p>
              </div>
            </div>

            <div className="playback-block">
              <p
                className="control-section-title control-section-title--sub"
                id="reproducao"
              >
                Reprodução
              </p>
              <div className="buttons" aria-labelledby="reproducao">
                {playback === "idle" && (
                  <button
                    type="button"
                    className="primary"
                    onClick={handlePlay}
                  >
                    Ouvir
                  </button>
                )}
                {playback === "playing" && (
                  <button type="button" onClick={handlePause}>
                    Pausar
                  </button>
                )}
                {playback === "paused" && (
                  <>
                    <button
                      type="button"
                      className="primary"
                      onClick={handleResume}
                    >
                      Continuar
                    </button>
                    <button type="button" onClick={handleStop}>
                      Parar
                    </button>
                  </>
                )}
                {playback === "playing" && (
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
                      {formatTimeMmSs(elapsedApprox)} /{" "}
                      {formatTimeMmSs(totalApprox)}
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
                      aria-label="Voltar 5 trechos"
                      onClick={() => handleSkip(-5)}
                      disabled={totalChunks <= 1}
                    >
                      −5
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      title="Trecho anterior"
                      aria-label="Trecho anterior"
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
                        value={clamp(
                          chunkIndex,
                          0,
                          Math.max(0, totalChunks - 1),
                        )}
                        onChange={(e) =>
                          handleSeekSlider(Number(e.target.value))
                        }
                        aria-label="Posição na leitura (por trecho)"
                        aria-valuemin={0}
                        aria-valuemax={Math.max(0, totalChunks - 1)}
                        aria-valuenow={clamp(
                          chunkIndex,
                          0,
                          Math.max(0, totalChunks - 1),
                        )}
                        aria-valuetext={`Trecho ${totalChunks ? chunkIndex + 1 : 0} de ${totalChunks}`}
                      />
                    </div>
                    <button
                      type="button"
                      className="icon-btn"
                      title="Próximo trecho"
                      aria-label="Próximo trecho"
                      onClick={() => handleSkip(1)}
                      disabled={totalChunks <= 1}
                    >
                      ▶
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      title="Avançar 5 trechos"
                      aria-label="Avançar 5 trechos"
                      onClick={() => handleSkip(5)}
                      disabled={totalChunks <= 1}
                    >
                      +5
                    </button>
                  </div>
                  <p className="transport-note">
                    A posição é por <strong>trechos de texto</strong> (não
                    segundos exatos): o navegador não expõe tempo como um player
                    de MP3.
                  </p>
                </div>
              )}

              {totalChunks > 0 && playback !== "idle" && (
                <div className="progress-wrap" aria-live="polite">
                  <div
                    className="progress-bar"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={progressPct}
                    aria-valuetext={`${progressPct}% do texto lido`}
                    style={{ width: `${progressPct}%` }}
                  />
                  <span className="progress-label">
                    {progressPct}% do texto
                  </span>
                </div>
              )}
            </div>
          </section>

          <section className="preview" aria-labelledby="preview-heading">
            <div className="preview-header">
              <h2 id="preview-heading">Prévia do texto</h2>
              {textTruncated && (
                <span className="preview-badge">Primeiros caracteres</span>
              )}
            </div>
            <pre className="preview-text">{preview}</pre>
          </section>
        </main>
      )}

      <section className="help" aria-label="Ajuda sobre voz e acessibilidade">
        <details className="help-details">
          <summary className="help-summary">
            <span className="help-summary__text">
              <HelpSummaryLabel platform={platform} />
            </span>
            <span className="help-summary__chevron" aria-hidden="true">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M6 9l6 6 6-6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </summary>
          <div className="help-anim">
            <div className="help-anim-inner">
              <div className="help-body">
                <HelpBody platform={platform} />
              </div>
            </div>
          </div>
        </details>
      </section>

      <footer className="footer">
        <p>{footerHint}</p>
      </footer>
    </div>
  );
}
