# 00 — Roteiro

Documento vivo. Revisto em 25/09/2026.

Seis passos, escritos em 18/08/2026, quando o projeto ainda era o companheiro
do Adsum A1. Cada um terminava em algo que abre no navegador e faz alguma coisa:
nenhum passo existia só como preparação para o próximo. **O A1 deixou de
existir**, e o leitor passou a ser um dongle USB. Os passos continuam aqui,
cada um com o que ficou e o que morreu junto com o aparelho. O que vem depois
está em "Daqui para frente", no fim.

## Onde o projeto está (25/09/2026)

- **Em uso real** pelo Prof. Paulo, em duas turmas (CIN0144 e CIN0114), com o
  dongle USB no computador dele.
- **Versão no ar: `39830c2`**, carimbo `2026-09-23 13:30`.
- **24/09 foi a primeira aula limpa**: nenhuma recusa, nenhum erro, nenhum
  `evento_id` repetido. É a primeira das quatro semanas limpas que liberam
  funcionalidade nova (ver "Como uma mudança chega à sala", no `CLAUDE.md`).
- **Funcionalidade nova congelada.** Só consertos até a quarta semana limpa.
  A v2 (lançar no SIGAA) está desenhada e espera.
- **Na branch `v2/lancar-no-sigaa`, esperando ensaio (25/09):** o trabalho de
  carga e pontos de falha (`docs/10_codigo.md`), a separação de `Fluxo` e
  `TelaAula` em peças, o diário consertado, os comentários curtos e a coluna
  de matrícula na planilha de faltas. Nada disso foi publicado. Ver "Antes de
  publicar a branch", abaixo.

## 1 · Esqueleto, leitor simulado e diagnóstico: **feito**

Vite + React + TypeScript + Dexie, PWA publicado no GitHub Pages. As duas
portas (`LeitorDeCracha`, `Repositorio`) e os primeiros adaptadores
(`LeitorSimulado`, `RepositorioDexie`). Uma tela: diagnóstico.

Por que o diagnóstico veio primeiro, e não a tela bonita: o app depende de APIs
que variam por navegador e por contexto. WebSerial não existe no Firefox,
WebNFC só existe no Chrome Android, quase nada funciona fora de contexto
seguro, e o IndexedDB some em navegação privada. Descobrir isso na frente da
turma é tarde.

Vale o mesmo princípio do firmware: **toda regra precisa de voz na tela**. Lá, a
janela de 60 s recusava em silêncio e era indistinguível de aparelho quebrado.
O princípio sobreviveu ao aparelho e foi o que mais custou manter: as falhas
de setembro foram quase todas recusas caladas (`docs/06_falhas_em_sala.md`).

## 2 · Repositório de verdade: **feito, com outro formato**

Vínculos e grade com edição, importação e exportação. O plano era usar **os
mesmos formatos do cartão** (`uid_hash;papel;nome` e
`hash_prof;dia;hh:mm;hh:mm;turma`), para arrastar arquivos entre o volume
`ADSUM` e o app. Sem aparelho, essa compatibilidade deixou de ter para quem
servir: vínculos, grade e turmas viraram JSON no cofre, e o único CSV que
sobrou é a saída para a planilha. Ver `docs/02_formato.md`.

O **sal de frota** (importar o sal do aparelho) morreu junto. O que ficou do
sal foi a regra de nunca descartar nenhum: `Config.saisAnteriores` é um
chaveiro, e um crachá é procurado em todos (`docs/01_cofre.md`).

Continua valendo, e custou caro aprender: **toda leitura de arquivo relata cada
linha descartada e o motivo**.

## 3 · Cerimônia de vínculo: **feito, e dissolvido na chamada**

O `vincular.html` reescrito: lista colada do SIGAA, **um nome chamado por
vez**. A garantia contra trocar aluno não vem do meio de transporte. Vem de não
haver segundo candidato.

Desde 21/08/2026 a cerimônia não é uma tela. Ela acontece dentro da chamada:
crachá desconhecido com alguém chamado é cadastro e presença no mesmo gesto, e
sem ninguém chamado abre a busca "de quem é?" sobre a turma inteira.

