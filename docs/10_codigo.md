# 10 — O código

Documento vivo. Criado em 25/09/2026, quando os comentários do código deixaram
de contar história. O código diz o que garante, em uma ou duas frases; o
**porquê** longo mora aqui, módulo por módulo; a história datada está em
`docs/04_historico.md`, e cada falha em sala em `docs/06_falhas_em_sala.md`.

## As camadas

```
nucleo/       domínio puro: regras, formatos, decisões. Sem React, sem Dexie.
portas/       LeitorDeCracha, Repositorio: o que o domínio precisa do mundo
adaptadores/  LeitorTeclado, LeitorSerial, LeitorWebNfc, LeitorSimulado, RepositorioDexie
ambiente/     o navegador: pasta, diário, sincronia, preferências, som, agendador
ui/           telas; ui/hooks, ui/aula, ui/ajustes e ui/diagnostico guardam as peças
```

`ui/adsum.ts` é o único lugar que escolhe adaptadores. Uma tela que importa um
adaptador direto é bug de camada.

A casca (`ui/Fluxo.tsx`) decide a rota (`nucleo/rota.ts`) e monta a tela. O
estado dela vem de hooks, um por assunto:

| Hook | O que guarda |
|---|---|
| `useBase` | turmas, pendentes, sessão, grade e pendências lidas da base; `recontar` |
| `usePasta` | a pasta, a permissão, a falha de gravação; gravar, consertar, conferir |
| `useEscolhaDaChamada` | a turma e o dia do repouso, a sugestão da grade |
| `useAbertura` | abrir a chamada (botão, Enter, crachá do professor) e a antessala |
| `useTeclasDeEnsaio`, `useDiarioDoApp`, `useRecadoPassageiro`, `useFocoDaJanela` | o resto, cada um com uma coisa só |

A tela da chamada (`ui/TelaAula.tsx`) guarda a ordem das coisas no caminho de
um crachá. As regras dela estão em `nucleo/chamada.ts`; o que ela grava, em
`ui/aula/acoes.ts`; e o que ela desenha, em `ui/aula/` (contador, cartão de
"Chamar nomes", professores, lista de alunos).

## O caminho de um crachá

1. **O leitor.** O `LeitorTeclado` separa o dongle de uma pessoa pelo ritmo,
   medido com `evento.timeStamp` (a hora de chegada da tecla, não a de
   processamento). Marca com `preventDefault` o Enter que fecha a rajada, para
   nenhum atalho de Enter reagir a ele. Rajada que quase era crachá e foi
   recusada toca e avisa na tela.
2. **A antessala.** Se a chamada está abrindo, a leitura espera em
   `ui/antessala.ts` e a tela da chamada a processa ao montar. Sem isso, o
   repouso a ouvia e só dizia "foi lido".
3. **Identificar e decidir, em fila.** Na ordem de chegada: `identificarCracha`
   procura o crachá em todos os sais do chaveiro, lidos da base (em cache no
   adaptador), e `MemoriaDaFila.decidir` decide e marca "já passou" antes de
   qualquer `await`.
4. **A resposta.** Desconhecido abre a busca, uma de cada vez. Cadastro grava
   o vínculo antes do evento. O recado de "dois crachás juntos" aparece já.
5. **Gravar.** `gravarEventoNovo` grava na base com o número reservado; depois
   o evento vai para o log da pasta (`acrescentarNoLog`, em fila por arquivo).
   **O bipe vem depois disso**: quer dizer "está salvo".
6. **Recalcular.** A tela relê a chamada, e a casca reconta a base e reescreve
   a pasta. As duas coisas passam por um agendador que coalesce: uma rajada de
   crachás vira uma ou duas execuções.
7. **O diário.** Uma linha por crachá, com os tempos de identificar, gravar e
   redesenhar, em `diagnostico/<dia>.log`, gravada em lote.

## Garantias sob carga

Em 25/09/2026, com a pergunta "o Adsum aguenta carga?", um teste passou a
responder: `ui/Carga.test.tsx` monta o app inteiro com a pasta ligada, uma
turma de 300 já cadastrada, e dispara 300 crachás a cada 20 ms reais. Isso é
bem mais depressa que qualquer fila de gente. O teste confere, no disco, que o
log e a planilha de faltas terminam com os 300.

