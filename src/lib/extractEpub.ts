import JSZip from 'jszip'
import { readFileAsArrayBuffer } from './readFileAsArrayBuffer'

function normalizeText(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

/** OPF 2/3 and nested tags: match by local name only. */
function byLocalName(parent: Document | Element, local: string): Element[] {
  return Array.from(parent.getElementsByTagNameNS('*', local))
}

function resolveAgainstOpf(opfDir: string, href: string): string {
  const clean = href.split('#')[0].split('?')[0].trim()
  if (!clean) return ''
  const base = opfDir ? `${opfDir}/${clean}` : clean
  const parts = base.replace(/\\/g, '/').split('/').filter((p) => p && p !== '.')
  const stack: string[] = []
  for (const p of parts) {
    if (p === '..') stack.pop()
    else stack.push(p)
  }
  return stack.join('/')
}

function htmlToPlainText(html: string): string {
  let doc = new DOMParser().parseFromString(html, 'application/xhtml+xml')
  if (doc.querySelector('parsererror')) {
    doc = new DOMParser().parseFromString(html, 'text/html')
  }
  doc.querySelectorAll('script, style, noscript').forEach((el) => el.remove())
  const root = doc.body ?? doc.documentElement
  return root?.textContent ?? ''
}

async function readZipText(zip: JSZip, path: string): Promise<string | null> {
  let f = zip.file(path)
  if (!f) f = zip.file(decodeURIComponent(path))
  if (!f) {
    const lower = path.toLowerCase()
    const names = Object.keys(zip.files)
    const hit = names.find((n) => n.toLowerCase() === lower)
    if (hit) f = zip.file(hit)
  }
  if (!f || f.dir) return null
  return f.async('string')
}

export async function extractTextFromEpub(file: File): Promise<string> {
  const buf = await readFileAsArrayBuffer(file)
  const zip = await JSZip.loadAsync(buf)

  const containerStr = await readZipText(zip, 'META-INF/container.xml')
  if (!containerStr) {
    throw new Error('EPUB inválido: falta META-INF/container.xml')
  }

  const containerDoc = new DOMParser().parseFromString(containerStr, 'application/xml')
  const rootfiles = byLocalName(containerDoc, 'rootfile')
  const opfPath = rootfiles[0]?.getAttribute('full-path')?.trim()
  if (!opfPath) {
    throw new Error('EPUB inválido: container sem full-path.')
  }

  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/')) : ''

  const opfStr = await readZipText(zip, opfPath)
  if (!opfStr) {
    throw new Error('Não foi possível ler o arquivo OPF do EPUB.')
  }

  const opfDoc = new DOMParser().parseFromString(opfStr, 'application/xml')

  const manifest = new Map<string, { href: string; mediaType: string }>()
  const manifestEls = byLocalName(opfDoc, 'manifest')
  const manifestRoot = manifestEls[0]
  if (manifestRoot) {
    for (const item of byLocalName(manifestRoot, 'item')) {
      const id = item.getAttribute('id')
      const href = item.getAttribute('href')
      const mediaType = item.getAttribute('media-type') ?? ''
      if (id && href) manifest.set(id, { href, mediaType })
    }
  }

  const spineEls = byLocalName(opfDoc, 'spine')
  const spineRoot = spineEls[0]
  const itemrefs: { idref: string; linear: string | null }[] = []
  if (spineRoot) {
    for (const ref of byLocalName(spineRoot, 'itemref')) {
      const idref = ref.getAttribute('idref')
      if (idref) itemrefs.push({ idref, linear: ref.getAttribute('linear') })
    }
  }

  const parts: string[] = []

  for (const { idref, linear } of itemrefs) {
    if (linear === 'no') continue
    const item = manifest.get(idref)
    if (!item) continue

    const mt = item.mediaType.toLowerCase()
    const href = item.href
    const isHtml =
      mt.includes('html') ||
      mt === 'application/xhtml+xml' ||
      /\.x?html?$/i.test(href)

    if (!isHtml) continue

    const zipPath = resolveAgainstOpf(opfDir, href)
    if (!zipPath) continue

    const raw = await readZipText(zip, zipPath)
    if (!raw) continue

    const plain = htmlToPlainText(raw)
    const t = normalizeText(plain)
    if (t) parts.push(t)
  }

  return parts.join('\n\n')
}
