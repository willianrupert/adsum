// Passar os crachás a outro professor: o arquivo leva os vínculos e os sais.
// Importar junta os sais ao chaveiro daqui, nunca troca o atual.

import { abrirTexto, salvarTexto } from '../../ambiente/arquivos.ts'
import { deJsonCompartilhado, paraJsonCompartilhado } from '../../nucleo/cofre.ts'
import { saisConhecidos } from '../../nucleo/hash.ts'
import type { Config, Vinculo } from '../../nucleo/tipos.ts'
import type { Repositorio } from '../../portas/Repositorio.ts'
import { Painel } from '../componentes/Painel.tsx'
import { comoFoi, type Tentar } from '../hooks/useTentativa.ts'

const ARQUIVO = 'adsum-crachas.json'

export function PainelDeCompartilhar({
  vinculos,
  config,
  repositorio,
  tentar,
  recarregarConfig,
}: {
  vinculos: Vinculo[]
  config: Config
  repositorio: Repositorio
  tentar: Tentar
  recarregarConfig: () => Promise<void>
}) {
  return (
    <Painel
      titulo="Passar os crachás a outro professor"
      recolhivel
      legenda="Quem dá aula para os mesmos alunos não precisa cadastrar tudo de novo."
      acoes={
        <>
          <button
            onClick={tentar('Importar crachás', async () => {
              const arquivo = await abrirTexto()
              if (!arquivo) return 'cancelado.'
              const { conteudo, problemas } = deJsonCompartilhado(arquivo.texto)
              if (!conteudo) throw new Error(problemas[0]?.motivo ?? 'arquivo não reconhecido')
              await repositorio.lembrarSais(saisConhecidos(conteudo))
              for (const vinculo of conteudo.vinculos) await repositorio.gravarVinculo(vinculo)
              await recarregarConfig()
              return `${conteudo.vinculos.length} crachás.`
            })}
          >
            Importar
          </button>
          <button
            onClick={tentar('Exportar crachás', async () =>
              comoFoi(
                await salvarTexto(
                  ARQUIVO,
                  paraJsonCompartilhado({ salHex: config.salHex, saisAnteriores: config.saisAnteriores, vinculos }),
                ),
                ARQUIVO,
              ),
            )}
          >
            Exportar
          </button>
        </>
      }
    >
      <p className="ferramentas__nota">
        O arquivo leva os {vinculos.length} crachás e o segredo que os liga aos nomes. Sem
        ele, a lista chega inútil do outro lado. Quem receber passa a reconhecer os mesmos
        crachás, e os alunos não encostam duas vezes. Trate o arquivo com o mesmo cuidado
        que a lista da turma.
      </p>
    </Painel>
  )
}
