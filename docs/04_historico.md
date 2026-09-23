# Histórico de decisões

`CLAUDE.md` guarda só as regras vigentes e o estado atual. Aqui fica o
raciocínio datado por trás delas — o que foi tentado, corrigido e por quê.
Não é lido a cada sessão; é lido quando a pergunta é "por que isso é assim".

## 18/08/2026 — o projeto nasce, ancorado no A1

O autor criou o Adsum Web do zero. A primeira sessão ancorou tudo no
`~/Projetos/Adsum` (hardware ESP32, hoje morto) sem que isso fosse pedido.
Removido depois: `LIMITE_LISTA`, `MAX_BYTES` e as tabelas `A20`/`A24` de
`nucleo/nomes.ts` — mediam um display que não existe. `alunos.csv` e
`grade.csv` viraram `vinculos.json` e `grade.json` em `nucleo/cofre.ts`, com
`versao` no topo; `;` + BOM ficaram — nunca foram do firmware, são do Excel
em português.

**Estado medido nesse dia:** passos 1, 2 e 3 de 6 feitos, lista do SIGAA lida
de verdade — nome completo e matrícula, por turma. Turma real do IF685: 49 de
49, batendo com `Docentes (2)` e `Discentes (47)`, nenhum nome estourando a
coluna de 210 px (limite que já não existe mais) e quatro logins só-dígitos
sinalizados. `LeitorWebNfc` adiantado do passo 5. `npm test`: 147 testes.
Publicado em `willianrupert.github.io/adsum/`.

O crachá do CIn lido pelo Chrome no Android: permissão concedida, quatro
leituras com UID. Web NFC é especificado para NFC Forum tipo 1–5 e o Mifare
Classic não é nenhum desses — o Chromium entrega o `serialNumber` assim
mesmo.

Verificado no navegador: nove capacidades detectadas com service worker
controlando a página; leitura simulada UID → `uid_hash` → vínculo, inclusive
UID de 7 bytes; volta do baralho reencontrando UID já visto; `semear` duas
vezes sem duplicar evento; offline de verdade (servidor derrubado, app
recarrega do precache, base local sobrevive); vínculo renomeado sobrevive ao
recarregamento; a cerimônia inteira com leitor simulado — dica de docente no
topo, avanço automático, `Maria Vitoria S.`/`Maria Vitoria A.` desempatadas
pela inicial do último sobrenome, quatro crachás pro mesmo aluno aceitos,
crachá já vinculado recusado dizendo de quem é; toggle de papel; troca de
leitor com falha explicada.

## 19/08/2026 — cofre, modo de ensaio, sal

**Sal do cofre, corrigido:** `restaurar` e `restaurarDeArquivos` não liam
`config.json`, e o sal não voltava. Como cada navegador sorteia o dele ao
abrir, restaurar devolvia os nomes e perdia as pessoas — mesmo crachá, outro
hash, turma inteira desconhecida, sem erro. Derrubava a promessa de que
limpar dados do site não perde nada. `adotarSal` roda antes de tudo nas duas
restaurações e adota só o sal: o `instalacaoId` continua diferente por
navegador, senão duas instalações cunham o mesmo `evento_id`. Não troca por
cima de vínculos locais — aí a decisão é humana. Ver `docs/01_cofre.md`.

**Modo de ensaio:** `ambiente/preferencias.ts` guarda o que é desta máquina —
modo de ensaio, leitor escolhido, conselho dispensado — no `localStorage` e
não no cofre, senão o professor que recebe a pasta herdaria o modo de ensaio
de quem a mandou. Desligado por padrão; desligado, somem leitor simulado,
teclas `espaço`/`P`, semear e apagar. Regra do que fica atrás dele: se existe
para provar que o programa funciona, é ensaio; se existe para descobrir por
que não funcionou, é diagnóstico, e diagnóstico é de produção. Dois defeitos
apareceram na hora: padrão publicado era o leitor simulado, e a escolha de
leitor não sobrevivia ao recarregamento.

**A pasta se explica:** `LEIA-ME.txt` é gravado a cada sincronização
(`paraLeiaMe` em `nucleo/cofre.ts`) e diz o que é cada arquivo, como
recuperar tudo nos dois caminhos, que ali há dado pessoal e o que não apagar.
`.txt` e não `.md` porque abre limpo com dois cliques. Teste amarra o texto
aos nomes reais. Junto veio "Reler a pasta" nos Ajustes — único caminho de
puxar que faltava: `consertarPasta` empurra cache → pasta, e a restauração
automática só disparava com a base vazia, então pasta no iCloud atualizada
por outra máquina nunca entrava.

