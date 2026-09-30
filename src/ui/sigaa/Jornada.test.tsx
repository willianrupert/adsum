// A v2 de ponta a ponta, sem a página real (`docs/08`, camada 8): o cofre de
// 22/09 (histórico de verdade, anonimizado), a planilha simulada, o favorito
// e a folha conversando por mensagens, com as origens conferidas nos dois
// sentidos. Conferir → preencher → "gravar" → conferir dá tudo confere; uma
// célula mudada à mão vira diferença; aceita, sobrevive a refazer a base.

import { afterEach, describe, expect, it } from 'vitest'
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RepositorioDexie } from '../../adaptadores/repositorio/RepositorioDexie.ts'
import { conferirAuditoriaSigaa } from '../../ambiente/auditoriaSigaaNaPasta.ts'
import { restaurar } from '../../ambiente/restauracao.ts'
import { planilhaDeFaltas } from '../../nucleo/faltas.ts'
import type { BrutoPlanilha } from '../../nucleo/lancar/leitura.ts'
import { comoDia, type LeituraPlanilha } from '../../nucleo/lancar/tipos.ts'
import { AULA_2209, pastaDoCofre } from '../../testes/cofreDeTeste.ts'
import { PaginaSigaaFalsa } from '../../testes/paginaSigaaFalsa.ts'
import { brutoDaLeitura } from '../../testes/planilhaSigaa.ts'
import { clicarNoFavorito } from '../../testes/duasJanelas.tsx'

const TURMA = '2026.2 - TESTE02 - TURMA B'
/** As duas aulas com chamada no cofre, e uma terça sem chamada, que fica como está. */
const DIAS = ['2026-09-17', '2026-09-22', '2026-09-24'].map((d) => comoDia(d)!)

afterEach(() => window.localStorage.removeItem('adsum.modoDev'))

/** O teste mais pesado da suíte (59 alunos, duas janelas): no fim da suíte longa, com a máquina carregada, 1 s não bastou. */
const ESPERA = { timeout: 5000 }

/** A planilha da turma B como o SIGAA a mostraria antes de qualquer lançamento. */
function planilhaVazia(): BrutoPlanilha {
  const alunos = AULA_2209.turmas[TURMA].filter((m) => m.papel === 'aluno')
  const leitura: LeituraPlanilha = {
    id: 'modelo',
    versaoSigaa: '4.15.0.206',
    cabecalhoTurma: 'TESTE02 - DISCIPLINA INVENTADA - Turma: 01 (2026.2)',
    colunas: DIAS.map((dia, indice) => ({ indice, dia, maximo: 2 })),
    linhas: alunos.map((m, indice) => ({ indice, matricula: m.matricula, celulas: DIAS.map(() => ({ tipo: 'vazia' as const })) })),
  }
  return brutoDaLeitura(leitura)
}

/** A planilha depois do Gravar: o que está nas células vira o lançado. */
function depoisDoGravar(pagina: PaginaSigaaFalsa): BrutoPlanilha {
  const b = structuredClone(pagina.bruto!)
  const coluna = new Map<string, number>()
  b.auxAlunos = b.auxAlunos
    .split(';')
    .map((r) => {
      const campos = r.split(',')
      const i = pagina.ids.indexOf(campos[0])
      const j = coluna.get(campos[0]) ?? 0
      coluna.set(campos[0], j + 1)
      const texto = pagina.valores[i][j]
      if (texto !== 'T') campos[5] = texto === '' ? 'null' : texto
      return campos.join(',')
    })
    .join(';')
  return b
}