Na primeira execução, o teste não terminou em 180 s e perdeu um crachá. O que
ele achou, e o que segura cada garantia:

| Garantia | Onde | O que acontecia sem ela | Teste |
|---|---|---|---|
| Gravações no mesmo arquivo andam em fila | `ambiente/pasta.ts` | Acréscimos simultâneos perdiam linha: `createWritable` troca o arquivo inteiro no `close`, e de 50 sobrava 1 | `pasta.test.ts` |
| Recálculo coalescido, uma execução por vez | `ambiente/agendador.ts` | Cada crachá reescrevia a pasta em paralelo; a foto mais velha podia fechar por último | `agendador.test.ts` |
| A lista da turma é indexada uma vez por render | `nucleo/chamada.ts` (`indiceDeVinculos`), `TelaAula` | Checar nome repetido era n³: ~630 ms de desenho por crachá com 300 | `Carga.test.tsx` |
| Arrays estáveis entre a casca e a chamada | `Fluxo` (`useMemo`) | Arrays novos a cada render invalidavam toda a memoização da chamada | `Carga.test.tsx` |
| A memória da fila guarda o crachá em gravação | `MemoriaDaFila` | Uma releitura do log iniciada antes da gravação o tirava do "já passou" | `chamada.test.ts` |
| Leituras da abertura esperam na antessala | `ui/antessala.ts` | O crachá encostado logo depois do clique caía no repouso | `antessala.test.ts`, `Carga.test.tsx` |
| O resumo esquece a sessão na hora | `useBase.esquecerSessao` | Por um instante, a chamada ficava montada por baixo do resumo | `Fluxo.test.tsx` |
| Identificar e decidir na ordem de chegada | `TelaAula` | Crachá comparado com um que chegou depois dele: "rápido demais" falso (23/09) | `TelaAula.test.tsx` |
| Número de evento reservado, não contado | `Repositorio.gravarEventoNovo` | Dois ids iguais, e a base recusando calada (22/09) | `Incidente2209.test.tsx` |
| O diário não parte linha nem duplica lote | `ambiente/diario.ts` | Erro com quebra de linha partia o registro; falha no meio do lote gravava o dia duas vezes | `diario.test.ts` |

Depois: ~35 ms de processamento por crachá no jsdom, os 300 em ~18 s. O
jsdom é mais lento que o Chrome para desenhar e não tem disco de verdade, então
o número não é o da sala. O que ele prova é a forma: o custo por crachá não
cresce mais com o tamanho da turma, e nada se perde com a fila mais rápida do
que o app.

**O que continua sem prova:** a máquina do professor, o Chrome de verdade com
uma pasta no iCloud, e o dongle real a esse ritmo. É o ensaio
(`docs/07_ensaio_antes_da_aula.md`) que decide.

## Os módulos, e por que são assim

### `nucleo/sessao.ts`: a decisão

`decidir` é função pura: dado o estado e um crachá, o que fazer. A tela só
desenha o que ela decide.

- **`JANELA_MINIMA_MS` (10 s).** Depois de abrir, o crachá do professor só
  encerra passado esse tempo, senão o segundo toque do mesmo gesto fecha a aula
  que acabou de abrir. Era 60 s, proteção contra um problema que dura dois.
- **`INTERVALO_MINIMO_MS` (400 ms)**, pedido do Prof. Paulo contra dois cartões
  na mesma mão. Começou em 1 s, por estimativa; o autor, que viu a fila,
  corrigiu: no fim da aula as pessoas se encavalam no leitor, e 1 s trava o
  momento de maior pressa. A escolha é assimétrica: errar bloqueando custa um
  toque (o cartão ainda está na mão); errar deixando passar grava presença de
  quem não estava. A primeira medida com crachás reais (23/09) mostrou que é
  **alarme, não trava**: dois cartões juntos fazem o dongle alternar entre 268
  e 1.891 ms, e parte das alternâncias passa. O sinal melhor seria a própria
  alternância (A, B, A, B). A regra não pega quem encosta com calma o crachá
  de um colega; nenhuma regra de tempo pega.
