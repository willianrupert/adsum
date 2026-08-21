// Todas as telas numa página, sem percorrer o fluxo.
//
// Existe só em desenvolvimento (`#/vitrine`). A rota do app decide sozinha qual
// tela mostrar, o que é ótimo para quem usa e ruim para quem desenha: ver a tela
// de falha da pasta exigiria quebrar a pasta de propósito. Aqui elas ficam lado
// a lado, com dados inventados.

import { useState } from 'react'
import { Repouso } from './Fluxo.tsx'
import { TelaAula } from './TelaAula.tsx'
import { TelaPasta } from './TelaPasta.tsx'
import { TelaNavegador } from './TelaNavegador.tsx'
import { TelaResumo } from './TelaResumo.tsx'
import { EscolherTurma } from './componentes/EscolherTurma.tsx'
import { TelaColarTurma } from './TelaColarTurma.tsx'
import { TelaRepositorio } from './TelaRepositorio.tsx'
import { TelaPresencas } from './TelaPresencas.tsx'
import { TelaDiagnostico } from './TelaDiagnostico.tsx'
import { TelaProblema } from './TelaProblema.tsx'
import { TelaCronograma } from './TelaCronograma.tsx'
import { Busca } from './componentes/Busca.tsx'
import { Baixar } from './componentes/Simbolos.tsx'
import type { Matriculado } from '../nucleo/tipos.ts'

const TURMA = 'IF685 · T01'

const PENDENTES: Matriculado[] = [
  ['20250022729', 'Amanda Trinity', 'AMANDA TRINITY GOMES NASCIMENTO'],
  ['20240004932', 'Andre Vinicius', 'ANDRE VINICIUS NASCIMENTO CRUZ'],
  ['20250023181', 'Antonio Goncalves', 'ANTONIO GONCALVES DE ALBUQUERQUE NETO'],
].map(([matricula, nome, nomeCompleto]) => ({
  turma: TURMA,
  chave: matricula,
  matricula,
  nome,
  nomeCompleto,
  papel: 'aluno' as const,
}))

function Cena({ titulo, quando, children }: { titulo: string; quando: string; children: React.ReactNode }) {
  return (
    <section className="cena">
      <header className="cena__topo">
        <h2>{titulo}</h2>
        <p>{quando}</p>
      </header>
      <div className="cena__tela">{children}</div>
    </section>
  )
}

/**
 * A busca cobre a tela inteira, como deve. Na vitrine isso a tornava uma
 * armadilha: sem `aoDesistir` de verdade, não havia como sair dela. Aqui ela
 * abre e fecha por conta.
 */
/**
 * Aberta de saída.
 *
 * Antes ela começava fechada, atrás de um botão "Abrir a busca" — e quem
 * percorria a vitrine passava reto, sem nunca ver a tela. Numa vitrine, a tela
 * que não aparece sozinha é a tela que não existe.
 *
 * Dá para fechar e reabrir porque desistir também é parte do desenho: quem não
 * quiser vincular na hora fecha, e a leitura fica como crachá não cadastrado.
 */
function BuscaDeMentira() {
  const [aberta, setAberta] = useState(true)
  return aberta ? (
    <Busca
      pessoas={PENDENTES}
      aoEscolher={() => setAberta(false)}
      aoDesistir={() => setAberta(false)}
    />
  ) : (
    <button className="repouso__link botao--quieto" onClick={() => setAberta(true)}>
      Abrir a busca de novo
    </button>
  )
}

const ehDesenvolvimento = import.meta.env.DEV

