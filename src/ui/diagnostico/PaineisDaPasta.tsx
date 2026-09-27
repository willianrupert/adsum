// O que o Diagnóstico mostra do que vai para a pasta e de quem é reconhecido:
// o segredo dos crachás, o diário, os códigos dos crachás e o modo de ensaio.

import { useEffect, useState } from 'react'
import { CAMINHO_DA_AUDITORIA } from '../../ambiente/auditoriaDeUids.ts'
import { caminhoDoDiario, linhasDoDiario } from '../../ambiente/diario.ts'
import { auditoriaDeUidsLigada, definirAuditoriaDeUids, definirModoDev } from '../../ambiente/preferencias.ts'
import { saisConhecidos } from '../../nucleo/hash.ts'
import type { Config, Vinculo } from '../../nucleo/tipos.ts'
import { Linha, Painel, Selo } from '../componentes/Painel.tsx'

/**
 * Sempre aberto: é o único painel que fala de aluno que pode deixar de ser
 * reconhecido, a pior perda que o app tem (17/09/2026).
 */
export function PainelDoSegredo({ config, semSal }: { config: Config; semSal: Vinculo[] }) {
  return (
    <Painel titulo="Segredo dos crachás" legenda="O que liga cada crachá ao seu dono.">
      <Linha rotulo="segredos guardados">
        <code>{saisConhecidos(config).length}</code>
      </Linha>
      <Linha rotulo="crachás sem segredo">
        <Selo tom={semSal.length === 0 ? 'ok' : 'grave'}>{semSal.length}</Selo>
      </Linha>
      {semSal.length > 0 && (
        <p className="ferramentas__nota">
          Estes crachás foram cadastrados com um segredo que este navegador não tem, e por isso
          não são reconhecidos: {semSal.map((v) => v.nome).join(', ')}. Ligue a pasta do cofre de
          onde eles vieram, ou importe o arquivo de crachás, e eles voltam sozinhos. Se nenhum dos
          dois existir, cada um encosta o crachá de novo uma vez.
        </p>
      )}
    </Painel>
  )
}

/** As linhas desta abertura do app; o arquivo inteiro, um por dia, fica na pasta. */
export function PainelDiario() {
  // Relido a cada segundo: o diário cresce enquanto a tela está aberta.
  const [, setVolta] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setVolta((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [])
  const linhas = linhasDoDiario()
  return (
    <Painel
      titulo="Diário"
      recolhivel
      legenda={`Cada leitura, decisão e erro. Na pasta, em ${caminhoDoDiario('AAAA-MM-DD')}.`}
    >
      {linhas.length === 0 ? (
        <p className="ferramentas__nota">Nada registrado desde que o app abriu.</p>
      ) : (
        <pre className="diario">{[...linhas].slice(-60).reverse().join('\n')}</pre>
      )}
    </Painel>
  )
}

/** Sempre à vista enquanto ligado: guardar o UID é exceção da fase de testes (22/09/2026). */
export function PainelCodigosDosCrachas() {
  const [ligada, setLigada] = useState(auditoriaDeUidsLigada)
  return (
    <Painel titulo="Códigos dos crachás" legenda={`Na pasta, em ${CAMINHO_DA_AUDITORIA}.`}>
      <Linha rotulo="guardar o código de cada crachá">
        <Selo tom={ligada ? 'alerta' : 'ok'}>{ligada ? 'ligado' : 'desligado'}</Selo>{' '}
        <button
          onClick={() => {
            definirAuditoriaDeUids(!ligada)
            setLigada(!ligada)
          }}
        >
          {ligada ? 'Desligar' : 'Ligar'}
        </button>
      </Linha>
      <p className="ferramentas__nota">
        {ligada
          ? 'Ligado para a fase de testes. Com o código guardado, nenhum aluno precisa recadastrar o crachá, mas quem tiver este arquivo consegue copiar crachás. Não compartilhe a pasta com quem não precisa.'
          : 'Desligado. Os crachás continuam funcionando normalmente; só o código deixa de ser guardado.'}
      </p>
    </Painel>
  )
}

/**
 * Por último, e discreto. Recarrega a página: a lista de leitores e o padrão
 * são lidos na montagem.
 */
export function PainelModoDeEnsaio({ ensaio }: { ensaio: boolean }) {
  return (
    <Painel
      titulo="Modo de ensaio"
      recolhivel
      legenda="Leitor simulado, teclas de ensaio, semear e apagar."
      acoes={
        <button
          className={ensaio ? 'botao--grave' : undefined}
          onClick={() => {
            definirModoDev(!ensaio)
            location.reload()
          }}
        >
          {ensaio ? 'Desligar' : 'Ligar'}
        </button>
      }
    >
      <Linha rotulo="estado">
        <Selo tom={ensaio ? 'alerta' : 'ok'}>{ensaio ? 'ligado' : 'desligado'}</Selo>
      </Linha>
      <p className="ferramentas__nota">
        Desligado, o Adsum é só a chamada: leitores de verdade, nenhuma tecla
        que marque presença sem crachá, e nada que invente dado. Ligado, aparecem o
        leitor simulado, <kbd>espaço</kbd> e <kbd>P</kbd> para ensaiar, e os botões de
        semear e apagar.
      </p>
    </Painel>
  )
}