**Pendências:** nada registrava o que já tinha sido exportado, então
"concluir sem salvar" apagava a pendência da tela e da memória do app ao
mesmo tempo. `nucleo/pendencias.ts` tem a regra pura e `Config.exportado`
guarda `turma → quando do último evento exportado` — data e não contagem,
porque contagem mentiria para menos se o log recebesse eventos antigos.
Cobrado em três lugares: selo do canto, bloco no repouso, `beforeunload` (só
quando há o que perder). Com pasta é zero por construção.

**Arquitetura consolidada:** rota única (`nucleo/rota.ts` decide a tela a
partir do estado, `ui/Fluxo.tsx` monta; Diagnóstico e Repositório viraram
folhas atrás de dois selos discretos); coleta (`nucleo/sessao.ts` tem as
regras puras, `ui/TelaColeta.tsx` desenha, som por Web Audio tocado depois de
gravar, tela se reconstrói do log); cofre (`ambiente/pasta.ts` +
`ambiente/sincronia.ts`, a pasta é a dona e o IndexedDB é cache — `restaurar()`
reconstrói a base inteira lendo a pasta, testado apagando o cache primeiro).

## 20/08/2026 — cronograma, ensaio completo, sete achados

**Arrastar pinta:** aula de 4h ocupa dois blocos seguidos, e três encontros
na semana custavam seis cliques certeiros. O primeiro bloco decide o modo —
vazio, o arrasto pinta; marcado, apaga — comportamento de calendário, evita
que um tremor da mão vire xadrez. No toque o ponteiro fica capturado pelo
primeiro alvo, então depende de `elementFromPoint`, não de `pointerenter`.

**Sábado e o meio-dia:** a grade real tem `sáb. 07:00–11:50` e
`sáb. 13:00–17:50`, dois blocos longos que não existem em dia útil nenhum —
linha deles com uma célula só. O bloco de 12:00–12:50 foi lido errado como
almoço numa primeira leitura; o autor conferiu e algumas turmas têm aula aí.
Furo achado: `marcadosDe` checava só o horário, então uma aula de sábado às
08:00 seria marcada numa célula que a tela não desenha e sumiria calada —
corrigido para exigir o par dia e hora.

**Reabrir a chamada:** encerrar por engano é fácil, porque o crachá do
professor encerra e ele também é o crachá de alguém que pode encostar sem
pensar. Reabrir grava um `abrir` novo no log — o registro conta o que
aconteceu, inclusive que foi reaberta.

**Os blocos são medidos:** o autor mandou grades reais de vários períodos do
CIn; dois palpites estavam errados — faltava o bloco de meio-dia
(12:00–12:50, 50 min, um crédito) e a noite não é 19:00–20:50 e sim
17:00–18:50 e 18:50–20:30, encostados. Sete blocos, meio-dia desenhado mais
baixo porque quadradinho de tamanho único mente sobre a duração. Consequência
testada: das 18:30 às 19:10 os dois blocos da noite coincidem, e quem dá as
duas aulas coladas recebe `perguntar` em vez de abertura automática.

**Cronograma feito:** a grade existia só como três campos nos Ajustes, e
ninguém preenche três campos cinco vezes. `nucleo/horarios.ts` tem os blocos
do CIn e a conversão; `ui/TelaCronograma.tsx` desenha a semana. Vem depois de
colar a lista (precisa saber de qual turma fala) e antes do leitor (não
depende de dongle); é pulável. `definirHorarioDaTurma` substitui
`zerarAulas`, que apagava a grade inteira — "mudei a quarta de lugar" não
podia virar "recadastre tudo".

**Rota `problema`** deixou de ser o diagnóstico inteiro: `ui/TelaProblema.tsx`
tem uma frase e uma ação; o diagnóstico fica a um clique.

**Sete achados, percorrendo o fluxo do zero.** Os quatro primeiros eram a
mesma doença — a cerimônia desenhada como lista com um modo escondido
dentro: a barra "Encoste o crachá de" passou a abrir de saída nos dois
caminhos (colar e reabrir turma salva); "Cadastrar crachás" some enquanto ela
está aberta; "Voltar" virou "Parar de chamar". O quarto: não havia saída, e o
rodapé dizia "Trocar de turma" — o que encerra o cadastro inicial é o crachá
do professor, não um botão.

Ajustes recolhíveis, todos começando fechados: um critério "o que responde
pergunta abre, o que faz algo recolhe" resultou em metade abrindo e metade
não. Regra com exceção é regra que o usuário precisa decorar — abrir tudo
custa um clique, adivinhar custa a tela inteira.