describe('lançar no SIGAA, de ponta a ponta, sobre o cofre de 22/09', () => {
  it('conferir, preencher, gravar e conferir de novo; a diferença aceita sobrevive a refazer a base', async () => {
    window.localStorage.setItem('adsum.modoDev', 'sim')
    const usuario = userEvent.setup()
    const pasta = await pastaDoCofre(AULA_2209)
    const repositorio = new RepositorioDexie(`adsum-jornada-${Date.now()}`)
    await repositorio.abrir()
    await restaurar(repositorio, pasta.handle)

    // 1. Primeira conferência: duas aulas com chamada, a terça sem chamada fica como está.
    const pagina = new PaginaSigaaFalsa(planilhaVazia())
    clicarNoFavorito(repositorio, pagina)
    expect(await screen.findByRole('heading', { name: '2 aulas para lançar' }, ESPERA)).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Preencher 2 aulas' }))
    await waitFor(() => expect(pagina.barra?.texto).toMatch(/^Adsum preencheu 2 aulas\./), ESPERA)
    // A folha fecha depois de registrar o preenchimento na auditoria: espera, não supõe.
    await waitFor(() => expect(screen.queryByRole('heading')).not.toBeInTheDocument(), ESPERA)

    // O que foi escrito é a planilha de faltas da pasta, célula por célula.
    const [eventos, matriculados, aulas] = await Promise.all([
      repositorio.listarEventos({ turma: TURMA }),
      repositorio.listarMatriculados(TURMA),
      repositorio.listarAulas(),
    ])
    const v1 = planilhaDeFaltas(eventos, matriculados, aulas, TURMA)
    const matriculaDe = new Map(pagina.bruto!.auxAlunos.split(';').map((r) => [r.split(',')[0], r.split(',')[1]]))
    pagina.ids.forEach((id, i) => {
      const porDia = v1.linhas.find((x) => x.matriculado.matricula === matriculaDe.get(id))!.porDia
      expect(pagina.valores[i][0]).toBe(String(porDia.get(DIAS[0])!.faltas))
      expect(pagina.valores[i][1]).toBe(String(porDia.get(DIAS[1])!.faltas))
      expect(pagina.valores[i][2]).toBe('')
    })

    // 2. O professor grava, e muda uma célula à mão antes: a conferência mostra a diferença.
    const gravada = new PaginaSigaaFalsa(depoisDoGravar(pagina))
    const alguem = gravada.valores.findIndex((v) => v[0] === '0')
    gravada.digitar(alguem, 0, '2')
    clicarNoFavorito(repositorio, gravada)
    expect(await screen.findByRole('heading', { name: '1 diferença para olhar' }, ESPERA)).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Aceitar o SIGAA' }))
    expect(await screen.findByRole('heading', { name: 'Tudo confere' }, ESPERA)).toBeInTheDocument()
    expect(screen.getByText('SIGAA e Adsum iguais em 2 aulas. 1 diferença aceita por você.')).toBeInTheDocument()
    await waitFor(() => expect(gravada.barra?.texto).toBe('Nada a preencher. SIGAA e Adsum já estão iguais.'), ESPERA)
    await usuario.click(screen.getByRole('button', { name: 'Fechar' }))

    // 3. A pasta leva a auditoria; a base refeita da pasta ainda confere.
    await conferirAuditoriaSigaa(repositorio, pasta.handle)
    await repositorio.esvaziarCache()
    await restaurar(repositorio, pasta.handle)
    const ultima = clicarNoFavorito(repositorio, new PaginaSigaaFalsa(depoisDoGravar(gravada)))
    expect(await screen.findByRole('heading', { name: 'Tudo confere' }, ESPERA)).toBeInTheDocument()

    const auditoria = await repositorio.listarAuditoriaSigaa(TURMA)
    expect(auditoria.filter((l) => l.acao === 'preenchimento')).toHaveLength(pagina.escritas)
    expect(auditoria.filter((l) => l.acao === 'aceite')).toHaveLength(1)
    const nomes = matriculados.map((m) => m.nome)
    expect(JSON.stringify(auditoria)).not.toMatch(new RegExp(nomes.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')))
    // A folha desmonta antes de a base fechar: nada dela fica pendente numa base fechada.
    await act(async () => ultima.fechar())
    await act(async () => repositorio.fechar())
  }, 30_000)
})
