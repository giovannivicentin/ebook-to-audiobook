import * as pdfjsLib from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker

export async function extractTextFromPdf(file: File): Promise<string> {
  const data = new Uint8Array(await file.arrayBuffer())
  const loadingTask = pdfjsLib.getDocument({ data })
  const pdf = await loadingTask.promise
  const parts: string[] = []

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    const line = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
    parts.push(line)
  }

  return parts.join('\n\n').replace(/\s+\n/g, '\n').trim()
}
