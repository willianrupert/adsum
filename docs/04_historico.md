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