- **Intervalo negativo nunca é recusa.** É ordem de processamento, não mão com
  dois cartões (fila de 300, 23/09).
- **Desconhecido com alguém chamado é cadastro.** Por um dia (11/09) virou
  sempre busca, porque a tela chamava o primeiro pendente sozinha, e confiar
  num nome que ninguém chamou é adivinhar. A correção foi parar de chamar
  sozinho: só o professor chama, e aí confiar é seguro.

### `nucleo/chamada.ts`: a chamada sem tela

- `estadoDaChamada` reconstrói do log quem passou, o contador, a presença do
  dia e as linhas recentes. **Uma chamada por turma por dia**, como no SIGAA:
  vale o dia inteiro, e reabrir é continuar.
- `MemoriaDaFila` é o que precisa estar certo entre dois crachás sem render
  no meio: quem já passou, o último aceito, os intervalos, e quem está em
  gravação.
- `indiceDeVinculos` e `ehDaPessoa`: a regra "matrícula, senão nome" num lugar
  só. Estava escrita à mão em três pontos da tela.

### `nucleo/faltas.ts`: a planilha

- A falta de um dia vale os períodos de 50 min da grade daquele dia da semana
  (o SIGAA conta por aula de 50 min, Portaria Normativa 07/2022), ou 1 sem
  grade. Nunca mais do que a grade confirma.
- A correção à mão mais recente decide. **Crachá gravado depois de um "Não
  presente" devolve a presença** (decidido em 23/09): a regra antiga supunha a
  correção sempre depois do crachá. A ordem vem do número do evento, não do
  `quando`, porque "Ver presenças" grava a correção ao meio-dia do dia
  corrigido.
- Linear em eventos. Refazer o filtro por célula custava 1,3 s por crachá num
  fim de semestre simulado; indexado, 2,3 ms (`docs/05_plano_execucao.md`).
- Colunas: `nome;matricula;<dias>` (a matrícula entrou em 25/09).

### `nucleo/grade.ts` e `nucleo/horarios.ts`: o horário

- **A grade sugere, não abre** (desde 17/09, pedido do Prof. Paulo: a chamada
  quase nunca abria exatamente onde a grade esperava). `turmaDeAgora` diz qual
  turma tem aula agora, se não houver dúvida, e acende o ponto azul.
- Folga de 20 min dos dois lados. Os blocos da noite do CIn são encostados
  (17:00–18:50 e 18:50–20:30): das 18:30 às 19:10 os dois estão "agora", e
  quem dá as duas não recebe sugestão nessa faixa. Diminuir a folga criaria o
  caso pior de não achar aula nenhuma às 12h50 para a aula das 13h.
- Dois catálogos, lidos de grades reais do CIn: a simplificada (blocos de aula
  dupla, segunda a sexta) e a completa (períodos de 50 min, com meio-dia e
  sábado). O meio-dia saiu da simplificada a pedido do autor. **O par da
  noite na completa (18:50–19:40, 19:40–20:30) é inferido**, não conferido.

### `nucleo/rota.ts`: a tela decorre do estado

A ordem das perguntas é a regra: ambiente quebrado, pasta (com saída: uma tela
sem saída é pior que a garantia que protege), conselho de navegador (antes de
existir base, porque o app instalado não enxerga o que ficou na aba), turma,
grade (depois da turma, antes do leitor), leitor, chamada, repouso.

### `portas/Repositorio.ts`: a base

- **Sem `atualizarEvento` nem `removerEvento`**: se a assinatura não existe, o
  bug não se escreve. A grade pode ser reescrita (é intenção, não registro).
- **`gravarEventoNovo` é o único caminho para evento novo.** Em 22/09 cada
  tela contava eventos para numerar, a partir de lugares diferentes; numa base
  com duas turmas cunharam o mesmo id, o `add` recusava, a recusa passava por
  idempotência e o evento sumia calado. O número agora é reservado em
  transação e só anda para frente.