Regras que vieram daqui e continuam no `CLAUDE.md`: o nome exibido é
primeiro + segundo nome; todo mundo entra como aluno e professor é um toque; a
página `Turma › Participantes` é lida por `nucleo/sigaa.ts`, traz nome
completo e matrícula e **confere o total contra o cabeçalho** (`Docentes (2)`,
`Discentes (47)`). O login do SIGAA não é lido.

Os limites de 210 px e 31 bytes mediam o display do A1 e foram removidos.

## 4 · Sessão e coleta: **feito**

A máquina de estados de `Adsum/docs/02` virou a rota (`nucleo/rota.ts`) e uma
tela de chamada (`ui/TelaAula.tsx`). Registros append-only, `evento_id`
reservado por `reservarSequencia` e gravado só por `gravarEventoNovo`.

O que mudou em relação ao desenho original, e por quê:

- **Uma chamada por turma por dia**, como no SIGAA (22/09). Encerrar e reabrir
  continua de onde parou; fechar o app fecha a chamada; recarregar a mesma
  janela não fecha.
- **A grade sugere, não abre** (17/09, pedido do Prof. Paulo). A chamada quase
  nunca abria exatamente onde a grade esperava. O repouso mostra a turma e a
  hora sugeridas, e o professor abre com um gesto: Enter, o botão ou o crachá
  dele.
- **Dois crachás quase juntos** (menos de `INTERVALO_MINIMO_MS`, 400 ms) viram
  `rapido_demais` e um aviso na tela. A primeira medida com crachás reais
  (23/09) mostrou que isso é **alarme, não trava**: dois cartões encostados
  juntos fazem o dongle alternar entre eles, e parte das alternâncias passa
  dos 400 ms.

## 5 · Leitor de verdade: **feito, com outro leitor**

O plano era o `LeitorWebSerial`, falando o protocolo CDC do A1 (`PING`,
`HORA`, `ARMAR`…). **Morreu com o aparelho.** Os leitores que existem hoje,
todos na lista `LEITORES` de `ui/adsum.ts`:

| Adaptador | Leitor | Situação |
|---|---|---|
| `LeitorTeclado` | Dongle USB, HID de teclado | **O de produção.** Conferido com o dongle de verdade em 10/09/2026: decimal de 10 dígitos, big-endian |
| `LeitorWebNfc` | Celular Android com NFC | Experimental. Leu o crachá do CIn em 18/08/2026 |
| `LeitorSerial` | ESP32-C3 + PN532 pelo Web Serial | Software pronto, bancada pausada desde 21/09/2026 por decisão do autor |
| `LeitorSimulado` | Nenhum | Só no modo de ensaio |

Separar o dongle de uma pessoa digitando é trabalho do **ritmo**
(`nucleo/digitacao.ts`), medido com `evento.timeStamp` desde 15/09. Rajada
recusada que quase era crachá toca e avisa na tela desde 21/09; digitação comum
num campo de texto não dispara nada.

Três ferramentas de bancada em `ferramentas/`, nenhuma no caminho do professor:

- `rig-de-cracha/`: ESP32-S3 que digita como o dongle. Comandado pela suíte
  física do Diagnóstico. **O autor não tem mais a placa.**
- `emulador-de-cracha/`: ESP32-C3 + PN532 que vira crachá no campo de rádio,
  para o dongle ler de verdade. Mediu a fila de 300 em 23/09.
- `leitor-serial/`: firmware e diagnósticos do `LeitorSerial`.

## 6 · Saída para a planilha e publicação: **feito, sem o Apps Script**

Com pasta escolhida (Chrome e Edge), cada presença é gravada no ato em
`registros/<turma>.csv`, e `faltas/<turma>.csv` é recalculada a cada mudança:
um aluno por linha, um dia por coluna, pronta para entregar. Sem pasta, a
exportação é manual e o app cobra enquanto houver aula por salvar.

O envio ao Web App do Apps Script não foi feito, e não vai ser: seria dado
saindo do computador sem gesto do professor. PWA instalável e publicado em
`willianrupert.github.io/adsum/`; `#/vitrine` mostra todas as telas com gente
inventada.

