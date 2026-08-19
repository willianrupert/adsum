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
import { TelaVinculo } from './TelaVinculo.tsx'
import { TelaRepositorio } from './TelaRepositorio.tsx'
import { TelaDiagnostico } from './TelaDiagnostico.tsx'
import { Busca } from './componentes/Busca.tsx'
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
function BuscaDeMentira() {
  const [aberta, setAberta] = useState(false)
  return (
    <>
      <button className="botao--acento pasta__botao" onClick={() => setAberta(true)}>
        Abrir a busca
      </button>
      {aberta && (
        <Busca
          pessoas={PENDENTES}
          aoEscolher={() => setAberta(false)}
          aoDesistir={() => setAberta(false)}
        />
      )}
    </>
  )
}

export function Vitrine() {
  return (
    <div className="vitrine">
      <p className="vitrine__aviso">
        Vitrine de desenvolvimento. Dados inventados; nada aqui grava.
      </p>

      <Cena titulo="Escolha onde guardar" quando="primeira vez, antes de tudo">
        <TelaPasta precisaDePermissao={false} aoEscolher={() => {}} aoLiberar={() => {}} />
      </Cena>

      <Cena titulo="Libere o acesso" quando="voltando numa sessão nova">
        <TelaPasta precisaDePermissao aoEscolher={() => {}} aoLiberar={() => {}} />
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

      <Cena titulo="A turma" quando="nenhuma turma cadastrada">
        <TelaVinculo />
      </Cena>

      <Cena titulo="A aula" quando="dia comum: sem cobrança de crachá">
        <TelaAula
          sessao={{ turma: TURMA, abertaEm: new Date(Date.now() - 22 * 60000).toISOString(), uidHashProfessor: 'x' }}
          pendentes={PENDENTES}
          alunosDaTurma={47}
          aoMudarBase={() => {}}
        />
      </Cena>

      <Cena titulo="A aula, primeiro dia" quando="ninguém tem crachá: a cerimônia é a chamada">
        <TelaAula
          sessao={{ turma: TURMA, abertaEm: new Date(Date.now() - 4 * 60000).toISOString(), uidHashProfessor: 'x' }}
          pendentes={PENDENTES}
          alunosDaTurma={PENDENTES.length}
          aoMudarBase={() => {}}
        />
      </Cena>

      <Cena titulo="Crachá novo" quando="alguém que faltou no primeiro dia chega">
        <BuscaDeMentira />
      </Cena>

      <Cena titulo="Fim da aula" quando="o professor encerrou">
        <TelaResumo
          sessao={{ turma: TURMA, abertaEm: new Date(Date.now() - 47 * 60000).toISOString(), uidHashProfessor: 'x' }}
          presentes={41}
          arquivo="Adsum ▸ registros/IF685-T01.csv"
          aoSalvarCopia={async () => 'gravado'}
          aoConcluir={() => {}}
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

      <Cena titulo="Repouso" quando="tudo pronto, fora de aula">
        <Repouso
          turmas={1}
          pendencias={[]}
          aoIniciar={() => {}}
          aoSalvar={() => {}}
          aoAbrirCerimonia={() => {}}
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
          aoAbrirCerimonia={() => {}}
        />
      </Cena>

      <Cena titulo="Falha na pasta" quando="permissão caiu no meio da aula">
        <div className="aviso aviso--grave">
          <strong>A pasta não recebeu a última gravação.</strong>
          <p>
            Permissão negada. Nada se perdeu — está tudo aqui no navegador. Conserte e o
            Adsum regrava.
          </p>
          <button>Gravar de novo</button>
        </div>
      </Cena>

      <Cena titulo="Base" quando="folha, atrás da engrenagem">
        <TelaRepositorio />
      </Cena>

      <Cena titulo="Qual turma" quando="duas aulas no mesmo horário">
        <EscolherTurma
          opcoes={['IF685 · T01', 'IF669 · T02']}
          motivo="varias"
          aoEscolher={() => {}}
          aoDesistir={() => {}}
        />
      </Cena>

      <Cena titulo="Diagnóstico" quando="folha, quando algo falha">
        <TelaDiagnostico />
      </Cena>
    </div>
  )
}
