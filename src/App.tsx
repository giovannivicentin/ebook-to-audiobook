import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { chunkForSpeech } from "./lib/chunkText";
import { formatTimeMmSs, totalDurationSec } from "./lib/readingTime";
import { usePlaybackElapsed } from "./lib/usePlaybackElapsed";
import { HelpBody, HelpSummaryLabel } from "./HelpContent";
import {
  detectClientPlatform,
  footerHintForPlatform,
} from "./lib/detectPlatform";
import { type LangMode, useSpeechQueue, useVoices } from "./lib/useSpeech";
import "./App.css";

type LoadState = "idle" | "loading" | "ready" | "error";

type ThemeChoice = "light" | "dark";

const THEME_STORAGE = "ebook-audio-theme";

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
  const [theme, setTheme] = useState<ThemeChoice>(() =>
    document.documentElement.getAttribute("data-theme") === "dark"
      ? "dark"
      : "light",
  );

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(THEME_STORAGE, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

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

  const {
    elapsedSec,
    onUtteranceStart,
    snapshotForPause,
    prepareResume,
    resetClock,
    clearPauseAnchor,
  } = usePlaybackElapsed(chunks, chunkIndex, rate, playback);

  const { speak, pause, resume, stop, seekToChunk, skipChunks } =
    useSpeechQueue(
      lang,
      selectedVoice,
      rate,
      pitch,
      onChunkIndex,
      onUtteranceStart,
      onDone,
    );

  const preview = useMemo(() => {
    if (text.length <= 4000) return text;
    return `${text.slice(0, 4000)}…`;
  }, [text]);

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
    resetClock();
    stop();
    setPlayback("idle");
    setChunkIndex(0);

    try {
      let extracted = "";
      if (lower.endsWith(".pdf")) {
        const { extractTextFromPdf } = await import("./lib/extractPdf");
        extracted = await extractTextFromPdf(file);
      } else if (lower.endsWith(".epub")) {
        const { extractTextFromEpub } = await import("./lib/extractEpub");
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
    if (playback === "paused") clearPauseAnchor();
    const i = clamp(Math.round(next), 0, Math.max(0, totalChunks - 1));
    if (resumePlayback) {
      seekToChunk(i, true);
    } else {
      setChunkIndex(i);
    }
  };

  const handleSkip = (delta: number) => {
    if (totalChunks === 0) return;
    if (playback === "paused") clearPauseAnchor();
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
    snapshotForPause();
    pause();
    setPlayback("paused");
  };

  const handleResume = () => {
    prepareResume();
    resume();
    setPlayback("playing");
  };

  const handleStop = () => {
    resetClock();
    stop();
    setPlayback("idle");
    setChunkIndex(0);
  };

  const progressPct =
    totalApprox > 0
      ? Math.min(100, Math.round((elapsedSec / totalApprox) * 100))
      : totalChunks > 0
        ? Math.round(((chunkIndex + 1) / totalChunks) * 100)
        : 0;

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
        <div className="header-top">
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
          <button
            type="button"
            className="theme-toggle"
            onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
            aria-pressed={theme === "dark"}
            aria-label={
              theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"
            }
          >
            {theme === "dark" ? (
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41" />
              </svg>
            ) : (
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  fill="currentColor"
                  d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"
                />
              </svg>
            )}
          </button>
        </div>
        <p className="lede">
          Envie um PDF ou EPUB e ouça com a voz do seu navegador — gratuito, sem
          conta e sem servidor (tudo roda {ledeDevice}).
        </p>
      </header>

      <main id="conteudo-principal" tabIndex={-1}>
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
          <p
            className="file-meta"
            {...(loadState === "loading"
              ? { "aria-live": "polite" as const }
              : {})}
          >
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
          <>
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
                  {lang === "pt-BR" && hasMicrosoftFranciscaOrAntonio && (
                    <p className="hint">
                      Microsoft Francisca/Antonio detectada: estas vozes ficam
                      priorizadas no topo.
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

                {showTransport && (
                  <div className="player-shell" aria-labelledby="reproducao">
                    <div className="player-time">
                      <span className="player-time__live" aria-live="polite">
                        {formatTimeMmSs(elapsedSec)}
                      </span>
                      <span className="player-time__sep" aria-hidden="true">
                        /
                      </span>
                      <span
                        className="player-time__total"
                        title="Duração estimada"
                      >
                        ~{formatTimeMmSs(totalApprox)}
                      </span>
                    </div>
                    <p className="player-chunk">
                      Trecho{" "}
                      <strong>
                        {totalChunks ? chunkIndex + 1 : 0} / {totalChunks}
                      </strong>
                    </p>

                    <div className="player-controls">
                      {playback === "idle" && (
                        <button
                          type="button"
                          className="player-btn player-btn--play"
                          onClick={handlePlay}
                          aria-label="Ouvir"
                          title="Ouvir"
                        >
                          <svg
                            width="22"
                            height="22"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                          >
                            <path fill="currentColor" d="M8 5v14l11-7L8 5z" />
                          </svg>
                        </button>
                      )}
                      {playback === "playing" && (
                        <button
                          type="button"
                          className="player-btn player-btn--primary"
                          onClick={handlePause}
                          aria-label="Pausar"
                          title="Pausar"
                        >
                          <svg
                            width="22"
                            height="22"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                          >
                            <path
                              fill="currentColor"
                              d="M6 5h4v14H6V5zm8 0h4v14h-4V5z"
                            />
                          </svg>
                        </button>
                      )}
                      {playback === "paused" && (
                        <button
                          type="button"
                          className="player-btn player-btn--play"
                          onClick={handleResume}
                          aria-label="Continuar"
                          title="Continuar"
                        >
                          <svg
                            width="22"
                            height="22"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                          >
                            <path fill="currentColor" d="M8 5v14l11-7L8 5z" />
                          </svg>
                        </button>
                      )}
                      {playback !== "idle" && (
                        <button
                          type="button"
                          className="player-btn player-btn--ghost"
                          onClick={handleStop}
                          aria-label="Parar e voltar ao início"
                          title="Parar"
                        >
                          <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                          >
                            <path fill="currentColor" d="M6 6h12v12H6V6z" />
                          </svg>
                        </button>
                      )}
                    </div>

                    <div className="player-seek">
                      <button
                        type="button"
                        className="player-skip"
                        title="Voltar 5 trechos"
                        aria-label="Voltar 5 trechos"
                        onClick={() => handleSkip(-5)}
                        disabled={totalChunks <= 1}
                      >
                        −5
                      </button>
                      <button
                        type="button"
                        className="player-skip"
                        title="Trecho anterior"
                        aria-label="Trecho anterior"
                        onClick={() => handleSkip(-1)}
                        disabled={totalChunks <= 1}
                      >
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path
                            fill="currentColor"
                            d="M6 6h2v12H6V6zm3.5 6l9 6V6l-9 6z"
                          />
                        </svg>
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
                        className="player-skip"
                        title="Próximo trecho"
                        aria-label="Próximo trecho"
                        onClick={() => handleSkip(1)}
                        disabled={totalChunks <= 1}
                      >
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path
                            fill="currentColor"
                            d="M16 18h2V6h-2v12zM6 6v12l9-6-9-6z"
                          />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="player-skip"
                        title="Avançar 5 trechos"
                        aria-label="Avançar 5 trechos"
                        onClick={() => handleSkip(5)}
                        disabled={totalChunks <= 1}
                      >
                        +5
                      </button>
                    </div>

                    <p className="transport-note">
                      O tempo à <strong>esquerda</strong> acompanha a leitura em
                      tempo real (cada trecho começa a contar quando a fala
                      começa). O valor com <strong>~</strong> é duração{" "}
                      <strong>estimada</strong> do texto todo — a Web Speech API
                      não expõe tempo exato como um MP3.
                    </p>

                    {playback !== "idle" && (
                      <div className="progress-stack" aria-live="polite">
                        <div
                          className="progress-wrap"
                          role="progressbar"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={progressPct}
                          aria-valuetext={`${progressPct} por cento do texto lido (estimativa)`}
                          aria-labelledby="progress-percent-label"
                        >
                          <div
                            className="progress-bar"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                        <span
                          className="progress-label"
                          id="progress-percent-label"
                        >
                          {progressPct}% do texto (estimativa)
                        </span>
                      </div>
                    )}
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
          </>
        )}
        <section className="help" aria-label="Ajuda sobre voz e acessibilidade">
          <details className="help-details" id="painel-ajuda">
            <summary className="help-summary" id="titulo-ajuda">
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
      </main>

      <div className="footer-block">
        <p className="footer-hint">{footerHint}</p>
        <footer className="footer">
          <p className="footer-credit">
            Feito por{" "}
            <a
              href="https://giovannivicentin.com"
              target="_blank"
              rel="noreferrer"
            >
              Giovanni Vicentin
            </a>{" "}
            • © 2026 Todos os direitos reservados.
          </p>
        </footer>
      </div>
    </div>
  );
}