- **`identificarCracha` lê o chaveiro da base a cada crachá.** Em 17/09 a tela
  usava uma cópia do sal lida ao abrir, a restauração trocou o sal na base, e
  a turma inteira foi recadastrada num sal que só existia na memória da aba.
- A marca de sal dos vínculos antigos vai em lote, com o navegador ocioso:
  gravada a cada crachá, fez o teste de 100 alunos perder leitura.
- **Ajustes e auditoria do SIGAA (Dexie v9, branch da v2)** seguem a regra
  dos eventos: `gravarAjusteSigaa` e `acrescentarAuditoriaSigaa`, sem
  atualizar nem remover. Voltar atrás num ajuste é outro ajuste; o mais
  recente vale (`nucleo/lancar/conciliar.ts`).

### `ambiente/pasta.ts`, `sincronia.ts`, `agendador.ts`: o disco

- A pasta é a dona; a base é cache. Os caminhos de ida e volta, e por que cada
  um existe, estão em `docs/01_cofre.md`.
- O log só cresce (`acrescentar`); os JSON são reescritos inteiros. As duas
  operações andam em fila por arquivo.
- `repararLog` reescreve o log e é só para conserto: no caminho normal, com a
  pasta sincronizada, apagaria o que outra máquina gravou.

### `ambiente/diario.ts`: o que aconteceu

Uma linha por fato, sem nome e sem UID (o crachá aparece pelos 8 primeiros
caracteres do hash). Gravado em lote a cada 5 s e ao esconder a aba; nada no
caminho de um crachá espera por ele. `semDono` transforma promessa rejeitada
sem dono em linha do diário.

### `ambiente/preferencias.ts`: esta máquina

No `localStorage`, não no cofre: modo de ensaio, leitor escolhido, "Sou eu",
dispensas. Quem recebe a pasta de um colega não herda nada disso. O modo de
ensaio separa o que prova que o programa funciona (fica escondido) do que
ajuda a descobrir por que não funcionou (o Diagnóstico, que fica no app).

### `adaptadores/leitor/LeitorTeclado.ts`: o dongle

- Ritmo por `evento.timeStamp` (15/09: com a aba ocupada, `performance.now()`
  fazia atraso de processamento parecer digitação humana).
- O Enter da rajada é marcado (22/09: encostar um crachá no repouso abria a
  chamada).
- As recusas são contadas por causa (ritmo ou formato), e a última tecla e as
  perdas de foco ficam no Diagnóstico (17/09: "recusada" e "nunca chegou"
  eram indistinguíveis).
- Só avisa na tela o que quase foi crachá (21/09): quem digita a data num
  campo não pode ver "leitura recusada".

## Comentários: a convenção

- O comentário diz **o que o código garante e por quê**, em uma ou duas
  frases, quando o porquê não é óbvio.
- A história (quem relatou, o que se tentou antes, em que aula) vai para
  `docs/04_historico.md`. Uma data no código só quando ela ancora a decisão:
  "(22/09/2026)" leva o leitor ao histórico.
- Nada de "eu" nem de "o autor pediu": o código não é diário.
- Um comentário que deixou de ser verdade é um defeito, e se corrige no mesmo
  commit que mudou o código.
- Texto de tela segue a voz da interface do `CLAUDE.md`, não a dos
  comentários.

## Base e Diagnóstico: uma composição de painéis

`ui/TelaRepositorio.tsx` (Base, ~200 linhas) e `ui/TelaDiagnostico.tsx`
(~140) só carregam o estado e montam painéis. Cada painel mora em
`ui/ajustes/` ou `ui/diagnostico/` e recebe o que precisa por props; nenhum
lê a base por conta própria além do que o botão dele faz.

Os botões dos dois passam por `useTentativa` (`ui/hooks/`): roda a ação,
mostra o recado (`ok` ou `grave`) e recarrega. Um `confirm` recusado lança
`CANCELADO`, que o `tentar` engole sem recado: desistir não é erro.

As ferramentas do Diagnóstico seguem as regras da base como qualquer tela:
importar registros passa por `importarEventos` (linhas com o mesmo
`evento_id` não somem caladas) e semear numera por `gravarEventoNovo`.
