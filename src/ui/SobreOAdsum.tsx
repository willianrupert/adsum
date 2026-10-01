// "Sobre o Adsum": quem fez, e por onde encontrar. Abre do crédito da tela
// inicial, que é onde todo professor passa antes de cada aula.
//
// Os links só saem do computador com o clique de quem lê, como todo o resto.

import { REPOSITORIO_URL } from '../nucleo/cofre.ts'
import { Ondas } from './componentes/Simbolos.tsx'

type Pessoa = {
  nome: string
  iniciais: string
  /** A cor do círculo, presa à pessoa e não à posição na lista. */
  cor: 'azul' | 'amarelo'
  papel: string
  apoio: string
  links: { rotulo: string; url: string }[]
}

// Contato só entra aqui com o dono do contato de acordo: este arquivo vai ao
// ar para todo professor que abrir o app. Quem idealizou vem antes de quem
// construiu: é a ordem em que o Adsum aconteceu.
export const PESSOAS: Pessoa[] = [
  {
    nome: 'Prof. Paulo Freitas',
    iniciais: 'PF',
    cor: 'amarelo',
    papel: 'Professor do CIn/UFPE',
    apoio: 'Idealizou a chamada por crachá e a validou em suas turmas.',
    links: [{ rotulo: 'E-mail', url: 'mailto:pfreitas@cin.ufpe.br' }],
  },
  {
    nome: 'Willian Rupert',
    iniciais: 'WR',
    cor: 'azul',
    papel: 'Engenheiro de software',
    apoio: 'Arquitetou e desenvolveu o sistema, do leitor de crachá à planilha.',
    links: [
      { rotulo: 'E-mail', url: 'mailto:wnrj@cin.ufpe.br' },
      { rotulo: 'LinkedIn', url: 'https://www.linkedin.com/in/willianrupert' },
      { rotulo: 'GitHub', url: 'https://github.com/willianrupert' },
    ],
  },
]

export function SobreOAdsum() {
  return (
    <div className="sobre">
      <div className="sobre__marca">
        <Ondas tamanho={48} />
        <p className="sobre__nome">Adsum</p>
        <p className="sobre__lema">O que se responde na chamada.</p>
      </div>

      <ul className="sobre__pessoas">
        {PESSOAS.map((p) => (
          <li className="sobre__pessoa" key={p.nome}>
            <span className={`sobre__avatar sobre__avatar--${p.cor}`} aria-hidden="true">
              {p.iniciais}
            </span>
            <span className="sobre__texto">
              <strong>{p.nome}</strong>
              <span className="sobre__papel">{p.papel}</span>
              <span className="sobre__apoio">{p.apoio}</span>
              {p.links.length > 0 && (
                <span className="sobre__links">
                  {p.links.map((l) => (
                    <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer">
                      {l.rotulo} ›
                    </a>
                  ))}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>

      <p className="sobre__rodape">
        Feito no Centro de Informática da UFPE. Código aberto, licença MIT.{' '}
        <a href={REPOSITORIO_URL} target="_blank" rel="noopener noreferrer">
          Ver no GitHub ›
        </a>
      </p>
    </div>
  )
}
