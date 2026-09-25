# Falhas em sala: o mapa

Documento vivo. Revisto em 25/09/2026. Toda falha nova com aluno na frente
entra aqui, com causa provada nos dados, conserto e o teste que segura.

Tudo o que deu errado com alunos na frente, de 15 a 22/09/2026: o que se viu,
por que aconteceu, o que mudou e qual teste impede a volta. Reconstruído a
partir do cofre do professor, e não de memória: os logs de `registros/`
guardam `evento_id`, hora e `uid_hash`, e isso bastou para achar cada causa.

Serve para duas coisas: responder "isso já foi resolvido?" sem reabrir a
investigação, e mostrar o que um defeito novo precisa ter antes de ser dado
como fechado: causa provada nos dados, conserto, e um teste que falha sem ele.

## O que se viu, e a causa

| # | Quando | O que o professor viu | Causa | Onde estava |
|---|---|---|---|---|
| 1 | 15/09 | Parou de associar crachás no meio da chamada, sem erro | Atraso de processamento medido como atraso de digitação: rajada recusada como humana | `LeitorTeclado` (`performance.now()`) |
| 2 | 17/09, manhã | Dongle apita, nada na tela; resolveram reinstalando o app | **Não determinada.** Não havia diário; os dados daquela manhã não bastam para dizer | — |
| 3 | 17/09, manhã | (invisível na hora) Turma inteira recadastrada num sal que sumiu ao reabrir | Reinstalar sorteou um sal; religar a pasta trocou o sal **na base**, mas a tela seguiu com a cópia em memória | `Fluxo` + `restaurar` |
| 4 | 17/09, tarde | Dongle apita, nada acontece (atribuído ao foco da janela) | `evento_id` repetido: contadores diferentes por tela, recusa engolida calada | `TelaAula` × `Fluxo` |
| 5 | 22/09 | A chamada abriu sozinha quando um crachá foi encostado na tela inicial | O Enter que o dongle manda no fim do UID disparava o atalho "Enter começa a chamada" | `Fluxo` (atalho de 17/09 à noite) |
| 6 | 22/09 | Quase todo aluno "sem dono", inclusive quem cadastrou na aula anterior | Consequência de **3**: os vínculos de 17/09 estavam num sal perdido | — |
| 7 | 22/09 | Por volta do 30º aluno, escolher o nome não contava nada; "Presente" não fazia nada | Consequência de **4**: o contador da tela chegou ao id que a abertura já tinha usado (0063→0098) e travou | — |
| 8 | 22/09 | Encerrar e reabrir: chamada zerada | A contagem começava na abertura, não no dia | `TelaAula` (regra, não defeito) |
| 9 | 22/09 | Reabriu, funcionou para um aluno, travou de novo | **4** outra vez: 0099 livre, 0100 já usado | — |
| 10 | 22/09 | (invisível) Presenças no CSV que a base não tinha; planilha de faltas marcando falta | Consequência de **4**: a linha ia para o arquivo mesmo com a base recusando | — |

**Riscos achados sem terem acontecido ainda**, na mesma investigação:

| # | Risco | Onde estava |
|---|---|---|
| A | Com a busca de "de quem é?" aberta, o Enter do crachá seguinte podia escolher o nome destacado (só quando os 3 primeiros dígitos do UID coincidissem com o começo de uma matrícula, ~0,5%). Nenhum sinal disso nos dados de 22/09 | `Busca` |
| B | Ligar uma pasta a uma base que já tinha dados apagava da pasta os vínculos que só ela tinha | `Fluxo` + `sincronizar` |
| C | Restaurar descartava calado as linhas de `evento_id` repetido | `restaurar` |
| D | A versão nova do app recarregava a página sozinha, inclusive no meio da chamada | `main.tsx` |
| E | Com a regra "fechar o app fecha a chamada", um F5 também fecharia | `fecharChamadaDeAntes` |
| F | Qualquer lugar que mudasse o chaveiro de sais sem reler a cópia da tela repetia **3** | `identificarCracha` |
| G | O ponto azul da grade nunca acendia com o app aberto desde antes da aula | `Fluxo` (`comecarEm`) |

## O que mudou, e o teste que segura

| # | Conserto | Teste que falha sem ele |
|---|---|---|
| 1 | `evento.timeStamp` no lugar de `performance.now()` | `LeitorTeclado.test.ts`, `TelaAula.escala.test.tsx`, rig físico |
| 2 | Diário de diagnóstico (`diagnostico/<dia>.log`): a próxima ocorrência diz a causa | `diario.test.ts` |
| 3, 6, F | Chaveiro de sais: nenhum sal é descartado, e o crachá é procurado em todos, lidos da base a cada leitura | `Incidente2209.test.tsx` (reinstalar), `AulaReal2209.test.tsx` |
| 4, 7, 9 | `gravarEventoNovo`: um caminho só, sobe até o id estar livre | `Incidente2209.test.tsx`, `AulaReal2209.test.tsx` (a chamada no mesmo dia, com a mesma instalação), cenário físico "Chamada com histórico" |
| 5, A | O `LeitorTeclado` marca o Enter do crachá; os atalhos ignoram Enter marcado | `Incidente2209.test.tsx` (dongle de verdade no repouso) |
| 8 | Uma chamada por turma por dia | `Incidente2209.test.tsx` |
| 10, C | `importarEventos` traz toda linha; `conferirLog` iguala arquivo e base nos dois sentidos | `sincronia.test.ts`, `AulaReal2209.test.tsx` |
| B | `mesclarDaPasta` | `sincronia.test.ts` |
| D, E | `chamadaViva` no `sessionStorage`: recarregar mantém a chamada, e a versão nova espera ela terminar | `Incidente2209.test.tsx` |
| G | A grade é reavaliada pelo relógio | **Sem teste próprio ainda** de "acende quando a hora chega"; os testes do repouso só cobrem o ponto com a hora já certa (conferido em 25/09) |

