export type ClientPlatform = 'ios' | 'android' | 'macos' | 'windows' | 'other'

function isLikelyIos(): boolean {
  const ua = navigator.userAgent || ''
  if (/iPhone|iPod/i.test(ua)) return true
  if (/iPad/i.test(ua)) return true
  if (
    typeof navigator.platform === 'string' &&
    navigator.platform === 'MacIntel' &&
    (navigator.maxTouchPoints ?? 0) > 1
  ) {
    return true
  }
  return false
}

/** Heurística no cliente; use só após o app estar no browser. */
export function detectClientPlatform(): ClientPlatform {
  if (typeof navigator === 'undefined') return 'other'

  const ua = navigator.userAgent || ''

  if (isLikelyIos()) return 'ios'
  if (/android/i.test(ua)) return 'android'
  if (/windows phone|iemobile/i.test(ua)) return 'windows'
  if (/win32|win64|windows/i.test(navigator.platform || '') || /Windows NT/i.test(ua)) {
    return 'windows'
  }
  if (/macintosh|mac os x/i.test(ua) || (navigator.platform || '').toUpperCase().includes('MAC')) {
    return 'macos'
  }
  return 'other'
}

export function footerHintForPlatform(platform: ClientPlatform): string {
  switch (platform) {
    case 'ios':
      return 'Usa a Web Speech API do navegador. No iPhone/iPad, instale vozes em Ajustes → Acessibilidade → Conteúdo falado.'
    case 'android':
      return 'Usa a Web Speech API do navegador. No Android, adicione vozes de texto para fala em Ajustes → Acessibilidade.'
    case 'macos':
      return 'Usa a Web Speech API do navegador. No Mac, baixe vozes em Ajustes do Sistema → Acessibilidade → Conteúdo falado.'
    case 'windows':
      return 'Usa a Web Speech API do navegador. No Windows, instale vozes de idioma em Configurações para melhorar o resultado.'
    default:
      return 'Usa a Web Speech API do seu navegador. Para vozes mais naturais, instale idiomas e vozes melhoradas no sistema.'
  }
}