A grade dos Ajustes virou a mesma semana do cronograma
(`ui/componentes/GradeDaSemana.tsx`), com seletor de turma em cima e gravação
a cada toque — em ajustes não existe "salvar", existe mudar.

Esvaziar a pasta pela mão não muda nada, de propósito: pasta no iCloud não
sincronizada ou volume desmontado aparecem vazios, e apagar a base local por
isso seria perder a turma por um problema de rede. Ganhou `Desconectar`, que
solta o vínculo sem apagar arquivo nem base.

O carimbo da build apareceu nos Ajustes (`__CARIMBO__` de `vite.config.ts`,
`vitest.config.ts` precisa do mesmo `define`).

Primeiro dia e "mais um crachá" eram a mesma tela — só o botão do rodapé os
distinguia. Título passou a dizer `Primeiro dia · IF685 · T01` contra
`Cadastrar mais um crachá`.

Recomeçar do zero saiu do modo de ensaio — o professor também precisa, fim de
semestre ou máquina que muda de dono. O texto deixa claro que a base do
navegador some mas os arquivos da pasta ficam.

A tag do ensaio passou a mudar com a rota: `N` produz crachá desconhecido em
qualquer tela, mas só na chamada isso abre a lupa — na cerimônia, é o
cadastro de quem está sendo chamado.

**A cerimônia expulsava a si mesma**, achado ao vivo: `professorSemCracha` é
recalculado a cada vínculo gravado, e a rota decidia por ele a cada render —
o crachá do próprio professor, tocado no meio da fila, saltava a rota para
`'pronto'` antes de chamar o próximo aluno. Corrigido: quem decide *quando*
sair da tela passou a ser `modoCadastro`, em `Fluxo.tsx`, só mudando por
gesto explícito ("Concluir").

**"Não deveria ser bloqueante o professor não ter o crachá"** — o autor
discordou de uma frase minha, com razão duas vezes sobre duas coisas
diferentes. Primeira rodada corrigiu só a tela de cadastro
(`cadastroDispensado`), mas o repouso ainda dizia "Falta o crachá do
professor, sem ele a chamada não abre" — mesma premissa, uma tela adiante.
Correção de verdade: `garantirProfessor()`, em `Fluxo.tsx`. "Começar a
chamada" e encostar o crachá do professor têm que ser gestos equivalentes
desde o primeiro uso — passar o crachá é opcional, nunca pré-requisito. Sem
vínculo de professor nenhum, o clique cria um na hora —
`uidHashSintetico()`, em `nucleo/hash.ts`, do mesmo formato e comprimento de
um `uid_hash` de verdade, só que sorteado, sem crachá físico atrás.

"Concluir" morava depois da lista inteira de matriculados — numa turma de
49, inalcançável sem rolar a tela toda. Moveu para o cabeçalho do painel.

Defeito irmão: reabrir "Cadastrar mais um crachá" chamava o professor de
novo, sempre — `abrirTurma` reconhecia "já tem crachá" só por matrícula, e o
docente não tem matrícula na página do SIGAA. Mesmo bug que `recontar()` já
tinha corrigido para a contagem de pendentes; a correção não tinha chegado a
`abrirTurma`. Segunda via por nome, igual à de lá.

**Palavras trocadas:** "armar"/"armado" saíram — lembra arma, não é
institucional; virou `chamado` em toda parte. "Aparelho" (do A1) virou
"computador" onde significava "esta máquina", inclusive no manifesto.

## 21/08/2026 — varredura, unificação da chamada, Ajustes em três seções

**Varredura de sete pontos** pedida pelo autor de uma vez: calendário de
turmas nos Ajustes, CSV de entrada do SIGAA, duas telas de chamada
divergentes, redundância em Ajustes, leitor de presenças por turma, tela fora
do horário de aula, botão de cadastrar turma nova.

Três já existiam escondidos: o seletor de turma na grade de Ajustes (só não
aparece com uma turma só, painel começa fechado); não existe CSV de entrada
— o SIGAA entra como texto colado, com conferência do número declarado
contra o extraído.

Redundância real achada: duas coisas chamadas "Repositório" — o painel
"Registros" (só exportava) e um painel dentro de Diagnóstico misturando
cota, carimbo de build e ID de instalação com uma tabelinha de eventos, a
única coisa que já se parecia com "ver presenças", enterrada no lugar
errado. Renomeado para "Estado do app".

Leitor de presenças por turma feito: `TabelaDeRegistros`, mesmo padrão de
seletor da grade, filtrando `origem === 'cracha'`.

Fora do horário de aula: `saudacao(agora)` (Bom dia/Boa tarde/Boa noite)
substitui o título do repouso quando não há próxima aula conhecida.