## Por que a suíte não pegou antes

Todos os defeitos acima dependem de **histórico**: duas turmas cunhando ids
no mesmo dia, uma reinstalação no meio da semana, um sal que mudou, linhas
repetidas no log. A suíte começava sempre de base limpa, e o rig físico
também: a turma de teste dele nasce vazia. Com uma turma só e um sal só, as
contagens coincidem e nenhum desses caminhos é exercitado.

Duas mudanças fecham isso:

- **`testes/cofres/`**: cofres reais anonimizados por
  `scripts/anonimizar_cofre.py` (ids, horários e repetições originais; nomes,
  matrículas, hashes e sal inventados, com o próprio script recusando gravar se
  sobrar um valor original). `AulaReal2209.test.tsx` refaz a chamada sobre
  ele. Rodada contra a versão que estava no ar em 22/09 de manhã, a chamada
  trava nos primeiros crachás, como travou na sala.
- **"Chamada com histórico"** na suíte física: antes de o ESP32 disparar,
  ocupa os ids em que os crachás cairiam e cadastra um crachá num sal antigo,
  e confere **na base** se cada disparo foi gravado. Os outros cenários só
  olhavam o leitor, e em 22/09 o leitor leu tudo.

Todo cofre novo que vier de uma aula com problema deve virar um arquivo em
`testes/cofres/` antes do conserto: é o jeito de garantir que o conserto foi
testado no estado em que o problema aconteceu.

## Depois de 22/09: o que o ensaio achou antes da sala

Nenhum destes chegou a uma aula. Foram achados em 23/09, pelo ensaio da
versão publicada sobre a cópia do cofre do professor e pela fila de 300
crachás no rádio (emulador C3 + dongle). Estão aqui porque, sem o ensaio,
teriam chegado.

| # | Onde apareceu | O que se viu | Causa | Conserto | Teste |
|---|---|---|---|---|---|
| H | Fila de 300, 0,72 s por crachá | 4 alunos em ~110 recusados como "dois crachás quase juntos" a 0,7 s do anterior | Com a aba ocupada, a identificação de um crachá terminava depois da do seguinte; o intervalo negativo passava por menor que 400 ms | Identificar e decidir andam em fila, na ordem de chegada; intervalo negativo nunca é recusa | `sessao.test.ts`, `TelaAula.test.tsx` |
| I | Fila de 300 | Cinco encerramentos em 2,5 s | A tela demorava a responder e cada clique em Encerrar gravava um | Um clique só | `TelaAula.test.tsx` |
| J | Ensaio, passo 2 | "Remover crachá" parecia não fazer nada | 32 alunos com um vínculo em cada sal; o botão apagava o primeiro que achasse, às vezes o morto | Apaga todos os vínculos da pessoa | `TelaAula.test.tsx` |
| K | Ensaio, passo 2 | "Não presente" e depois o crachá: o contador não voltava | A regra supunha a correção sempre depois do crachá | Crachá gravado depois da remoção devolve a presença; a ordem vem do número do evento | `faltas.test.ts` |
| L | Ensaio, passo 6 | Os primeiros dígitos de cada crachá caíam no campo de busca | O leitor só reconhece a rajada depois de alguns caracteres | A cada crachá lido com a busca aberta, os dígitos saem do campo | `TelaAula.test.tsx` |
| M | Ensaio, passo 6 | Um segundo crachá desconhecido tomava o lugar do primeiro, em silêncio | A busca aceitava trocar de alvo | Uma busca por vez: o segundo é recusado com aviso | `TelaAula.test.tsx` |

**Não consertado, e registrado:** na mesma fila de 300, a tela ficou até ~2 s
atrás da fila. Nada se perdeu (300 de 300), mas o redesenho de cada crachá
esperava os anteriores. Nenhuma turma real tem 300; está em
`docs/00_roadmap.md`.

## 24/09: a primeira aula limpa

CIN0144, versão `39830c2`, lida pelo zip da pasta do professor. 46 presentes
(36 por crachá, 9 pela busca, 1 à mão). Nenhuma recusa, nenhum "rápido
demais", nenhuma busca interrompida, nenhum erro, nenhum `evento_id`
repetido. A conferência trouxe de volta, na primeira abertura, as 19 + 13
leituras que a versão antiga tinha descartado.

Por crachá, no pior caso: 13 ms para identificar, 7 para gravar, 48 para a
tela. Fila de gente: 45 alunos em 5 min 19 s.

É a primeira das quatro semanas limpas (`CLAUDE.md`, "Como uma mudança chega à
sala").
