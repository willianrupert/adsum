import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// O GitHub Pages serve o site em `/<repositório>/`, então o `base` do build
// precisa casar com o nome do repositório. Renomeou o repositório? Ajuste aqui,
// ou passe `BASE_ADSUM` no ambiente do workflow.
const base = process.env.BASE_ADSUM ?? '/adsum/'

export default defineConfig(({ command, isPreview }) => ({
  // Em desenvolvimento o site é a raiz, que é o confortável. No `preview` o
  // `base` volta a valer — sem isso, o preview serve tudo em `/` e passa por
  // bom um build que o Pages serviria quebrado.
  base: command === 'serve' && !isPreview ? '/' : base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,
      includeAssets: ['icone.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Adsum — frequência por crachá',
        short_name: 'Adsum',
        description:
          'Registro de frequência em sala por leitura de crachá. Os dados ficam neste aparelho.',
        lang: 'pt-BR',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        // O fundo do app é branco no claro e preto no escuro; o splash não sabe
        // qual será, e branco é o que combina com a maioria das telas.
        background_color: '#ffffff',
        theme_color: '#ffffff',
        icons: [
          { src: 'icone-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icone-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icone-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Sem cache de rede: o app não fala com servidor nenhum. Se um dia falar,
        // a regra tem que ser network-first — dado de frequência velho é pior que
        // dado ausente.
        runtimeCaching: [],
      },
      devOptions: {
        // Ligado para que a tela de diagnóstico diga a verdade em desenvolvimento.
        enabled: true,
        type: 'module',
      },
    }),
  ],
}))
