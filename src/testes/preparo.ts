// O Node não tem IndexedDB. O `fake-indexeddb` põe um por cima do globalThis,
// e o Dexie não percebe a diferença — o que permite testar o adaptador de
// verdade, e não um dublê que concorda com tudo que o código faz.
import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(cleanup)

// O jsdom diz que `http://localhost` não é contexto seguro. Navegador nenhum
// concorda — localhost é contexto seguro por definição —, e sem corrigir isso
// toda tela de teste cairia no aviso de ambiente quebrado.
Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })

// O jsdom não implementa rolagem — não há viewport para rolar. Sem isto,
// qualquer `scrollIntoView` derruba o teste por um motivo que não é do app.
Element.prototype.scrollIntoView = () => {}

// Web Audio não existe no jsdom, e o som nunca deve derrubar uma leitura.
class ContextoDeAudioFalso {
  state = 'running'
  currentTime = 0
  destination = {}
  createGain() {
    return {
      gain: {
        value: 1,
        setValueAtTime() {},
        linearRampToValueAtTime() {},
        exponentialRampToValueAtTime() {},
        cancelScheduledValues() {},
      },
      connect: (destino: unknown) => destino,
    }
  }
  createOscillator() {
    return {
      type: '',
      frequency: { value: 0 },
      connect: (destino: unknown) => destino,
      start() {},
      stop() {},
    }
  }
  createBiquadFilter() {
    return { type: '', frequency: { value: 0 }, connect: (destino: unknown) => destino }
  }
  resume() {}
}
Object.defineProperty(globalThis, 'AudioContext', { value: ContextoDeAudioFalso, writable: true })

// O `localStorage` do vitest não é o do jsdom: o Node traz um próprio, e ele
// ganha do global — sem `setItem`, e avisando por conta de `--localstorage-file`
// sem caminho. Nada disso é do app. Um armazenamento de mentira, em memória,
// devolve o comportamento que qualquer navegador tem.
class ArmazenamentoEmMemoria {
  private itens = new Map<string, string>()
  get length() {
    return this.itens.size
  }
  getItem(chave: string) {
    return this.itens.get(chave) ?? null
  }
  setItem(chave: string, valor: string) {
    this.itens.set(chave, String(valor))
  }
  removeItem(chave: string) {
    this.itens.delete(chave)
  }
  clear() {
    this.itens.clear()
  }
  key(i: number) {
    return [...this.itens.keys()][i] ?? null
  }
}
Object.defineProperty(window, 'localStorage', {
  value: new ArmazenamentoEmMemoria(),
  configurable: true,
})