"Cadastrar nova turma" feito, com um bug atrás: não havia caminho para turma
nova depois da primeira — a tela de colar só aparecia com `turmas === 0`, e
"Cadastrar mais um crachá" sempre mirava a primeira turma existente mesmo
com uma segunda esperando crachá. Corrigido para preferir `turmaPendente` de
qualquer turma. O modo `'nova'` força `turmaInicial` a `undefined`, mas turma
nova nunca tem horário, então o cronograma entra no meio — a primeira versão
reabria a colagem em branco ao voltar do cronograma.  `turmasAntesDaNova`
guarda quantas turmas existiam ao abrir o modo, e um efeito troca `'nova'`
por `'inicial'` assim que `turmas` cresce.

**A unificação da cerimônia com a chamada** — "são duas telas para uma coisa
só" tinha sido dito duas vezes antes de ser feito. Decisão central: não
existe mais um modo "só vínculo, sem sessão". Chamar um nome pendente e
encostar o crachá é sempre `decidir()` → `'cadastro'`, gravando vínculo e
presença no mesmo gesto. Não é perda: a cerimônia antiga não passava por
`decidir()`, então não tinha proteção contra dois crachás rápidos demais —
justo no momento de maior risco, a fila do primeiro dia.

`TelaAula.tsx` trocou a condição estreita `primeiroDia` (100% pendente) por
`pendentes.length > 0`. Com gente pendente, mostra o cartão "Encoste o
crachá de X" e a tabela completa portada de `TelaVinculo`: "Chamar" em
qualquer linha, nome e papel editáveis antes do crachá chegar, "Pular",
"Nome repetido" calculado na hora.

`'cerimonia'` deixou de ser uma tela: `decidirRota` continua devolvendo o
mesmo valor no mesmo lugar, mas `Fluxo.tsx` não renderiza mais nada para
ele — um efeito chama `iniciarChamada()` e a rota recalcula para
`'chamada'` no instante seguinte. A classe inteira de bug que motivou a
suspeita original ficou estruturalmente impossível: `decidirRota` verifica
`chamadaAberta` antes de olhar `professorSemCracha`.

Mudança de comportamento registrada de propósito: crachá já vinculado a
outra pessoa, encostado enquanto alguém X está chamado, não é mais
recusado — `decidir()` marca presença para o dono de verdade. Não é falha
de dado (a pessoa dona do crachá está mesmo ali); é uma regra a menos para
duas implementações manterem sincronizada.

`TelaVinculo.tsx` virou `TelaColarTurma.tsx`, encolhido para só a colagem.
"Cadastrar mais um crachá" saiu do repouso — "Começar a chamada" já abre a
turma certa e a tabela de pendentes aparece sozinha.

**Ajustes ganhou três seções** — onze painéis empilhados com o mesmo peso
visual era a parede indiferenciada por trás do "eu me perco lá". O
agrupamento caiu na borda entre `TelaRepositorio.tsx` e `TelaDiagnostico.tsx`:
Sua turma (cartões, Registros, Vínculos, Grade horária), Este computador
(Onde os dados ficam, Passar os crachás, Recomeçar do zero), Diagnóstico
(inteiro, sem reordenar por dentro). `Secao`, em `componentes/Painel.tsx`, é
a divisória — não colapsa, é só o título.

**Validação ao vivo, quatro achados na mesma tarde:**

- Assimetria vertical no texto dos botões: `line-height: 1.47` herdado do
  corpo sobrava espaço embaixo do texto dentro de uma pílula.
  `line-height: 1` na regra base de `button` resolveu para todos.
- "Encerrar a chamada" tinha o mesmo problema que "Concluir" já teve — só no
  rodapé, inalcançável numa turma de 49 sem rolar. Um "Encerrar" curto
  entrou em `.coleta__topo`; o do rodapé fica, onde o aviso de crachás
  rápidos demais aparece.
- "Por que sugerir chamada fora do horário?" — sem `proxima` conhecida,
  "Ver presenças" virou o acento e "Começar a chamada" ficou quieto. Com
  `proxima`, nada mudou.
- O popup de leitura de CSV, estilo Ajustes com bordas foscas:
  `TabelaDeRegistros` e `Sheet` viraram componentes compartilhados em
  `componentes/`; `TelaPresencas.tsx` é a folha nova, "Presenças".

## 15-17/09/2026 — incidente do dongle sob carga, validação real, correção de escala

