// "Onde os dados ficam": a pasta, os gestos sobre ela, e o que dizer onde o
// navegador não tem seletor de pasta.

import { comoInstalar, ehWebKit, instalado } from '../../ambiente/instalacao.ts'
import { pastaDisponivel } from '../../ambiente/pasta.ts'
import { Linha, Painel } from '../componentes/Painel.tsx'
import { confirmarOuCancelar, type Tentar } from '../hooks/useTentativa.ts'

/**
 * Sem seletor de pasta são dois casos: no WebKit há prazo (sete dias de uso
 * sem visitar o site e a base some), no Firefox não. Tranquilizar onde se
 * deveria avisar seria o pior defeito desta tela.
 */
function SemPasta() {
  const caminho = comoInstalar()
  const prazo = ehWebKit() && !instalado()

  return (
    <>
      <p className="ferramentas__nota">
        Este navegador não tem seletor de pasta. Só Chrome e Edge têm, e aqui a cópia é
        por sua conta: exporte os arquivos abaixo e guarde-os onde quiser.
      </p>

      {prazo && (
        <p className="ferramentas__nota ferramentas__nota--forte">
          E há prazo: o Safari apaga os dados deste site depois de <strong>sete dias de
          uso dele</strong> sem você voltar aqui, levando a turma junto.
          {caminho && (
            <>
              {' '}
              Instalar o Adsum ({caminho.passos.join(' › ')}) tira o app do Safari e para
              essa contagem. Mas o app instalado começa em branco, então exporte antes e
              importe lá.
            </>
          )}
        </p>
      )}

      {ehWebKit() && instalado() && (
        <p className="ferramentas__nota">
          Instalado, fora do Safari: a base não tem mais prazo de sete dias.
        </p>
      )}

      <p className="ferramentas__nota">
        Para trazer uma base já existente, use <strong>Já tenho uma pasta do Adsum</strong>{' '}
        na tela de colar a turma. Aqui o seletor abre a pasta inteira de uma vez, e ler já
        é um clique só; o que falta é escrever de volta sozinho.
      </p>
    </>
  )
}

export function PainelDaPasta({
  pasta,
  tentar,
  aoTrocarPasta,
  aoRelerPasta,
  aoDesconectarPasta,
}: {
  pasta?: FileSystemDirectoryHandle
  tentar: Tentar
  aoTrocarPasta?: () => void
  aoRelerPasta?: () => Promise<{ arquivos: string[]; problemas: string[] }>
  aoDesconectarPasta?: () => Promise<void>
}) {
  return (
    <Painel
      titulo="Onde os dados ficam"
      recolhivel
      acoes={
        // Sem seletor de pasta, nenhum botão: o navegador não poderia executá-lo.
        aoTrocarPasta &&
        pastaDisponivel() && (
          <>
            {pasta && aoDesconectarPasta && (
              <button
                className="botao--grave"
                onClick={tentar('Desconectar', async () => {
                  confirmarOuCancelar(
                    'Desconectar a pasta? Os arquivos continuam onde estão, e a base continua neste navegador. O Adsum só para de gravar nela.',
                  )
                  await aoDesconectarPasta()
                  return 'a pasta não recebe mais gravação.'
                })}
              >
                Desconectar
              </button>
            )}
            {/* O único gesto de puxar da pasta com a base cheia. Não apaga nada. */}
            {pasta && aoRelerPasta && (
              <button
                onClick={tentar('Reler a pasta', async () => {
                  const { arquivos, problemas } = await aoRelerPasta()
                  if (problemas.length > 0) throw new Error(problemas[0])
                  return `${arquivos.length} arquivos.`
                })}
              >
                Reler a pasta
              </button>
            )}
            <button className={pasta ? undefined : 'botao--acento'} onClick={aoTrocarPasta}>
              {pasta ? 'Trocar de pasta' : 'Escolher pasta'}
            </button>
          </>
        )
      }
    >
      {pasta ? (
        <>
          {/* Só o nome: o navegador não revela o caminho, e isso é proteção. */}
          <Linha rotulo="pasta">
            <strong>{pasta.name}</strong>
          </Linha>
          <Linha rotulo="dentro dela">
            <code>config.json · vinculos.json · turmas/ · registros/</code>
          </Linha>
          <p className="ferramentas__nota">
            O Adsum grava aqui a cada mudança. Procure a pasta pelo nome: o navegador não
            mostra o caminho. O <code>LEIA-ME.txt</code> explica cada arquivo.
          </p>
          <p className="ferramentas__nota">
            <strong>Desconectar</strong> para de gravar, sem apagar nada.{' '}
            <strong>Reler a pasta</strong> traz o que estiver nela e faltar aqui, como o que
            outra máquina gravou pelo iCloud.
          </p>
        </>
      ) : pastaDisponivel() ? (
        <p className="ferramentas__nota">
          Nenhuma pasta escolhida: os dados existem só neste navegador, e somem se você
          limpar os dados do site.
        </p>
      ) : (
        <SemPasta />
      )}
    </Painel>
  )
}
