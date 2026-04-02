import type { ClientPlatform } from './lib/detectPlatform'

type Props = {
  platform: ClientPlatform
}

export function HelpSummaryLabel({ platform }: Props) {
  switch (platform) {
    case 'ios':
      return <>Ajuda: voz e leitura no iPhone ou iPad</>
    case 'android':
      return <>Ajuda: voz e leitura no Android</>
    case 'macos':
      return <>Ajuda: voz e leitura no Mac</>
    case 'windows':
      return <>Ajuda: voz e leitura no Windows</>
    default:
      return <>Ajuda: melhorar a voz (pt-BR / en-US)</>
  }
}

export function HelpBody({ platform }: Props) {
  const introDevice =
    platform === 'ios'
      ? 'iPhone ou iPad'
      : platform === 'android'
        ? 'Android'
        : platform === 'macos'
          ? 'Mac'
          : platform === 'windows'
            ? 'Windows'
            : 'sistema'

  return (
    <>
      <p>
        Este site usa a <strong>Web Speech API</strong> do navegador: não gera voz “neural”
        própria; usa as <strong>vozes instaladas no {introDevice}</strong>. A qualidade depende do
        aparelho, do idioma baixado e do navegador (Safari, Chrome, etc.).
      </p>

      <p>
        Depois de instalar ou baixar novas vozes no sistema, <strong>recarregue esta página</strong>{' '}
        (ou feche e abra o navegador) para a lista de vozes atualizar.
      </p>

      {platform === 'ios' && (
        <p>
          <strong>No iPhone ou iPad:</strong> vá em{' '}
          <strong>Ajustes → Acessibilidade → Conteúdo falado → Vozes</strong> e baixe vozes de
          melhor qualidade em Português ou Inglês. Também é possível ajustar a taxa global de fala
          ali. Em Safari, o app enxerga as vozes que o iOS oferece à Web Speech API — em geral a
          lista é menor que no desktop.
        </p>
      )}

      {platform === 'android' && (
        <p>
          <strong>No Android:</strong> o caminho varia um pouco por fabricante. Procure em{' '}
          <strong>Ajustes → Acessibilidade</strong> por opções como <strong>Texto para fala</strong>,{' '}
          <strong>Leitor de tela</strong> ou <strong>Preferências de voz</strong>; instale pacotes
          de idioma/voz quando o sistema pedir. Vozes “offline” costumam aparecer no navegador após
          instaladas.
        </p>
      )}

      {platform === 'macos' && (
        <p>
          <strong>No Mac:</strong> baixe vozes em{' '}
          <a
            href="https://support.apple.com/guide/mac-help/change-the-voice-your-mac-uses-to-speak-text-mchlp2290/mac"
            target="_blank"
            rel="noopener noreferrer"
          >
            Ajustes do Sistema → Acessibilidade → Conteúdo falado → Voz do sistema
          </a>
          . Use “Adicionar voz…” / download quando disponível.
        </p>
      )}

      {platform === 'windows' && (
        <p>
          <strong>No Windows 10 ou 11:</strong> instale idiomas e vozes de conversão de texto em
          fala em{' '}
          <a
            href="https://support.microsoft.com/pt-br/topic/baixar-idiomas-e-vozes-para-leitura-avan%25C3%25A7ada-modo-de-leitura-e-leitura-em-voz-alta-4c83a8d8-7486-42f7-8e46-2b0fdf753130"
            target="_blank"
            rel="noopener noreferrer"
          >
            Configurações → Hora e idioma → Idioma e região
          </a>
          . Pacotes com ícone de texto para fala liberam vozes novas. Se o navegador expuser{' '}
          <strong>Microsoft Francisca</strong> ou <strong>Microsoft Antonio</strong>, este app
          prioriza essas vozes no topo da lista em Português.
        </p>
      )}

      {platform === 'other' && (
        <>
          <p>
            <strong>macOS:</strong> baixe vozes em{' '}
            <a
              href="https://support.apple.com/guide/mac-help/change-the-voice-your-mac-uses-to-speak-text-mchlp2290/mac"
              target="_blank"
              rel="noopener noreferrer"
            >
              Ajustes do Sistema → Acessibilidade → Conteúdo falado
            </a>
            .
          </p>
          <p>
            <strong>Windows 10/11:</strong> instale vozes em{' '}
            <a
              href="https://support.microsoft.com/pt-br/topic/baixar-idiomas-e-vozes-para-leitura-avan%25C3%25A7ada-modo-de-leitura-e-leitura-em-voz-alta-4c83a8d8-7486-42f7-8e46-2b0fdf753130"
              target="_blank"
              rel="noopener noreferrer"
            >
              Configurações → Idioma
            </a>
            ; o app destaca <strong>Francisca</strong> e <strong>Antonio</strong> quando
            disponíveis.
          </p>
        </>
      )}

      <p>
        Este app <strong>não instala vozes por conta própria</strong>: roda só no navegador e só
        enxerga o que o sistema já disponibiliza para a Web Speech API.
      </p>
    </>
  )
}