**15/09/2026, aula real:** o professor relatou que a leitura do dongle
"parou de associar os crachás com os alunos" no meio da chamada, sem erro
na tela. Causa: `INTERVALO_MAXIMO_MS` (`nucleo/digitacao.ts`) era medido
com `performance.now()` dentro do manipulador de `keydown` — isso mede
quando o manipulador *rodou*, não quando a tecla chegou de verdade. Com a
aba ocupada (turma grande, tela reatualizando a cada crachá), o atraso de
processamento parecia atraso de digitação, e a rajada inteira era recusada
em silêncio. Corrigido trocando para `evento.timeStamp`, carimbado pelo
navegador perto da chegada física da tecla, imune ao atraso de
processamento (commit `4d89ad6`).

Validado de duas formas antes de confiar nisso com o professor: um teste
automatizado (`TelaAula.escala.test.tsx`, 100 alunos, `LeitorTeclado` de
verdade mas evento sintético em jsdom) e, mais forte, um **rig de hardware
real** (`ferramentas/rig-de-cracha/`) — um ESP32-S3 configurado como
teclado USB HID de verdade, digitando através do sistema operacional no
Chrome real. Validado com turma simulada de 200 pessoas, duas vezes
(intervalo aleatório 800-1200ms e fixo 500ms), 100% de sucesso nas duas.

**Investigação de escala (16-17/09/2026):** o fix de `timeStamp` resolve
uma medição errada de tempo, não uma conta genuinamente lenta. Auditando o
caminho quente (o que roda a cada crachá aceito), achado com benchmark
real: `planilhaDeFaltas` (`nucleo/faltas.ts`) crescia quadraticamente com
o histórico acumulado — 20ms na terceira aula, 1,3 **segundo** por crachá
na trigésima, cruzando o limiar de 60ms já por volta da sexta aula.
Reescrita com indexação prévia (por aluno + dia, numa passada só, em vez
de refazer o filtro completo por célula): **575,8× mais rápida**,
equivalência provada contra a suíte de testes existente (valores exatos,
sem alteração). Junto, escopo por turma nas leituras e escritas
(`Repositorio.listarEventos({ turma })`, `gravarFaltas`/`sincronizar`
aceitando `turma?`) — o índice de turma já existia no Dexie, só não era
usado. Projeção combinada: ~1,33s → ~10-15ms por crachá no fim de um
semestre de 60h com duas turmas (50 e 80 alunos). **Decidido não subir no
mesmo dia da validação real** (17/09/2026) — a base do professor tinha só
uma aula (a de 15/09, interrompida pelo incidente) — sem urgência real
para o fix de escala ainda, e misturar duas mudanças no mesmo teste
dificultaria diagnosticar qualquer problema.

**17/09/2026, validação real: funcionou.** Um problema à parte apareceu:
o professor marcou presença manual, pela tela "Presenças", de um aluno sem
crachá — a tela confirmou, mas a planilha na pasta cofre não recebeu a
mudança. Causa: `ConteudoDePresencas` (`ui/TelaPresencas.tsx`) gravava a
correção só no IndexedDB (`repositorio.acrescentarEvento`), sem passar
pelo caminho que qualquer evento de crachá já usa — `gravarLinha`
(acrescenta no log) e `mudou` (recalcula a planilha de faltas). A tela
mostrava certo porque lê do IndexedDB; o arquivo ficava para trás porque
nada mandava ele se atualizar. Corrigido conectando a tela ao mesmo
caminho (`aoRegistrar`/`aoMudarBase`, espelhando como `TelaAula` já fazia)
— testado contra pasta de verdade, não só o cache, com o teste provado
falhando sem a correção antes de confirmar que passa com ela.

## 22/09/2026 — a aula que não gravou: dois defeitos depois da leitura

Aula real de CIN0144, com o autor presente. Sintomas: quase todo aluno
aparecia como crachá sem dono, mesmo quem tinha cadastrado na aula anterior.
Por volta do trigésimo, escolher o nome na busca não contava mais nada, e o
botão "Presente" também não. Encerrar e reabrir a chamada funcionou para um
aluno e travou de novo. **O dongle não teve culpa em nenhum dos dois.**
Reconstruído a partir do cofre do professor (a pasta, não o navegador).