O nome continua não trafegando para fora do computador. O que o professor
entrega é a planilha, e entregar é um gesto dele.

## O que este roteiro não faz

- **Não cria backend.** Nem Apps Script. Nada sai do computador sem gesto
  explícito do professor.
- **Não substitui o SIGAA.** Produz uma planilha. Levá-la ao SIGAA é a v2, e
  mesmo lá o Gravar continua sendo do professor.

## Desenho: ideação de 18/08/2026

Registro de uma sessão de ideação, com o que aconteceu a cada ideia.

**Princípio: a rota é o estado.** Não há abas. **Feito**: `nucleo/rota.ts`
decide a tela a partir do estado do app, e `ui/Fluxo.tsx` monta o que ela
devolve. Os seis estados imaginados viraram estes:

1. sem pasta → *escolha onde guardar*. **Feito** (e, no Safari e no Firefox,
   o conselho de navegador no mesmo lugar)
2. sem turma → *cole sua turma*. **Feito**
3. turma sem crachás → cerimônia. **Dissolvida na chamada** (21/08)
4. fora de horário → repouso, com a próxima aula. **Feito**
5. dentro do horário → chamada. **Feito**, aberta por um gesto desde 17/09
6. algo quebrado → o problema e a ação que resolve. **Feito** (`TelaProblema`)

**Uma coisa grande por vez.** Um número ou um nome em corpo enorme; o resto
pequeno e cinza. Acento só para o que acabou de acontecer. **Feito.**

**O som é o feedback primário.** Em fila ninguém olha a tela. **Feito**: Web
Audio, tocado depois de gravar (`docs/03_visual.md`).

**O diagnóstico vira selo discreto** num canto, que só fica alto quando algo
falha. **Feito**: engrenagem, e o aviso do rodapé só quando há o que avisar.

**Nunca perguntar o que dá para saber.** Continua sendo a regra. A exceção
deliberada é abrir a chamada (ver o passo 4).

**Evitar:** vidro sobre fundo variável (contraste é requisito), texto que
explica decisão de projeto, e qualquer pergunta que o app poderia responder.

### Orçamento de toques

O projeto mede flash e pixel em vez de preferir. Vale medir interação também.

| Situação | Planejado em 18/08 | Hoje |
|---|---|---|
| Aula normal, do começo ao fim | **0** | **1**: abrir a chamada (Enter, botão ou crachá do professor). Encerrar é outro, se o professor não usar o crachá |
| Cadastro de um aluno | 1, o crachá dele | O mesmo: o crachá dele, com o nome chamado; ou o crachá e um nome escolhido na busca |
| Primeira configuração | 2: escolher a pasta, colar a turma | O mesmo, mais a grade (opcional) |

O zero virou um porque o professor pediu (17/09): a grade quase nunca batia
com a hora em que ele de fato começava. O custo é um toque; o ganho é a
chamada nunca abrir na turma errada sozinha. O Prof. Paulo abre e encerra
pelo botão e não usa o próprio crachá.

As decorrências que o zero impunha continuam valendo:

- **Não existe "exportar" com pasta.** `registros/` já está no disco o tempo
  todo. Sem pasta, exportar existe e é cobrado.
- **Erro não interrompe a fila.** Crachá desconhecido abre a busca sem travar
  quem vem atrás: crachá conhecido continua contando com ela aberta.
- **Confirmação vira desfazer.** "Não presente", "Remover crachá".
- **Só falar quando há decisão a tomar.**
- **Fechar o notebook no meio não perde o lugar.** Reabrir a mesma turma no
  mesmo dia continua de onde parou.

## Daqui para frente

### Agora: congelamento

Até quatro semanas limpas de uso real, contadas a partir de 24/09/2026.
A régua é o zip da pasta do professor, lido toda sexta: `diagnostico/*.log`
sem recusa, sem `erro_`, sem `desconhecido_durante_busca` inesperado, e a
conferência nas linhas de base (`repetidos=19` em CIN0144, `repetidos=8` em
CIN0114: são os repetidos históricos de 22/09; outro número é problema novo).

