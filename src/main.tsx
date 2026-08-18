import { registerSW } from 'virtual:pwa-register'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './estilo.css'
import App from './App.tsx'

// Versão nova entra sozinha, e sem pedir licença.
//
// O padrão do plugin registra o service worker e espera todas as abas fecharem
// para trocar de versão — o que significa que uma correção publicada hoje pode
// só aparecer semana que vem, sem ninguém entender por quê. Aqui a página
// recarrega assim que a versão nova está pronta, e confere de hora em hora para
// quem deixa o app aberto na mesa a manhã inteira.
const atualizar = registerSW({
  immediate: true,
  onRegisteredSW(_url, registro) {
    if (registro) setInterval(() => void registro.update(), 60 * 60 * 1000)
  },
  onNeedRefresh() {
    void atualizar(true)
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
