# ebook-to-audiobook

Site local (React + Vite) para enviar **PDF** ou **EPUB**, extrair o texto no navegador e ouvir com **texto em voz** — sem backend, sem API paga e sem conta.

## Como usar

```bash
npm install
npm run dev
```

Abra o endereço que o Vite mostrar (em geral `http://localhost:5173`), escolha um `.pdf` ou `.epub`, selecione **Português (Brasil)** ou **English (US)**, a voz e a velocidade, e use **Ouvir**.

## O que é “grátis” aqui

- **Leitura em voz:** [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API) do próprio navegador (vozes vêm do sistema operacional).
- **PDF:** [PDF.js](https://mozilla.github.io/pdf.js/) extrai texto embutido no arquivo.
- **EPUB:** o arquivo é aberto como ZIP; lemos o `container.xml`, o OPF e o texto de cada capítulo XHTML/HTML no spine (sem depender do epub.js, para evitar travamentos em alguns livros).

## Limitações

- **PDF escaneado** (só imagem, sem camada de texto) não gera leitura útil; seria preciso OCR (não incluído).
- Qualidade e vozes disponíveis dependem do **navegador e do SO** (no macOS, costuma ajudar instalar vozes em Ajustes → Acessibilidade → Conteúdo falado).

## Build para hospedar de graça

`npm run build` gera `dist/`, que você pode publicar em GitHub Pages, Cloudflare Pages, etc.