Todo deploy passa pelo ensaio de `docs/07_ensaio_antes_da_aula.md`. Toda falha
em sala vira cofre anonimizado, teste que falha, e só então conserto.

### Consertos conhecidos, fora da sala até agora

Nenhum destes aconteceu com aluno na frente. Entram como conserto, com teste,
e só depois de uma semana limpa ser lida:

- **~~A tela não acompanha uma turma de 300.~~ Resolvido na branch (25/09),
  falta ensaio.** A causa era a lista da turma, cúbica por render, e o
  recálculo refeito por crachá. O teste de carga (`ui/Carga.test.tsx`) passou
  de não terminar em 180 s para 300 crachás em ~18 s. Ver `docs/10_codigo.md`.
- **"Preparar turma de teste"** (Diagnóstico) reabre o app, e o app fecha a
  chamada que acabou de abrir.
- **Casos em aberto do ensaio:** segunda janela do Adsum com a chamada aberta,
  e aluno de outra turma encostando o crachá. O comportamento de hoje ainda
  não foi anotado.
- **~~Comentários que contavam história ou já não eram verdade.~~ Feito na
  branch (25/09)** no domínio, na sincronia e nas duas telas grandes. Onde
  "aparelho" e "firmware" sobram, falam do leitor ESP32, que existe. A
  convenção está em `docs/10_codigo.md`.
- **`TelaDiagnostico` e `TelaRepositorio` (~800 linhas cada)** são as próximas
  a separar em peças. Fora do caminho do crachá.

### Antes de publicar a branch

A branch mexe no caminho de cada crachá. Pelas regras de "Como uma mudança
chega à sala", ela só sai com o ensaio completo sobre a cópia do cofre, com o
dongle, e nunca a menos de dois dias de uma aula. Em especial:

- **A fila rápida com o emulador C3 e o dongle**, olhando o diário: numa
  rajada, menos linhas `pasta` que crachás (o recálculo coalesce), nenhum
  `erro_`, e os tempos por crachá.
- **A planilha de faltas com a coluna `matricula`.** Muda o arquivo que o
  Prof. Paulo entrega: combinar com ele antes.
- **O manual** (`docs/Adsum-manual-e-LGPD.docx`) chega ao professor pela
  `main`; a correção feita na branch só vale depois do merge.

### Depois do congelamento

- **v2: lançar no SIGAA.** Especificação em `docs/08_lancar_no_sigaa.md`,
  telas em `docs/09_esboco_da_janela.md`. O primeiro passo não é código: é o
  portão A, o HTML da planilha de frequência salvo pelo Prof. Paulo antes e
  depois de um Gravar. Três perguntas de desenho esperam o autor (`docs/09`).
- **Dois crachás juntos por alternância.** A medida de 23/09 mostrou que o
  sinal que separa cartões empilhados de uma fila é a alternância (A, B, A, B
  em poucos segundos), e não o intervalo. Ideia registrada, não decidida.
- **Ideias levantadas no `CLAUDE.md`** ("Ideias levantadas, ainda não
  decididas"). Continuam lista.

### Quando a fase de testes acabar

- **`auditoria/uids.csv`** volta a ser decisão: o padrão deve voltar a ser não
  guardar o UID (`CLAUDE.md`, e a seção 4.5 do manual).
- **`INTERVALO_MINIMO_MS`** ganha um valor medido do uso real, ou dá lugar à
  regra da alternância.

### Em aberto, sem data

- **Safari e Firefox não têm pasta.** O app diz isso em vez de fingir que está
  guardado (`docs/01_cofre.md`). Não há solução equivalente à do Chrome à
  vista.
- **A passada visual** (tipografia, espaço, claro/escuro, Mushroom cards) nas
  telas de chamada e base (`docs/03_visual.md`).
- **O que sobrou da Fase 4** (`docs/05_plano_execucao.md`): F (gravar em
  disco por lote), H e I (contas e referências refeitas a cada crachá). Não
  fizeram falta com turmas reais; só voltam se o diário mostrar custo.
- **Bancada do `LeitorSerial`.** Pausada. Retomar só se o dongle falhar de um
  jeito que o Web Serial resolva (sem foco, sem heurística de ritmo).