**1. `evento_id` repetido, engolido como idempotência.** Cada tela tinha o
próprio contador: `TelaAula` começava pela contagem de eventos **da turma**
(desde a Fase 4, item B, que escopou a leitura por turma e deixou o
contador junto), `Fluxo.abrirChamada` pela da base inteira, `TelaPresencas`
pela da base também. Com duas turmas na base, cunhavam o mesmo id no mesmo
dia. O `add` do Dexie recusava, `acrescentarEvento` tratava a recusa como
"reler o mesmo arquivo" e voltava calado — enquanto a linha já tinha ido
para o CSV da pasta. Pior: o contador era relido da base depois de cada
evento, e o evento perdido não estava lá, então o id seguinte era o mesmo
de novo. Travava para sempre. No log de 22/09, 0063→0097 seguidos, depois
`…-0098` onze vezes, todas recusadas pela base. **O "apita e nada acontece"
de 17/09 à tarde era este mesmo defeito** (`…-0035` cinco vezes), e não o
foco da janela que se supôs na época.
Correção: `gravarEventoNovo` (`portas/Repositorio.ts`) é o único caminho
para evento novo. Começa da contagem da base e sobe até o `add` aceitar;
`acrescentarEvento` passou a devolver se gravou. O formato do id não mudou.

**2. O sal em dois lugares.** Em 17/09 o app foi reinstalado apagando os
dados do site. A instalação nova sorteou um sal; ao religar a pasta,
`restaurar` adotou na base o sal do cofre, o certo. Mas a config que as
telas usam para o hash é uma cópia lida quando o app abriu, e ninguém a
releu. A turma inteira foi recadastrada naquela manhã com o sal
recém-sorteado, que existia só na memória da aba. Ao reabrir, valia o do
cofre, e aqueles vínculos nunca mais bateram: 40 deles, incluindo o crachá
do professor. Correção: `Fluxo` chama `recarregarConfig` quando a
restauração troca o sal.

**Por que a suíte não pegou.** Todo teste começava de uma base com uma
turma só e um sal só, e nessa base as duas contagens coincidem. A base
de um professor na segunda semana não é assim. `ui/Incidente2209.test.tsx`
monta a base assim (outra turma com aula no mesmo dia; reinstalar e
religar a pasta), e os quatro testes falham no código anterior.

**O que ficou nos dados.** 16 linhas do CSV (9 presenças de pessoa-dia) têm
`evento_id` repetido e não estão na base do navegador, então a planilha de
faltas as mostra como falta. Uma restauração pela pasta também as descartaria
pela mesma chave. O caminho limpo é o professor marcar essas presenças à mão
em "Ver presenças", como evento novo, sem reescrever nada. Os 40 vínculos
no sal perdido ficam inertes: quem só tinha esse vínculo cai na busca de
crachá desconhecido e é recadastrado na próxima leitura, como aconteceu
em 22/09.

## 22/09/2026, tarde — o que o relato da aula pediu além do conserto

**"Começou do nada" era o Enter do dongle.** Desde 17/09 à noite o repouso
tinha um atalho: Enter começa a chamada. O dongle digita o UID e um Enter.
O `LeitorTeclado` marcava esse Enter com `preventDefault`, mas o atalho não
conferia, e qualquer crachá encostado na tela inicial abria a chamada. O
mesmo Enter, com a busca de "de quem é?" aberta, escolhia o nome
destacado. Agora o Enter que fecha uma rajada sai sempre marcado, e os dois
atalhos ignoram Enter marcado.

**Uma chamada por turma por dia**, pedido do professor e regra do SIGAA.
`TelaAula` conta o dia inteiro de `abertaEm`, não desde a abertura: reabrir
é continuar. Por isso fechar o app pode fechar a chamada
(`fecharChamadaDeAntes`, ao abrir a base), sem evento `encerrar`, porque a
hora seria a de reabrir. O repouso escolhe só o dia, não a hora.

**Nenhum sal se perde.** `Config.saisAnteriores` é um chaveiro: `definirSal`
arquiva o anterior, restaurar junta os sais do cofre aos daqui (antes
recusava, ou sobrescrevia), importar crachás de outro professor junta em
vez de trocar. `identificarCracha` procura o crachá em todos. Vínculo novo
guarda `salId`, impressão do sal, e o Diagnóstico ganhou "Segredo dos
crachás", que conta quem depende de um sal ausente e diz como recuperar.
A marca de vínculo antigo espera o navegador ocioso: gravada a cada
crachá, fez o teste de 100 alunos perder uma leitura.

**O ponto azul** era calculado só quando a base mudava. Com o app aberto
desde antes da aula, nunca acendia. Agora a grade é reavaliada pelo relógio.

Limite que fica: os 40 vínculos do sal de 17/09 continuam perdidos. O sal
existiu só na memória daquela aba. Cada um deles encosta de novo uma vez.

## 22/09/2026, noite — códigos dos crachás, diário, conferência

