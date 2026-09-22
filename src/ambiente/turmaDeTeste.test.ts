// Contra o `RepositorioDexie` de verdade (IndexedDB falso), como o resto do
// projeto exige — nada aqui é dublê.

import { afterEach, describe, expect, it } from 'vitest'
import { montarBancada, type Bancada } from '../testes/montar.tsx'
import { prepararTurmaDeTeste, situacaoDaTurmaDeTeste } from './turmaDeTeste.ts'
import { horariosAdiados } from './preferencias.ts'
import { TURMA_DE_TESTE } from '../nucleo/suiteDeTestes.ts'

let bancada: Bancada
afterEach(async () => {
  await bancada?.repositorio.fechar()
})

describe('situacaoDaTurmaDeTeste', () => {
  it('sem sessão nenhuma, precisa preparar', async () => {
    bancada = await montarBancada()
    expect(await situacaoDaTurmaDeTeste(bancada.repositorio)).toBe('precisa_preparar')
  })

  it('sessão de outra turma aberta: não mexe', async () => {
    bancada = await montarBancada()
    await bancada.repositorio.abrirSessao({
      turma: 'IF685 · T01',
      abertaEm: new Date().toISOString(),
      uidHashProfessor: 'prof',
    })
    expect(await situacaoDaTurmaDeTeste(bancada.repositorio)).toBe('outra_sessao_aberta')
  })

  it('sessão já é a da turma de teste: pronta', async () => {
    bancada = await montarBancada()
    await bancada.repositorio.abrirSessao({
      turma: TURMA_DE_TESTE,
      abertaEm: new Date().toISOString(),
      uidHashProfessor: 'x',
    })
    expect(await situacaoDaTurmaDeTeste(bancada.repositorio)).toBe('pronta')
  })
})

describe('prepararTurmaDeTeste', () => {
  it('cria a turma, 12 vínculos e abre a sessão', async () => {
    bancada = await montarBancada()
    await prepararTurmaDeTeste(bancada.repositorio, bancada.config)

    const matriculados = await bancada.repositorio.listarMatriculados(TURMA_DE_TESTE)
    expect(matriculados).toHaveLength(12)

    const vinculos = await bancada.repositorio.listarVinculos()
    expect(vinculos.filter((v) => v.papel === 'aluno')).toHaveLength(12)
    expect(vinculos.some((v) => v.papel === 'professor' && v.sintetico)).toBe(true)

    const sessao = await bancada.repositorio.sessaoAberta()
    expect(sessao?.turma).toBe(TURMA_DE_TESTE)
  })

  // Achado ao vivo em 22/09/2026: sem isto, `decidirRota` pede o
  // cronograma antes de mostrar a chamada — turma sem grade vem antes de
  // sessão aberta, na ordem de perguntas de `nucleo/rota.ts`.
  it('marca a turma como "horário adiado" — nunca pede o cronograma', async () => {
    bancada = await montarBancada()
    window.localStorage.clear()
    await prepararTurmaDeTeste(bancada.repositorio, bancada.config)
    expect(horariosAdiados()).toContain(TURMA_DE_TESTE)
  })

  it('recusa se há uma chamada de verdade aberta — nunca fecha aula alheia', async () => {
    bancada = await montarBancada()
    await bancada.repositorio.abrirSessao({
      turma: 'IF685 · T01',
      abertaEm: new Date().toISOString(),
      uidHashProfessor: 'prof',
    })

    await expect(prepararTurmaDeTeste(bancada.repositorio, bancada.config)).rejects.toThrow('IF685 · T01')

    // Nada foi tocado: a sessão real continua lá, intacta.
    const sessao = await bancada.repositorio.sessaoAberta()
    expect(sessao?.turma).toBe('IF685 · T01')
    expect(await bancada.repositorio.listarMatriculados(TURMA_DE_TESTE)).toHaveLength(0)
  })

  it('é idempotente: rodar duas vezes não duplica vínculo nem turma', async () => {
    bancada = await montarBancada()
    await prepararTurmaDeTeste(bancada.repositorio, bancada.config)
    await prepararTurmaDeTeste(bancada.repositorio, bancada.config)

    expect(await bancada.repositorio.listarMatriculados(TURMA_DE_TESTE)).toHaveLength(12)
    const vinculos = await bancada.repositorio.listarVinculos()
    expect(vinculos.filter((v) => v.papel === 'aluno')).toHaveLength(12)
    expect(vinculos.filter((v) => v.papel === 'professor' && v.sintetico)).toHaveLength(1)
  })

  it('já com a sessão de teste aberta, preparar de novo não abre uma segunda', async () => {
    bancada = await montarBancada()
    await prepararTurmaDeTeste(bancada.repositorio, bancada.config)
    const primeira = await bancada.repositorio.sessaoAberta()

    await prepararTurmaDeTeste(bancada.repositorio, bancada.config)
    const segunda = await bancada.repositorio.sessaoAberta()

    expect(segunda?.abertaEm).toBe(primeira?.abertaEm)
  })
})
