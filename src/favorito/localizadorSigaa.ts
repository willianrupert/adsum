// Onde estão os dados e as células na planilha de frequência do SIGAA
// ("Lançar Freq. em Planilha"). Tudo o que depende do HTML do SIGAA mora
// aqui; a descrição da página está em `docs/12_planilha_sigaa.md`.

import type { Localizador } from './paginaSigaa.ts'

/** O texto de uma variável que o servidor escreveu num `<script>` da página. */
function daPagina(documento: Document, padrao: RegExp): string | undefined {
  for (const script of documento.querySelectorAll('script')) {
    const achado = padrao.exec(script.textContent ?? '')
    if (achado) return achado[1]
  }
  return undefined
}

const textoDeVariavel = (documento: Document, nome: string) => daPagina(documento, new RegExp(`var ${nome} = "([^"]*)"`))
const dataDeVariavel = (documento: Document, nome: string) => daPagina(documento, new RegExp(`${nome} = new Date\\("([^"]*)"\\)`))

/** `ID_MAT` de cada linha, na ordem da página: a mesma das linhas da leitura. */
const ordens = new WeakMap<Document, string[]>()
function idsDasLinhas(documento: Document): string[] {
  const guardado = ordens.get(documento)
  if (guardado) return guardado
  const ids = [...new Set((textoDeVariavel(documento, 'auxAlunos') ?? '').split(';').filter(Boolean).map((r) => r.split(',')[0]))]
  ordens.set(documento, ids)
  return ids
}

/** A célula de um aluno numa aula: as duas classes que a página lhe dá (`docs/12`). */
const celulaDe = (documento: Document, id: string, aula: number) =>
  (documento.getElementsByClassName(`aluno_${id} aula_${aula}`)[0] as HTMLElement | undefined) ?? undefined

/** O texto de agora da célula; aberta em edição, o valor do campo. */
function textoDaCelula(td: Element): string {
  const aberta = td.querySelector('input')
  return aberta ? aberta.value : (td.textContent ?? '')
}

export const LOCALIZADOR_SIGAA: Localizador = {
  extrair(documento) {
    if (!documento.getElementById('planilha') || !documento.getElementById('form:frequencias')) return undefined
    const auxAulas = textoDeVariavel(documento, 'auxAulas')
    const auxAlunos = textoDeVariavel(documento, 'auxAlunos')
    const inicio = dataDeVariavel(documento, 'dataInicioPeriodoLetivo')
    const fim = dataDeVariavel(documento, 'dataFimPeriodoLetivo')
    const legenda = documento.querySelector('legend')?.textContent?.trim()
    if (!auxAulas || !auxAlunos || !inicio || !fim || !legenda) return undefined
    ordens.delete(documento)
    const aulas = auxAulas.split(';').filter(Boolean).length
    const textos: Record<string, string[]> = {}
    for (const id of idsDasLinhas(documento)) {
      textos[id] = Array.from({ length: aulas }, (_, n) => {
        const td = celulaDe(documento, id, n)
        return td ? textoDaCelula(td) : ''
      })
    }
    return { legenda, periodo: { inicio, fim }, auxAulas, auxAlunos, textos }
  },

  celula(documento, linha, coluna) {
    const id = idsDasLinhas(documento)[linha]
    if (id === undefined || !Number.isInteger(coluna) || coluna < 0) return undefined
    return celulaDe(documento, id, coluna)
  },

  // A coleta do Gravar e do salvamento automático reescreve este campo (`docs/12`).
  marcoDeColeta: (documento) => (documento.getElementById('form:frequencias') as HTMLInputElement | null)?.value,

  // Os totais da linha, pela função da própria página, se ela existir: é o que
  // um clique do professor também faria. Não envia nada.
  depoisDeEscrever(documento, celula) {
    const janela = documento.defaultView as (Window & { calcularFaltas?: (linha: unknown) => void; J?: (x: unknown) => unknown }) | null
    const linha = celula.parentElement
    if (!janela?.calcularFaltas || !janela.J || !linha) return
    try {
      janela.calcularFaltas(janela.J(linha))
    } catch {
      // Os totais são só a conta na tela; o que vai no Gravar é o texto da célula.
    }
  },
}