export function Vitrine() {
  return (
    <div className="vitrine">
      <p className="vitrine__aviso">
        Todas as telas do Adsum numa página só. <strong>Ninguém desta lista existe.</strong>{' '}
        Os nomes são inventados, e nada aqui grava nem altera a sua base.
      </p>

      <Cena titulo="Escolha onde guardar" quando="primeira vez, antes de tudo">
        <TelaPasta
          precisaDePermissao={false}
          aoEscolher={() => {}}
          aoLiberar={() => {}}
          aoDispensar={() => {}}
        />
      </Cena>

      <Cena titulo="Libere o acesso" quando="voltando numa sessão nova">
        <TelaPasta
          precisaDePermissao
          aoEscolher={() => {}}
          aoLiberar={() => {}}
          aoDispensar={() => {}}
        />
      </Cena>

      <Cena titulo="Instale o Adsum" quando="Safari: a base tem sete dias na aba">
        <TelaNavegador
          conselho={{ tipo: 'instalar', onde: 'no Safari', passos: ['Arquivo', 'Adicionar ao Dock'] }}
          aoDispensar={() => {}}
        />
      </Cena>

      <Cena titulo="Use o Chrome" quando="Firefox: sem pasta e sem o que instalar">
        <TelaNavegador conselho={{ tipo: 'trocar' }} aoDispensar={() => {}} />
      </Cena>

      <Cena titulo="O cronograma" quando="logo depois de colar a turma, e pulável">
        <TelaCronograma
          turma={TURMA}
          aulas={[
            { uidHashProfessor: 'x', dia: 3, inicio: '13:00', fim: '14:50', turma: TURMA },
            { uidHashProfessor: 'x', dia: 1, inicio: '15:00', fim: '16:50', turma: TURMA },
          ]}
          uidHashProfessor="x"
          aoSalvar={() => {}}
          aoPular={() => {}}
        />
      </Cena>

      <Cena titulo="Sem leitor" quando="o dongle não respondeu: uma frase e uma ação">
        <TelaProblema aoAbrirAjustes={() => {}} />
      </Cena>

      <Cena titulo="A turma" quando="nenhuma turma cadastrada">
        <TelaColarTurma />
      </Cena>

      <Cena titulo="A aula, sem ninguém pendente" quando="dia comum: sem fila de crachá">
        <TelaAula
          sessao={{ turma: TURMA, abertaEm: new Date(Date.now() - 22 * 60000).toISOString(), uidHashProfessor: 'x' }}
          pendentes={[]}
          daTurma={PENDENTES}
          aoMudarBase={() => {}}
        />
      </Cena>

      <Cena titulo="A aula, com gente pendente" quando="a cerimônia é a chamada: a mesma tela chama e vincula">
        <TelaAula
          sessao={{ turma: TURMA, abertaEm: new Date(Date.now() - 4 * 60000).toISOString(), uidHashProfessor: 'x' }}
          pendentes={PENDENTES}
          daTurma={PENDENTES}
          aoMudarBase={() => {}}
        />
      </Cena>

      <Cena titulo="Crachá novo" quando="crachá desconhecido: quem faltou, ou segunda via">
        <BuscaDeMentira />
      </Cena>

      <Cena titulo="Fim da aula" quando="o professor encerrou">
        <TelaResumo
          sessao={{ turma: TURMA, abertaEm: new Date(Date.now() - 47 * 60000).toISOString(), uidHashProfessor: 'x' }}
          presentes={41}
          arquivo="Adsum ▸ registros/IF685-T01.csv"
          aoSalvarCopia={async () => 'gravado'}
          aoConcluir={() => {}}
          aoReabrir={() => {}}
        />
      </Cena>

      <Cena titulo="Fim da aula, sem pasta" quando="Safari: salvar é a ação, não o adorno">
        <TelaResumo
          sessao={{ turma: TURMA, abertaEm: new Date(Date.now() - 47 * 60000).toISOString(), uidHashProfessor: 'x' }}
          presentes={41}
          aoSalvarCopia={async () => 'baixado'}
          aoConcluir={() => {}}
        />
      </Cena>

      <Cena titulo="Repouso" quando="sem grade: iniciar é a ação">
        <Repouso
          turmas={1}
          pendencias={[]}
          aoIniciar={() => {}}
          aoSalvar={() => {}}
          aoVerPresencas={() => {}}
          aoNovaTurma={() => {}}
        />
      </Cena>

      <Cena titulo="Convite de instalar" quando="Chrome, uma vez só, em qualquer tela">
        <div className="convite">
          <span className="convite__icone" aria-hidden="true">
            <Baixar />
          </span>
          <span className="convite__texto">
            <strong>O Adsum em janela própria</strong>
            <small>Abre num clique, sem procurar entre as abas</small>
          </span>
          <span className="convite__acoes">
            <button className="botao--quieto">Agora não</button>
            <button className="botao--acento">Instalar</button>
          </span>
        </div>
      </Cena>

      <Cena titulo="Repouso com grade" quando="a aula abre sozinha; a tela só espera">
        <Repouso
          turmas={2}
          pendencias={[]}
          proxima={{ turma: TURMA, quando: new Date(Date.now() + 3 * 3600_000) }}
          aoIniciar={() => {}}
          aoSalvar={() => {}}
          aoVerPresencas={() => {}}
          aoNovaTurma={() => {}}
        />
      </Cena>

      <Cena titulo="Repouso com aula por salvar" quando="sem pasta: a chamada só existe aqui">
        <Repouso
          turmas={2}
          pendencias={[
            { turma: TURMA, quantos: 41, desde: '2026-08-19T10:04:00.000Z' },
            { turma: 'IF969 · T02', quantos: 28, desde: '2026-08-18T14:02:00.000Z' },
          ]}
          aoIniciar={() => {}}
          aoSalvar={() => {}}
          aoVerPresencas={() => {}}
          aoNovaTurma={() => {}}
        />
      </Cena>

      <Cena titulo="Falha na pasta" quando="permissão caiu no meio da aula">
        <div className="aviso aviso--grave">
          <strong>A pasta não recebeu a última gravação.</strong>
          <p>
            Permissão negada. Nada se perdeu: está tudo aqui no navegador. Conserte e o
            Adsum regrava.
          </p>
          <button>Gravar de novo</button>
        </div>
      </Cena>

      {/* Estas duas montam com o contexto **de verdade**: seus botões importam,
          zeram grade e apagam tudo — na sua base, não numa de mentira. Numa
          vitrine publicada, apresentar isso como "olhe à vontade" seria uma
          armadilha, então elas ficam só em desenvolvimento. */}
      {ehDesenvolvimento && (
        <Cena titulo="Base" quando="folha, atrás da engrenagem">
          <TelaRepositorio />
        </Cena>
      )}

      {/* Mesmo motivo de "Base": mostra as presenças de verdade de quem abrir
          a vitrine, não dado inventado. Fica só em desenvolvimento. */}
      {ehDesenvolvimento && (
        <Cena titulo="Presenças" quando="repouso fora do horário, sem grade à vista">
          <TelaPresencas aoFechar={() => {}} />
        </Cena>
      )}

      <Cena titulo="Qual turma" quando="duas aulas no mesmo horário">
        <EscolherTurma
          opcoes={['IF685 · T01', 'IF669 · T02']}
          motivo="varias"
          aoEscolher={() => {}}
          aoDesistir={() => {}}
        />
      </Cena>

      {ehDesenvolvimento ? (
        <Cena titulo="Diagnóstico" quando="folha, quando algo falha">
          <TelaDiagnostico />
        </Cena>
      ) : (
        <p className="vitrine__aviso">
          Faltam três: <strong>Ajustes</strong>, <strong>Diagnóstico</strong> e{' '}
          <strong>Presenças</strong>. Elas não aparecem aqui porque mostram ou mexem na
          base de verdade de quem abrir. No Adsum, você as encontra pela engrenagem no
          canto e pelo repouso fora do horário de aula.
        </p>
      )}
    </div>
  )
}
