import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.js";
import pdfWorker from "pdfjs-dist/legacy/build/pdf.worker.min.js?url";
import { readFileAsArrayBuffer } from "./readFileAsArrayBuffer";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

function isLikelyIosWebKit(): boolean {
  if (typeof navigator === "undefined") return false;

  const ua = navigator.userAgent || "";
  const isAppleMobile =
    /iPhone|iPad|iPod/i.test(ua) ||
    (navigator.platform === "MacIntel" && (navigator.maxTouchPoints ?? 0) > 1);

  return isAppleMobile;
}

async function ensurePdfJsFakeWorkerOnIos(): Promise<void> {
  if (!isLikelyIosWebKit()) return;

  const pdfWorkerUtil = (
    pdfjsLib as typeof pdfjsLib & {
      PDFWorkerUtil?: { isWorkerDisabled?: boolean };
    }
  ).PDFWorkerUtil;

  if (pdfWorkerUtil) {
    pdfWorkerUtil.isWorkerDisabled = true;
  }

  const globalScope = globalThis as typeof globalThis & {
    pdfjsWorker?: { WorkerMessageHandler?: unknown };
  };

  if (globalScope.pdfjsWorker?.WorkerMessageHandler) return;

  await import("pdfjs-dist/legacy/build/pdf.worker.min.js");

  if (!globalScope.pdfjsWorker?.WorkerMessageHandler) {
    throw new Error("Não foi possível carregar o leitor de PDF neste iOS.");
  }
}

export async function extractTextFromPdf(file: File): Promise<string> {
  await ensurePdfJsFakeWorkerOnIos();
  const data = new Uint8Array(await readFileAsArrayBuffer(file));
  const loadingTask = pdfjsLib.getDocument({ data });
  const pdf = await loadingTask.promise;
  const parts: string[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const line = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    parts.push(line);
  }

  return parts.join("\n\n").replace(/\s+\n/g, "\n").trim();
}
