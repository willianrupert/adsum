// A planilha do SIGAA no jsdom, com a estrutura que `docs/12` descreve, a partir
// de uma planilha anonimizada. Não é o código do SIGAA: é o que ele produz na
// tela, redesenhado por nós, e a coleta do Gravar reescrita pela descrição.
// A prova com o script verdadeiro fica na bancada (passo 18 do `docs/11`).

import type { PlanilhaCapturada } from './planilhaReal.ts'

const ID_MAT = 0
const NUM_FALTAS = 5
const TRANCADO = 11

/** Monta no `documento` a página da planilha: legenda, dados, tabela e formulário. */
export function montarPaginaDaPlanilha(documento: Document, p: PlanilhaCapturada): void {
  const aulas = p.auxAulas.split(';').map((r) => r.split(','))
  const alunos = p.auxAlunos.split(';').map((r) => r.split(','))
  const porAluno = new Map<string, string[][]>()
  for (const r of alunos) porAluno.set(r[ID_MAT], [...(porAluno.get(r[ID_MAT]) ?? []), r])

  const linhas = [...porAluno].map(([id, regs]) => {
    const celulas = regs.map((r, n) => {
      const aula = aulas[n]
      const texto = aula[5] === 'true' || aula[6] === 'true' || aula[9] === 'true' ? '' : r[TRANCADO] === 'true' ? 'T' : r[NUM_FALTAS] === 'null' ? '' : r[NUM_FALTAS]
      return `<td class="celula aluno_${id} aula_${n}">${texto}</td>`
    })
    return `<tr><td class="celula">${regs[0][1]}</td><td class="celula">${regs[0][2]}</td>${celulas.join('')}<td class="celula total">0</td></tr>`
  })

  documento.body.innerHTML = `
    <div id="container"><div id="conteudo">
      <fieldset><legend>${p.legenda}</legend>
        <script>
          var auxAulas = "${p.auxAulas}";
          var auxAlunos = "${p.auxAlunos}";
          var dataInicioPeriodoLetivo = new Date("${p.periodo.inicio}");
          var dataFimPeriodoLetivo = new Date("${p.periodo.fim}");
        </script>
        <div id="basePlanilha"><table id="planilha"><tbody>${linhas.join('')}</tbody></table></div>
        <form id="form" name="form" method="post" action="#">
          <input id="form:frequencias" type="hidden" name="form:frequencias" value="${p.auxAlunos}">
          <input type="submit" value="Gravar Frequências">
        </form>
      </fieldset>
    </div></div>`
}

/**
 * A coleta do Gravar e do salvamento automático, como `docs/12` a descreve:
 * lê o texto de cada célula e, se não estiver vazio, põe no registro. Devolve
 * a string que iria no campo `form:frequencias`, e a grava nele.
 */
export function coletarComoOSigaa(documento: Document): string {
  const campo = documento.getElementById('form:frequencias') as HTMLInputElement
  const registros = campo.value.split(';').map((r) => r.split(','))
  // Uma passada pelas células em vez de uma busca por registro: são 1.710, e
  // no jsdom de um runner do GitHub a busca uma a uma passava do tempo do teste.
  const celulas = new Map<string, Element>()
  for (const td of documento.querySelectorAll('td')) {
    const aluno = [...td.classList].find((c) => c.startsWith('aluno_'))
    const aula = [...td.classList].find((c) => c.startsWith('aula_'))
    const chave = `${aluno} ${aula}`
    if (aluno && aula && !celulas.has(chave)) celulas.set(chave, td)
  }
  const contagem = new Map<string, number>()
  for (const r of registros) {
    const n = contagem.get(r[ID_MAT]) ?? 0
    contagem.set(r[ID_MAT], n + 1)
    const td = celulas.get(`aluno_${r[ID_MAT]} aula_${n}`)
    const entrada = td?.querySelector('input')
    const texto = entrada ? entrada.value : (td?.textContent ?? '')
    if (texto !== '') r[NUM_FALTAS] = texto
  }
  campo.value = registros.map((r) => r.join(',')).join(';')
  return campo.value
}
