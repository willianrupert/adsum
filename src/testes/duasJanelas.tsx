// As duas janelas da v2, ligadas como no navegador: o favorito na planilha
// abre a folha, e cada `postMessage` chega ao outro lado com a origem de quem
// mandou. Mandar para outra origem que não a do outro lado é defeito, e
// quebra aqui. Usado pelas jornadas (`ui/sigaa/Jornada*.test.tsx`).

import { render } from '@testing-library/react'
import { PonteJanela } from '../adaptadores/sigaa/PonteJanela.ts'
import type { PaginaDePlanilha } from '../favorito/pagina.ts'
import { lancarPeloFavorito, type Destino } from '../favorito/ligacao.ts'
import { ORIGEM_SIGAA } from '../nucleo/lancar/protocolo.ts'
import type { Repositorio } from '../portas/Repositorio.ts'
import { FolhaSigaa } from '../ui/sigaa/FolhaSigaa.tsx'

const ADSUM = 'https://willianrupert.github.io'
const DESTINO: Destino = { origem: ADSUM, url: `${ADSUM}/adsum/#/sigaa` }

export function clicarNoFavorito(repositorio: Repositorio, pagina: PaginaDePlanilha, agora?: Date) {
  const naPlanilha = new EventTarget()
  const naFolha = new EventTarget() as EventTarget & { opener: unknown }
  const entregar = (alvo: EventTarget, origin: string, source: unknown) => (mensagem: unknown, para: string) => {
    const dono = alvo === naFolha ? ADSUM : ORIGEM_SIGAA
    if (para !== dono) throw new Error(`mensagem para ${para}, mas a janela é de ${dono}`)
    queueMicrotask(() => alvo.dispatchEvent(Object.assign(new Event('message'), { data: structuredClone(mensagem), origin, source })))
  }
  const planilha = { postMessage: (m: unknown, p: string) => entregar(naPlanilha, ADSUM, folha)(m, p) }
  const folha = { postMessage: (m: unknown, p: string) => entregar(naFolha, ORIGEM_SIGAA, planilha)(m, p) }
  naFolha.opener = planilha
  const relogio = agora ? () => agora : undefined

  let desmontar = () => {}
  lancarPeloFavorito({
    pagina,
    janela: naPlanilha,
    destino: DESTINO,
    gerarId: () => crypto.randomUUID(),
    agora: relogio,
    abrir: () => {
      const tela = render(
        <FolhaSigaa repositorio={repositorio} ponte={new PonteJanela(naFolha as unknown as Window)} fechar={() => desmontar()} agora={relogio} />,
      )
      desmontar = () => tela.unmount()
      return folha
    },
  })
  return { fechar: () => desmontar() }
}