**Guardar o UID real, por decisão do autor.** Durante a fase de testes,
`auditoria/uids.csv` na pasta do cofre recebe o código de cada crachá na
primeira leitura. Fica ligado por padrão, com o aviso e o interruptor no
Diagnóstico. É exceção deliberada à regra do sal: o recadastro de uma turma
custou mais que o risco de guardar, e o LEIA-ME diz que é o arquivo mais
sensível da pasta. Uma linha por crachá, na primeira vez que ele aparece; as
leituras seguintes não custam nada.

**Diário de diagnóstico.** `diagnostico/<dia>.log`: abertura do app, cada
leitura (hash curto, sal em que foi achado, decisão, `evento_id`, tempo de
identificar, gravar e redesenhar), recusas do leitor pelo tamanho, gravação
na pasta com tempo, foco, erros sem dono, `evento_id` que já existia. Sem
nome e sem UID. Gravado em lote a cada 5 s. Se existisse em 22/09, `id_ocupado`
repetido teria dito a causa na primeira ocorrência.

**Por que parou no trigésimo, medido.** Não foi CPU. `TelaAula` começou a
numerar de 0063; o `abrir` da chamada, numerado pela base inteira, já tinha
levado 0098. Trinta e cinco eventos depois o contador chegou a 0098 e travou.
O "apita e nada acontece" de 17/09 foi o mesmo desencontro, noutra conta.

**Conferência planilha × base** (`conferirLog`), ao ligar a pasta e ao
encerrar: evento que a pasta perdeu é acrescentado; linha que só o arquivo
tem, ou `evento_id` repetido, vai para o diário como divergência.

**Um achado de CPU no caminho.** A marca de sal dos vínculos antigos,
gravada a cada leitura (e depois adiada leitura a leitura), fez o teste de
100 alunos perder uma rajada. Agora fica em memória e grava num lote, com o
navegador ocioso ou no fim da chamada. O diário mostrou que, sem isso, cada
crachá custa ~30-50 ms no jsdom e nenhuma rajada é recusada.

**Ligar uma pasta a uma base com dados apagava da pasta o que era só dela.**
Achado ao preparar o autor para trabalhar sobre uma cópia do cofre do
professor: com base não vazia, ligar a pasta só trazia os sais, e a primeira
gravação reescrevia `vinculos.json` a partir da base — todo vínculo que só a
pasta tinha sumia. `mesclarDaPasta` traz vínculos, turmas e grade que a base
não tem, sem tocar nos que ela tem.

**Restaurar descartava calado linhas de `evento_id` repetido.** Contra a
regra de que leitura de CSV nunca descarta linha. `importarEventos` traz a
linha repetida de outro conteúdo com id derivado (`<id>.2`), só na base; o
arquivo fica como foi gravado. A conferência passou a valer nos dois
sentidos. Ensaio com a cópia real do cofre: as 168 linhas dos dois arquivos
entram na base, e as 13 presenças que a base do professor tinha perdido
(8 em 22/09, 5 em 17/09 — ids colidindo também entre as duas turmas, que a
primeira contagem não viu) voltam sozinhas ao ligar a pasta.

**22/09/2026, fim do dia — o número do evento deixa de ser uma contagem.**
A recuperação por tentativa (pegar o próximo livre) consertava a colisão, mas
mantinha a colisão possível. `Config.proximaSequencia` é um contador que só
anda para frente, reservado numa transação do IndexedDB — duas abas na mesma
base nunca recebem o mesmo número, e nenhum número é reutilizado depois de um
`esvaziarCache` ou de uma restauração com o log de outra instalação junto. Em
base anterior ao campo, ele nasce depois do maior número já usado por aquela
instalação, e não da contagem de eventos, que tem buracos. A tentativa
continua, como rede para o que este código não controla (um log trazido de
fora com id desta instalação). Testes: 50 reservas simultâneas dão 50 números
distintos, e 30 eventos gravados ao mesmo tempo dão 30 ids distintos.

Também nesta passada: o manual de LGPD ganhou a seção 4.5, descrevendo o
diário de diagnóstico e o arquivo de códigos dos crachás — inclusive o que
ele custa ("quem tiver este arquivo consegue copiar um crachá") e como
desligá-lo —, e as três afirmações do documento que diziam que o número do
crachá nunca é guardado foram corrigidas.

## 23/09/2026 — a fila de 300 pelo rádio

Primeira medida de capacidade com o caminho inteiro de verdade: o emulador
(`ferramentas/emulador-de-cracha`) põe cada crachá no ar, o dongle lê e
digita, a chamada grava. O painel da fila ganhou tamanho e cadência
configuráveis, o ritmo medido no resultado, e "Parar a fila" (comando
`PARAR` no firmware). Rodado no localhost, não publicado.

**Primeira rodada, 0,72 s por crachá: três defeitos do app.**

