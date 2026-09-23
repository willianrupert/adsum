// Quando o app não pode seguir.
//
// **Aqui ficava a tela de diagnóstico inteira**, e era um erro de desenho: o
// professor colava a lista da turma, dava enter, e caía num painel de nove
// capacidades do navegador, service worker, escopo e relógio. Ele não pediu
// nada disso; ele quer saber o que fazer agora.
//
// O `CLAUDE.md` já dizia a regra e eu a tinha quebrado: diagnóstico é item
// discreto atrás da engrenagem, alcançável quando algo falha — não a tela em
// que se para. O que ele explicava em parágrafo vira uma frase, e o resto fica
// a um clique de quem for consertar.
//
// Uma ação por tela. Aqui a ação é tentar de novo.

import { useEffect, useState } from 'react'
import { levantarCapacidades } from '../ambiente/capacidades.ts'
import type { DiagnosticoLeitor } from '../portas/LeitorDeCracha.ts'
import type { Sessao } from '../nucleo/sessao.ts'
import { useAdsum } from './adsum.ts'

export function TelaProblema({
  aoAbrirAjustes,
  sessao,
  aoTentar,
}: {
  aoAbrirAjustes: () => void
  /**
   * Avisa quem chamou para reperguntar o estado do leitor depois da
   * tentativa. Sem isto, um leitor que **já estava lendo** continuava preso
   * aqui: `iniciar()` não muda estado nenhum, então nenhum aviso é emitido e
   * a tela nunca sai (22/09/2026).
   */
  aoTentar?: () => void
  /**
   * A sessão que já estava aberta quando o leitor caiu.
   *
   * `decidirRota` checa `!lendo` antes de `chamadaAberta` — então o leitor
   * caindo no meio de uma aula joga o professor aqui mesmo com a chamada
   * ainda aberta no banco. Sem saber disso, esta tela dizia "Antes da
   * chamada" bem no meio dela — a frase errada na hora errada. A sessão
   * reaparece sozinha assim que o leitor volta; nada se perde.
   */
  sessao?: Sessao
}) {
  const { leitor } = useAdsum()
  const [diag, setDiag] = useState<DiagnosticoLeitor>()
  const [tentando, setTentando] = useState(false)

  useEffect(() => {
    void leitor.diagnostico().then(setDiag)
  }, [leitor])

  const faltando = levantarCapacidades().filter((c) => c.peso === 'essencial' && !c.presente)

  // Navegador sem o essencial não tem conserto pela tela: nenhum botão daqui
  // instala IndexedDB. Dizer qual peça falta é tudo o que se pode fazer.
  if (faltando.length > 0) {
    return (
      <section className="repouso">
        <p className="repouso__turma">Não dá para seguir aqui</p>
        <p className="repouso__acao">Este navegador não tem o necessário</p>
        <p className="pasta__nota">
          Falta: {faltando.map((c) => c.nome).join(', ')}. {faltando[0].semEla}
        </p>
        <p className="pasta__nota">
          Navegação privada e bloqueio de cookies desligam essas peças em alguns
          navegadores. No Chrome ou no Edge, numa janela normal, o Adsum funciona.
        </p>
      </section>
    )
  }

  const tentar = () => {
    setTentando(true)
    void leitor
      .iniciar()
      .catch(() => {})
      .finally(() => {
        setTentando(false)
        aoTentar?.()
        void leitor.diagnostico().then(setDiag)
      })
  }

  return (
    <section className="repouso">
      <p className="repouso__turma">
        {sessao ? `${sessao.turma} continua aberta` : 'Antes da chamada'}
      </p>
      <p className="repouso__acao">
        {sessao ? 'O leitor caiu no meio da aula' : 'Ligue o leitor de crachá'}
      </p>

      {sessao && (
        <p className="pasta__nota">
          Ninguém foi perdido. Reconecte o leitor e a chamada volta sozinha, do jeito que estava.
        </p>
      )}

      <p className="pasta__nota">
        {diag?.motivo
          ? diag.motivo
          : `O ${leitor.nome} não está lendo. Confira se o dongle está no USB e tente de novo.`}
      </p>

      <button className="botao--acento pasta__botao" onClick={tentar} disabled={tentando}>
        {tentando ? 'Tentando…' : 'Tentar de novo'}
      </button>

      {/* O diagnóstico continua existindo, atrás de um clique de quem for
          consertar. É a diferença entre estar disponível e estar no caminho. */}
      <button className="repouso__link botao--quieto" onClick={aoAbrirAjustes}>
        Trocar de leitor ou ver o diagnóstico
      </button>
    </section>
  )
}