- **Aluno recusado como "dois crachás quase juntos" a 0,7 s do anterior.**
  Cada crachá era identificado solto, e com a aba ocupada a identificação de
  um terminava depois da do seguinte; ele era então comparado com um crachá
  que encostou **depois** dele, e o intervalo negativo passava por menor que
  400 ms. Quatro alunos em ~110. Conserto: identificar e decidir andam em
  fila, na ordem de chegada (`TelaAula`), e intervalo negativo nunca é
  recusa (`decidir`). Um teste para cada.
- **O Encerrar gravava um encerramento por clique** — cinco em 2,5 s, porque
  a tela demorava a responder e o professor insistia. Agora um clique só.
- **A tela não acompanha uma turma de 300.** O diário mostrou o tempo de
  identificar em degraus de ~240 ms: cada crachá esperava os redesenhos dos
  anteriores. A tela mostrava o passado (a impressão de "um em cada três"), e
  os cliques entravam na fila. **Não consertado**: nenhuma turma real tem
  300, e o custo do redesenho cresce com o tamanho da turma. Fica registrado
  como o ponto a atacar.

A mesma rodada perdeu 5 crachás para o chat (foco fora do Chrome: o dongle
digitou os números lá) e ~17 com a chamada fechada — ambos esperados.

**Segunda rodada, com o conserto: 300 de 300.** Nenhum "rápido demais",
nenhum crachá perdido, nenhum intervalo acima de 1,6 s, nenhum `evento_id`
repetido, um encerramento só. 300 crachás em 5 min 34 s, mediana de 1,2 s
entre um e outro: **~54 por minuto**, ditado pela cadência do emulador (700
no ar, 150 entre, mais o reset por fio), não pelo dongle. A primeira rodada
mostra que o dongle lê a ~83 por minuto; o teto dele continua sem medir.
A tela seguiu atrasada (até ~2 s para redesenhar), sem perder nada.

**O que isto não prova:** a máquina do Paulo, a versão publicada e
instalada, base com histórico, crachá real na mão de gente. Os sete passos
com o dongle continuam sendo o que decide a aula.

## 23/09/2026 — ensaio na versão publicada: dois defeitos de correção manual

No passo 2 dos sete, com a cópia do cofre do Paulo:

- **"Remover crachá" parecia não fazer nada.** A base do Paulo tem 32 alunos
  com um vínculo em cada sal: o de 17/09, guardado pelo chaveiro, e o de
  22/09. O botão apagava o primeiro que achasse, e às vezes era o morto — o
  crachá continuava valendo e a tela não mudava. Agora apaga todos os
  vínculos da pessoa, que é o que o botão promete.
- **"Não presente" e depois o crachá: o contador não voltava.** A regra era
  "correção manual mais recente decide; sem ela, o crachá" — escrita supondo
  a correção sempre depois do crachá. **Decidido pelo autor:** crachá
  gravado depois da remoção devolve a presença. A ordem vem do número do
  evento (reservado, só anda para frente em cada instalação), não do
  `quando`: "Ver presenças" grava a correção ao meio-dia do dia corrigido.
  Entre instalações os números não se comparam, e a remoção continua valendo.
  Conferido na cópia do cofre: nenhuma falta histórica muda. Crachá usado por
  outra pessoa se resolve com "Remover crachá", que o faz cair na busca.

Recadastrar o mesmo cartão no mesmo sal dá o mesmo `uid_hash` — por isso as
leituras seguintes viravam "repetido", e a lista lateral mostrava o nome
enquanto o contador ficava parado.

**Mais tarde, no passo 6 do ensaio (com o emulador C3 no lugar do S3):** o
cenário falhou pelo motivo certo — o PN532 não emite os crachás de teste
dele —, mas mostrou dois defeitos reais da busca "de quem é?", que amanhã
vai abrir para 7 crachás desconhecidos numa fila:

- **Os primeiros dígitos de cada crachá caíam no campo de busca.** O dongle
  é teclado, e o leitor só reconhece a rajada depois de alguns caracteres. O
  campo acumulava "083085086…". Agora, a cada crachá lido com a busca
  aberta, os dígitos saem do campo; matrícula digitada à mão continua.
- **Um segundo crachá desconhecido tomava o lugar do primeiro, em silêncio.**
  O nome escolhido para quem estava na frente ia para o crachá de quem veio
  atrás. Agora é uma busca por vez: o segundo é recusado com aviso dentro da
  busca, e crachá conhecido continua contando.

O crachá desconhecido também passou a deixar linha no diário
(`desconhecido`, `desconhecido_durante_busca`); antes só a desistência
aparecia.
