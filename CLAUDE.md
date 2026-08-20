# Adsum Web — contexto do projeto

Leia antes de qualquer tarefa.

> ## ⚠️ O Adsum A1 não existe mais
>
> Corrigido em 18/08/2026. **Não há aparelho ESP32.** O leitor é um **dongle USB**
> ligado ao computador do professor; ler pelo **celular Android com NFC** é
> caminho experimental e não é o foco.
>
> Some junto com o A1: firmware, cartão microSD, protocolo CDC (`ARMAR`, `SAL`,
> `SALDEF`, `SIMULAR`), volume `ADSUM`, "o aparelho circula entre professores",
> "sal de frota", tela de 480×272 e a divisão "aparelho é cache, planilha é
> dona". **O repositório `../Adsum` é histórico**, não fonte da verdade — exceto
> pelas regras de crachá e privacidade, que continuam valendo por si.
>
> O que sobrevive, e por quê:
>
> - **Só o UID público é lido.** Nunca autenticar setores, nunca Crypto1.
> - **UID é campo de tamanho variável** — 4, 7 ou 10 bytes.
> - **`uid_hash` = SHA-256(sal ‖ uid), 8 primeiros bytes.** Sem sal, o hash é o
>   UID disfarçado e cai por força bruta em segundos.
> - **Nada é reescrito — apenas acrescentado.**
> - **Um só nome chamado por vez** na cerimônia de vínculo.
> - **Sem hora confiável, a sessão não abre.**
>
> **Os limites de tela (210 px, 31 bytes) sumiram**, junto com as tabelas de
> avanço de fonte. O encurtamento continua, por legibilidade em fila.
>
> **Os comentários do código ainda falam do A1 em vários lugares.** Foi feita a
> limpeza dos textos de tela; a dos comentários ficou pendente por orçamento.

## Duas perguntas em aberto, e são as que mais importam

### 1. O professor não pode perder a base. *(Resolvido no Chrome/Edge.)*

Tudo vive no IndexedDB de **um navegador de uma máquina**. Trocar de
computador, limpar dados do site, ou o navegador despejar sob pressão de espaço
— e o cadastro da turma inteira se vai. Recadastrar quarenta e nove alunos é
inaceitável, e a promessa de "dados 100% locais" é justamente o que cria esse
risco. **As duas coisas não podem ser verdade ao mesmo tempo.**

**Decidido pelo autor em 18/08/2026: o crachá do professor autentica.** Ele
encosta o próprio crachá e a base dele carrega. Não reabrir sem motivo novo.

O que ainda decorre disso, e é o que precisa de desenho: para carregar em outra
máquina, os dados precisam existir em algum lugar fora dela. Autenticação
resolve *quem entra*, não *de onde vem o dado*.

Sobre a força do crachá como credencial, para não se perder o raciocínio: o UID
trafega em claro na anticolisão, antes de qualquer chave — é por isso que o
projeto consegue ler o crachá do CIn sem as chaves do CIn, e é o que a regra
"só o UID público é lido" sempre significou. Clonar exige cartão de UID
gravável e intenção deliberada. **Para uma sala de aula isso é aceitável**, e a
avaliação de risco é do autor: quem clona um crachá já podia forjar presença,
e o professor está na sala.

O que muda de natureza é o **alcance** do que o crachá abre. Presença é um
registro; a conta do professor guarda nome, login e e-mail de dezenas de
alunos. Se a entrada em máquina nova destravar isso só com um toque, deixa de
ser questão de frequência e vira questão de dado pessoal.

Meio-termo que preserva o gesto: **crachá abre máquina já confiada; máquina
nova exige o arquivo de backup** (ou um PIN definido uma vez). O professor
encosta o crachá todo dia e nunca pensa nisso; um crachá clonado sozinho, num
computador qualquer, não abre nada.

Caminhos, do mais barato ao mais caro, para decidir com o professor:

1. **Exportação obrigatória e lembrada.** A base continua local; o app insiste
   num arquivo de backup e avisa quando está velho. Zero infraestrutura,
   depende de disciplina humana.
2. **Pasta escolhida uma vez** (File System Access, Chrome/Edge): o app grava
   sozinho a cada mudança numa pasta de verdade do computador. **É o melhor
   caminho, e resolve mais do que backup.**

   O `FileSystemDirectoryHandle` pode ser guardado no IndexedDB e reusado nas
   sessões seguintes. O que isso muda: os arquivos são **arquivos no disco**.
   Limpar dados do site apaga o handle, **não a pasta** — o professor reescolhe
   a pasta e tudo volta. Nada trafega na rede e não é preciso autenticar: quem
   tem a máquina e a pasta tem a base.

   Se a pasta ficar dentro do iCloud/Drive que ele já sincroniza, o backup
   fora da máquina vem de graça, sem servidor nosso.

   **Limite:** só Chrome e Edge. Safari e Firefox não têm seletor de diretório.
   O OPFS, que o Safari tem, **não serve**: mora dentro do armazenamento do
   navegador, não aparece no Finder e **some ao limpar dados do site** — é o
   problema de novo, com outro nome. Nesses navegadores sobra exportar e
   importar arquivo à mão.

   **No Safari é pior, e foi medido em 19/08/2026:** o ITP apaga IndexedDB,
   localStorage e o registro do service worker depois de **sete dias de uso do
   Safari sem visitar o site**. Contam dias de uso do navegador, não dias de
   calendário — um mês sem abrir o Safari não gasta nenhum. Não é despejo sob
   pressão de espaço — é rotina.
   A saída é do próprio WebKit: app adicionado ao Dock (macOS) ou à tela de
   início (iOS) sai do Safari, ganha container próprio e é **pulado** no
   algoritmo de remoção. Como o armazenamento é separado, **instalar tem de vir
   antes de cadastrar a turma** — daí a rota `'instalar'`, no mesmo lugar em que
   o Chrome pede a pasta. O Firefox não tem pasta mas **não apaga**: os dois
   casos têm textos diferentes, senão o aviso mente para metade dos
   navegadores. Ver `docs/01_cofre.md`.
3. **Conta de verdade**, com backend — contradiz o desenho, exige manutenção
   perpétua, e é o que foi recusado desde o começo.

Enquanto não houver decisão, **o app não deve dar a entender que os dados estão
seguros**.

### 2. O desenho está cheio de texto e não é seamless

As abas `Diagnóstico · Vínculo · Repositório` expõem a arquitetura do programa,
não a tarefa de quem usa. O usuário não quer saber que existe um repositório.
Direção pedida: **estilo Apple — só funciona, e não se pensa em nada.**

Consequências práticas para a próxima sessão:

- **Uma rota só, que decide sozinha.** Sem turma cadastrada, a tela é "cole sua
  turma". Com turma e crachás faltando, é a cerimônia. Com tudo pronto e hora
  de aula, é a coleta. O estado do dado escolhe a tela.
- **Diagnóstico deixa de ser aba.** Vira um item discreto, alcançável quando
  algo falha — e o que ele explica hoje em parágrafo deve virar uma frase, ou
  sumir.
- **Menos texto.** As telas de hoje explicam decisões de projeto para o usuário.
  Isso é documentação, e documentação mora em `docs/`.

**Sobre a estética.** Referências levantadas pelo autor: *liquid glass*, Apple
recente, *Mushroom cards* (Home Assistant), iPadOS. A leitura da linguagem:

- O que faz uma interface Apple parecer "só funciona" **não é o material — é a
  ausência de decisão.** Uma ação óbvia por tela, navegação que decorre do
  estado, e nada de configuração à vista. Vidro sobre a arquitetura de hoje
  continuaria sendo três abas com nomes de módulo.
- **Mushroom** é a referência mais útil das três para este app: cartão compacto
  e arredondado, ícone colorido à esquerda, uma linha de informação principal e
  uma de apoio. É desenho de estado num relance — que é exatamente o que uma
  tela de coleta precisa.
- **Cuidado com o vidro.** Isto pode acabar num projetor ou numa sala clara,
  visto de longe e de canto de olho. `backdrop-filter` sobre fundo variável
  derruba contraste, e contraste aqui é requisito, não gosto. Translucidez só
  onde existe camada de verdade (algo sobreposto), nunca como textura de fundo.
- Ordem sugerida: primeiro a rota única e a redução de texto; depois tipografia
  grande e espaço; **material por último**, quando já houver o que vestir.

## O que é

PWA que roda no navegador do professor e guarda tudo localmente. Companheiro do
Adsum A1 e sucessor de `Adsum/computador/vincular.html`. Sem servidor, sem
conta, sem login.

Pilha: React + Vite + TypeScript + Dexie, publicado no GitHub Pages.

## Regras que não devem ser quebradas

Herdadas do aparelho (justificativa em `../Adsum/CLAUDE.md`):

- **Só o UID público.** Nunca autenticar setores, nunca tocar em Crypto1.
- **UID é campo de tamanho variável** — 4, 7 ou 10 bytes. Código que assume 4
  quebra na frente da turma, não no teste.
- **Nada é reescrito — apenas append.** Vale para eventos.
- **`uid_hash` = 8 primeiros bytes de SHA-256(sal ‖ uid).** O sal **não aparece
  na interface**: é sorteado uma vez, nunca é mostrado nem editável, e viaja
  sozinho no arquivo que um professor passa a outro. Ele protege uma coisa só, e
  não é o nome: sem ele, quem obtiver o `registros.csv` recupera o UID por força
  bruta em segundos e pode **clonar o crachá**. Nome e matrícula já estão no
  arquivo; o UID é o único dado ali que dá poder novo a quem o lê.
- **Sem hora confiável, a sessão não abre.**
- **O nome não trafega.** Sai `uid_hash`; a planilha resolve.

Específicas do app:

- **Nenhum dado sai do computador sem gesto explícito do professor.** Não existe
  telemetria, analytics, fonte remota nem CDN. O `runtimeCaching` do service
  worker é vazio de propósito.
- **A porta `Repositorio` não ganha `atualizarEvento` nem `removerEvento`.** Se
  a assinatura não existe, o bug não se escreve.
- **`src/ui/adsum.ts` é o único lugar que escolhe adaptadores.** Tela que
  importa `LeitorSimulado` ou `RepositorioDexie` diretamente é bug de camada.
- **Dado real de turma nunca entra no repositório.** O repo é público. Lista do
  SIGAA, print da página de participantes, nome, matrícula, login ou e-mail de
  aluno: nada disso vira teste, exemplo ou imagem. Os testes usam gente
  inventada na forma exata da página real, e o manual usa ilustração desenhada —
  mesma disciplina do `gerar_mockups.py`, que versiona o desenho e não a captura.
- **A matrícula é o identificador da pessoa.** Nome muda com correção de
  cadastro; matrícula não. É por ela que a planilha fecha a chamada, e é ela que
  vai na coluna `matricula` de `registros/<turma>.csv`. O nome continua sendo só
  apresentação. **O login do SIGAA não é lido nem guardado**: é credencial de
  acesso, e credencial não entra em arquivo de frequência. O parser vê o campo
  na página de participantes e passa por ele de propósito.
- **Esquema do Dexie ganha versão nova, nunca edição da anterior.** Quem já
  abriu o site tem a versão antiga no navegador; mexer numa `version(n)` já
  publicada faz a base não abrir.
- **O nome exibido é primeiro + segundo nome**, não primeiro + último
  sobrenome. Divergência deliberada do `vincular.html`: é como a pessoa é
  chamada, e é o que o mockup de `Adsum/docs/03` já mostrava — Willian Neves,
  Maria Vitória, João Pedro, Luiz Felipe. Consequência boa: pegando pela frente,
  "Breno Filho" deixa de ser alcançável, e a regra de sufixo de linhagem some
  junto com a classe de erro que ela existia para tapar.
- **Todo mundo entra como aluno.** Virar professor é um toque explícito de quem
  opera. Isso **não** contradiz o "`ARMAR` exige o papel" de `Adsum/docs/04`: o
  comando continua exigindo, o que mudou foi o padrão da lista na tela. A trava
  contra vincular o professor como aluno deixa de ser a recusa do comando e
  passa a ser visível — dica `SIGAA: docente` na linha, e um aviso enquanto
  ninguém estiver marcado. Padrão silencioso continua proibido; o que existe
  agora é padrão **anunciado**.
- **Intervalo mínimo entre crachás diferentes** (`INTERVALO_MINIMO_MS`, 400 ms —
  **e este número ainda não foi medido**).
  Pedido pelo Prof. Paulo contra passar dois cartões de uma vez. O que a regra
  **não** faz precisa estar dito junto: ela não distingue fraude de fila
  apressada, e não pega alguém encostando sozinho o crachá de um colega ausente
  — nenhuma regra de tempo pega. Ela recusa o padrão implausível e **avisa em
  voz alta**; quem julga é o professor, que está na sala.

  Começou em 1 s, por estimativa minha de que "duas pessoas numa fila levam
  segundos". O autor, que já viu a fila, corrigiu: no fim da aula todo mundo
  quer sair, as pessoas se encavalam no leitor, e um segundo trava justamente o
  momento de maior pressa. **Estimativa contra observação, a observação ganha.**
  A escolha é assimétrica de propósito — errar bloqueando custa um toque a mais,
  com o cartão ainda na mão; errar deixando passar grava presença de quem não
  estava. O diagnóstico passou a mostrar **o intervalo entre leituras** para que
  o número saia de medição, e não de palpite.
- **O formato CSV não muda sem motivo.** Ele veio do firmware antigo e continua
  servindo: `;`, BOM, e `evento_id` como chave de idempotência. Os testes usam
  as linhas literais herdadas — mudar o formato é decisão, não descuido.
- **Tela também se testa.** As telas rodam em jsdom contra o `RepositorioDexie`
  de verdade e o `LeitorSimulado` — sem dublê. Dublê que concorda com tudo é
  como se descobre tarde que a tela e o adaptador discordavam, e os defeitos
  achados até aqui (botão morto, `<td>` com `display:flex`, corrida de
  presença) eram todos desse tipo.
- **Crachá desconhecido sempre abre a busca**, sobre a turma inteira e não só
  a fila de pendentes. Quem perdeu o crachá e trouxe outro **já tem** vínculo,
  logo não está na fila — e antes disto não havia como encontrá-lo no dia em
  que aparecia com o cartão novo. Pendentes vêm primeiro, que é o caso provável.
  Desistir continua sendo um clique fora, e aí fica como não cadastrado.
- **Leitura de CSV nunca descarta linha em silêncio.** Toda função devolve
  `{ itens, problemas }`, e a tela mostra linha, conteúdo e motivo. É a mesma
  regra da recusa muda: 46 alunos onde deveria haver 48, sem explicação, é bug.

## O README é vitrine

`README.md` é a primeira impressão do repositório, que é portfólio. Ele conta o
**porquê** das decisões, não a lista de recursos — o que impressiona ali é o
raciocínio, e é o que um recrutador ou um colega consegue julgar sem rodar nada.

Duas regras que ele segue: **nenhum número que envelhece** (contagem de testes
em badge vira mentira na semana seguinte, como a coluna `login` virou), e
**imagens geradas por script** — `scripts/gerar_icone.py`,
`gerar_diagrama.py`, `gerar_arquitetura.py`. Versiona-se o desenho, nunca a
captura, que é a mesma regra que mantém dado real de turma fora daqui.

**Arrastar pinta, 20/08/2026:** aula de 4h ocupa dois blocos seguidos, e três
encontros na semana custavam seis cliques certeiros. **O primeiro bloco decide o
modo** — vazio, o arrasto pinta; marcado, apaga —, que é o comportamento de
calendário e o que evita a alternativa ruim: alternar cada bloco por onde se
passa transforma um tremor da mão em xadrez. Um bloco só muda uma vez por
arrasto. No toque o ponteiro fica capturado pelo primeiro alvo, então o iPad
depende de `elementFromPoint`, e não de `pointerenter`.

**Sábado e a ida e volta do meio-dia, 20/08/2026:** eu tinha escrito que sábado
"existe na universidade e não na grade de ninguém" — a grade real tem
`sáb. 07:00–11:50` e `sáb. 13:00–17:50`, dois blocos longos que **não existem em
dia útil nenhum**, e por isso a linha deles tem uma célula só. O bloco de
12:00–12:50 passou por uma correção e uma retificação: eu li nas capturas, o
autor achou que era almoço, foi conferir e confirmou que algumas turmas têm aula
aí. Fica.

Daí saiu um furo real: `marcadosDe` checava só o horário, então uma aula de
sábado às 08:00 seria marcada numa célula que a tela não desenha, e sumiria
calada. Agora o par **dia e hora** precisa existir.

**Reabrir a chamada, 20/08/2026:** encerrar por engano é fácil, porque o crachá
do professor encerra e ele também é o crachá de alguém que pode encostar sem
pensar. Sem reabrir, a saída seria abrir outra chamada — e a aula ficaria
partida em dois arquivos, com dois horários de abertura. Reabrir grava um `abrir`
novo no log: o registro conta o que aconteceu, inclusive que foi reaberta.

**Os blocos são medidos, 20/08/2026:** o autor mandou as grades de horário reais
de vários períodos do CIn, e dois palpites meus estavam errados — faltava o
bloco de **meio-dia (12:00–12:50, 50 minutos, um crédito só)** e a noite não é
19:00–20:50 e sim **17:00–18:50 e 18:50–20:30, encostados**. Sete blocos, e o de
meio-dia é desenhado mais baixo porque quadradinho de tamanho único mente sobre
a duração. Mesma disciplina dos arcos do NFC: medir em vez de estimar.

A virada da noite tem consequência e está testada: com a folga de 20 minutos, das
18:30 às 19:10 os dois blocos estão acontecendo, e quem dá as duas aulas coladas
recebe `perguntar` em vez de abertura automática. Entre duas turmas plausíveis o
app não adivinha.

**Cronograma feito em 20/08/2026:** a grade existia só como três campos nos
Ajustes — dia, início, fim — e ninguém preenche três campos cinco vezes. O
professor não pensa "quarta, 13h, 14h50"; ele olha a semana e aponta onde a
turma cai, que é como o horário chega até ele em qualquer mural. `nucleo/
horarios.ts` tem os blocos do CIn e a conversão; `ui/TelaCronograma.tsx` desenha
a semana. Vem **depois** de colar a lista, porque a grade precisa saber de qual
turma fala, e **antes** do leitor, porque preencher horário não depende de
dongle. É pulável: a chamada funciona sem ela, só deixa de abrir sozinha.

A porta ganhou `definirHorarioDaTurma`: `zerarAulas` apagava a grade inteira, o
que transformava "mudei a quarta de lugar" em "recadastre tudo". Isso **não**
contradiz a porta não ter `removerEvento` — lá o passado é imutável porque é
registro do que aconteceu; aqui é intenção, e intenção muda.

**Rota `problema` deixou de ser o diagnóstico inteiro, 20/08/2026:** colar a
lista e cair num painel de nove capacidades era eu quebrando a regra que este
arquivo já tinha. `ui/TelaProblema.tsx` tem uma frase e uma ação; o diagnóstico
fica a um clique, que é a diferença entre estar disponível e estar no caminho.

## A validação de 20/08/2026 — feita

Os sete achados do autor percorrendo o fluxo do zero. Os quatro primeiros eram a
mesma doença: **a cerimônia foi desenhada como lista com um modo escondido
dentro.** A barra "Encoste o crachá de" passou a abrir de saída nos dois
caminhos (colar e reabrir turma salva); "Cadastrar crachás" some enquanto ela
está aberta, porque botão que não responde é pior que botão nenhum; "Voltar"
virou "Parar de chamar", já que a lista está logo abaixo e nada sai da tela.

O quarto era o mais escondido: **não havia saída, e o rodapé dizia "Trocar de
turma".** O que encerra o cadastro inicial não é um botão — é o crachá do
professor. Sem ele a chamada não abre; com ele a rota sai sozinha. E os alunos
que faltarem se cadastram encostando, na primeira aula. A tela diz as duas
coisas, na ordem certa.

**Ajustes recolhíveis, e todos começam fechados.** Tentei um critério primeiro —
o que responde uma pergunta abre, o que faz alguma coisa recolhe — e o resultado
foi metade abrindo e metade não, sem que se soubesse qual pelo quê. **Regra com
exceção é regra que o usuário precisa decorar.** Abrir tudo custa um clique;
adivinhar custa a tela inteira. O cabeçalho inteiro é o alvo, e as ações somem
com o painel fechado — botão de zerar ao lado de um título recolhido é convite a
clicar sem ver no quê.

**A grade dos Ajustes virou a mesma semana do cronograma**, com seletor de turma
em cima e gravação a cada toque: em ajustes não existe "salvar", existe mudar. A
grade vive em `ui/componentes/GradeDaSemana.tsx` porque duas implementações
divergiriam, e a dos Ajustes acabaria mentindo sobre a do cadastro.

**Esvaziar a pasta pela mão não muda nada, e agora isso está dito.** O autor
apagou o conteúdo para testar e estranhou. É de propósito: pasta no iCloud que
ainda não sincronizou, ou volume desmontado, aparecem vazios — apagar a base
local por causa disso seria perder a turma por um problema de rede. **A pasta é
dona do que ela tem, não do que falta nela.** Faltava o gesto explícito, e agora
existe: `Desconectar`, que solta o vínculo sem apagar arquivo nem base.

**O carimbo da build aparece nos Ajustes.** "Não achei a mudança" sumia no meio
de cache, PWA instalado e aba antiga, e aconteceu mais de uma vez. Com a versão
na tela, vira comparação. `__CARIMBO__` vem do `vite.config.ts`, e o
`vitest.config.ts` precisa do mesmo `define` — são configs separadas, e sem isso
qualquer tela que o mostre estoura no teste por um motivo que não é do app.

**O primeiro dia e "mais um crachá" eram a mesma tela.** Só o botão do rodapé
os distinguia, e a pergunta do autor — "fica claro quando é cadastro inicial?" —
tinha a resposta óbvia. O título diz agora: `Primeiro dia · IF685 · T01` contra
`Cadastrar mais um crachá`, e a legenda muda junto, porque contar quantos faltam
só é notícia no primeiro dia.

**Recomeçar do zero saiu do modo de ensaio.** Existia só lá, e o professor
também precisa: fim de semestre, máquina que muda de dono, refazer o cadastro sem
resíduo. **O texto importa mais que o botão** — "apagar tudo" não diz o quê, e
aqui há duas coisas com destinos diferentes: a base deste navegador some, os
arquivos da pasta ficam. Sem dizer isso, o professor apaga achando que apagou os
dois, ou não apaga achando que apagaria. As preferências vão junto: meio zero é
pior que nenhum, porque o comportamento estranho não tem explicação na tela.

**A tag do ensaio passou a mudar com a rota.** `N` produz crachá desconhecido em
qualquer tela, mas só na chamada isso abre a lupa — na cerimônia, crachá
desconhecido é o cadastro de quem está sendo chamado. A tag dizia sempre a mesma
coisa, e o autor apertou `N` na cerimônia esperando a busca. **Ensaio que não diz
em que estado está não valida fluxo nenhum**, e é o mesmo defeito do `P`.

Fica em aberto a suspeita que motivou tudo: `TelaVinculo` e `TelaAula` chamam um
nome e esperam um crachá, e este arquivo já diz que "a cerimônia é a primeira
chamada". São duas telas para uma coisa só, e unificá-las apagaria a classe
inteira de defeitos em vez de remendá-los um a um.

**A cerimônia expulsava a si mesma, achado ao vivo em 20/08/2026.** O autor
colou a turma, preencheu o cronograma, e ficou sem saber o que fazer depois de
cadastrar só os crachás de quem estava na sala. A causa: `professorSemCracha` é
recalculado a cada vínculo gravado, e a rota decidia por ele a cada render —
o crachá do próprio professor, tocado no meio da fila, mudava esse estado e a
rota saltava para `'pronto'` na hora, debaixo do professor, antes de ele poder
chamar o próximo aluno. Seguir a instrução da própria tela ("comece pelo seu
crachá") acionava o bug.

O que mudou foi quem decide *quando* sair da tela: antes era a rota,
recalculada a cada gravação; agora é `modoCadastro`, em `Fluxo.tsx`, que só
muda por um gesto explícito ("Concluir").

**Eu tinha escrito, logo abaixo desse conserto: "o crachá do professor
continua sendo o que teria que existir pra chamada abrir." O autor discordou
na hora — "não deveria ser bloqueante o professor não ter o crachá" — e ele
tinha razão duas vezes seguidas, sobre duas coisas diferentes.**

A primeira rodada corrigiu só a **tela de cadastro**: `cadastroDispensado`,
em `ambiente/preferencias.ts` (mesmo padrão de `pastaDispensada`), deixava
sair dela sem crachá nenhum — mas o repouso ainda dizia **"Falta o crachá do
professor, sem ele a chamada não abre"**, e isso era exatamente a mesma
premissa de novo, só que uma tela adiante. Clicar em "Concluir" continuava
levando a um beco.

A correção de verdade foi noutro lugar: `garantirProfessor()`, em
`Fluxo.tsx`. **"Começar a chamada" e encostar o crachá do professor têm que
ser gestos equivalentes desde o primeiro uso — passar o crachá é opcional,
nunca pré-requisito.** Sem vínculo de professor nenhum, o clique cria um na
hora — `uidHashSintetico()`, em `nucleo/hash.ts`, do mesmo formato e
comprimento de um `uid_hash` de verdade, só que sorteado, sem crachá físico
atrás — com o nome do docente que o SIGAA já apontou, se a turma tiver um.
Esse vínculo abre e fecha aula igual a qualquer outro; a grade automática o
reconhece igual. `cadastroDispensado` continua existindo — ainda é o que
deixa sair da cerimônia no meio da fila —, mas o repouso voltou a dizer
sempre "Tudo pronto", porque agora essa frase é sempre verdade: o botão
funciona de cara. Não sobrou estado nenhum em que "começar a chamada" pede
alguma coisa que só um crachá físico dá.

Achado no mesmo fôlego: "Concluir" morava depois da lista inteira de
matriculados — numa turma de 49, inalcançável sem rolar a tela toda, e foi
isso que o autor via como "difícil de acessar". Ele mora no cabeçalho do
painel agora (`acoes`, em `TelaVinculo.tsx`), visível mesmo no meio de uma
chamada em andamento — o único dos dois botões do cabeçalho que não some
quando a barra está aberta, porque sair sempre faz sentido, chamando alguém
ou não.

Foi testando isso ao vivo que apareceu o defeito irmão: reabrir "Cadastrar mais
um crachá" chamava o professor de novo, sempre. `abrirTurma`, em
`TelaVinculo.tsx`, reconhecia "já tem crachá" só por matrícula — e o docente
não tem matrícula na página do SIGAA. É o mesmo bug que `recontar()`, em
`Fluxo.tsx`, já tinha corrigido para a contagem de pendentes ("Quem já tem
crachá é reconhecido pela matrícula — e, para quem não tem matrícula, pelo
nome"), só que a correção nunca chegou a `abrirTurma`. Segunda via por nome,
igual à de lá.

## Palavras que não se usam

**"Armar" e "armado" saíram em 20/08/2026.** O autor tinha pedido a troca antes,
e só o texto de tela mudou — os identificadores, as classes de CSS e os
comentários seguiram com a palavra. Ela lembra arma, não é institucional, e nada
justificava mantê-la: a pessoa cujo nome aparece grande na tela está **chamada**,
que é o que se faz numa chamada. `chamado` em toda parte.

**"Aparelho" é do A1**, e onde ele significava "esta máquina" virou
**computador** — inclusive na descrição do manifesto, que é o que o professor lê
ao instalar. Onde a palavra conta história ("o verde que estava aqui era do Adsum
A1"), ela fica: aí ela explica uma decisão.

Palavra herdada não some porque a tela mudou. Ela mora nos identificadores, e é
lá que precisa ser procurada.

## Voz da interface

O texto de tela não é o texto dos comentários. Nos comentários o travessão
carrega o raciocínio; **na tela ele soa a ensaio**, e o autor notou isso na
primeira frase que leu em voz alta: "parece de IA".

A regra: **travessão em tela quase sempre é duas frases disfarçadas de uma.**
Separe, ou use dois-pontos quando a segunda parte explica a primeira. Frase
curta e completa ganha de fragmento elegante.

E título não repete o verbo do botão. "Instalar o Adsum" com um botão
"Instalar" logo ao lado é a mesma palavra duas vezes; o título vale mais dizendo
o que a pessoa ganha — "O Adsum em janela própria".

## Convenções

- Documentação, comentários **e identificadores de domínio** em português. É
  divergência deliberada do `../Adsum/CLAUDE.md`, que pede identificadores em
  inglês: aqui as duas portas se chamam `LeitorDeCracha` e `Repositorio`, e
  metade em cada idioma seria pior que qualquer das duas escolhas inteiras.
- Comentário explica **por que**, não o quê. Preferência por registrar a
  decisão e o que ela custou.
- Um documento por assunto em `docs/`, numerado.

## Arquitetura

Portas e adaptadores, porque **o leitor vai mudar**:

```
nucleo/       domínio puro — UID, hash, tipos, CSV. Sem React, sem Dexie.
portas/       LeitorDeCracha, Repositorio
adaptadores/  LeitorTeclado (dongle USB), LeitorSimulado, LeitorWebNfc,
              RepositorioDexie
ambiente/     capacidades do navegador, entrada e saída de arquivo
ui/           telas
```

**O dongle é HID de teclado.** Ele "digita" o UID, e por isso o adaptador não
precisa de permissão, driver nem API experimental — funciona igual em Chrome,
Safari e Firefox. A separação entre o dongle e quem digita é pelo **ritmo**:
ver `nucleo/digitacao.ts`. Qual formato ele imprime (hexadecimal ou decimal) só
se sabe com ele na mão, e o diagnóstico mostra a última rajada crua para
responder isso no primeiro toque.

**`#/vitrine` mostra todas as telas numa página**, e **vai ao ar**: é como um
professor conhece o Adsum inteiro sem cadastrar turma nenhuma, e como opina
sobre uma tela que de outro modo só encontraria no meio de uma aula. As duas
que montam com o contexto de verdade — Base e Diagnóstico — ficam de fora da
versão publicada: seus botões zeram grade e apagam tudo, na base de quem abrir.

`src/ui/adsum.ts` guarda a lista `LEITORES`. Adaptador novo entra ali e aparece
sozinho na escolha do diagnóstico — nenhuma tela precisa saber que ele existe.

`LeitorSimulavel` e `RepositorioApagavel` estendem as portas e ficam **fora**
delas de propósito: são ferramentas de diagnóstico, e o acesso passa por um
`ehSimulavel()` / `podeApagar()`. Leitor de verdade não implementa `SIMULAR`.

## Estado atual

Atualizado em 18/08/2026. **Passos 1, 2 e 3 de 6 feitos**, com a lista do SIGAA
lida de verdade — nome completo e matrícula, guardados por turma. Medido na
turma real do IF685: **49 de 49**, batendo com `Docentes (2)` e `Discentes (47)`,
nenhum nome estourando a coluna de 210 px e quatro logins que são só dígitos
(duas matrículas e dois que têm cara de CPF), sinalizados na tela.

Mais o `LeitorWebNfc` adiantado do passo 5 (ver `docs/00_roadmap.md`).
`npm test`: 147 testes, incluindo as telas.
Publicado em `willianrupert.github.io/adsum/`, com os testes rodando na
publicação.

**O crachá do CIn é lido pelo Chrome no Android.** Medido em 18/08/2026 com
crachá de verdade: permissão concedida, quatro leituras com UID. O Web NFC é
especificado para tags NFC Forum tipo 1–5 e o Mifare Classic não é nenhum
desses — o Chromium entrega o `serialNumber` assim mesmo.

Verificado no navegador:

- as nove capacidades detectadas, com service worker controlando a página;
- leitura simulada percorrendo UID → `uid_hash` → vínculo, inclusive UID de
  7 bytes;
- a volta do baralho reencontrando UID já visto — é assim que se exercita
  duplicata sem ter dois crachás na mão;
- `semear` duas vezes sem duplicar evento. A idempotência por `evento_id` sai
  da chave primária do IndexedDB, não da intenção de quem chama;
- **offline de verdade**: com o servidor derrubado, o app recarrega inteiro do
  precache sob `/adsum/`, a base local sobrevive e o leitor continua
  respondendo;
- vínculo renomeado na tela sobrevive ao recarregamento — gravou no banco, não
  só no React;
- a cerimônia inteira, com leitor simulado: dica de docente no topo, avanço
  automático, `Maria Vitoria S.` / `Maria Vitoria A.` desempatadas pela inicial
  do último sobrenome, quatro crachás para o mesmo aluno aceitos, e crachá já
  vinculado **recusado dizendo de quem é**, com o nome chamado continuando
  chamado;
- o toggle de papel: marcar professor grava `papel: professor` e apaga o aviso
  de "ninguém está marcado como professor";
- trocar para o `LeitorWebNfc` no desktop falha **dizendo o motivo** ("só o
  Chrome no Android tem"), e voltar para o simulado recupera o estado `lendo`;
- `semear` duas vezes não cria aula duplicada nem evento duplicado.

Pendente de verificação visual: o layout abaixo da primeira dobra — foi
conferido pelo texto do DOM, não a olho.

## Pendências abertas

- **Sal de frota.** O campo de importar já existe no Repositório, mas ninguém
  copiou o sal de um A1 real ainda — o comando `SAL` do protocolo CDC é do
  passo 5.
- **O UID do celular pode não ser o UID do PN532.** O Web NFC funciona, mas
  nada prova ainda que os bytes que o Chromium entrega são os mesmos, **na mesma
  ordem e no mesmo comprimento**, que o PN532 vai ler do mesmo crachá. Pilhas
  NFC divergem nisso — cascade tag em UID de 7 bytes, ordem invertida. Se
  divergirem, vínculo feito pelo celular **não é reconhecido pelo aparelho**
  nem com sal compartilhado, e o problema aparece na frente da turma.

  O teste, quando a peça chegar: encostar o mesmo crachá nos dois e comparar o
  UID cru. A tela de diagnóstico já mostra os bytes (`04 a2 3b 91`) justamente
  para permitir essa comparação a olho. Enquanto não for feito, tratar vínculo
  do celular e vínculo do aparelho como bases separadas.
- **`alunos.csv` continua com três colunas** (`uid_hash;papel;nome`), que é o
  que o firmware lê. A matrícula fica na base local e é preenchida **na saída**
  do `registros/<turma>.csv`, a partir do vínculo — assim corrigir uma matrícula
  corrige as exportações seguintes sem reescrever uma linha do log.
- **Login que é só dígitos.** O SIGAA cai na matrícula, e às vezes no CPF,
  quando a pessoa não escolheu login. A tela marca com `só número`, mas a
  decisão é humana: CPF não deveria virar identificador de presença nem chegar
  à planilha.
- **Armazenamento persistente costuma ser recusado** enquanto o app não é
  instalado. Sem ele o navegador pode apagar a base sob pressão de espaço — por
  isso o diagnóstico mostra o estado e oferece o botão de pedir.
- **`base` do Vite é `/adsum/`**, para `github.com/willianrupert/adsum`. A pasta
  local continua `Adsum_web` — nome de pasta e nome de repositório não precisam
  bater, e o do site é o que aparece na URL. Renomear o repositório sem ajustar
  `vite.config.ts` publica um site que não carrega nada.
- **O firmware ainda não é repositório.** Se um dia for, `adsum` já estará
  ocupado por este — o nome natural para ele é `adsum-a1`, que é a nomenclatura
  do próprio projeto: Adsum é o sistema, Adsum A1 é o aparelho.

## Herança indevida — a decidir antes de continuar

O autor criou este projeto **do zero**. A sessão de 18/08/2026 ancorou tudo no
`~/Projetos/Adsum` (hardware ESP32, hoje morto) sem que isso fosse pedido.
Inventário para decidir o que fica:

**Já removido:** `LIMITE_LISTA`, `MAX_BYTES` e as tabelas `A20`/`A24` de
`nucleo/nomes.ts` — mediam um display que não existe.

**Já removido também:** `alunos.csv` e `grade.csv` — viraram `vinculos.json` e
`grade.json` em `nucleo/cofre.ts`, com `versao` no topo. O `csv.ts` ficou só
com `registros/<turma>.csv`, nas colunas de `docs/02_formato.md`. E `;` + BOM
**ficam** — nunca foram do firmware, são do Excel em português.

**Rota única feita:** `nucleo/rota.ts` decide a tela a partir do estado, e
`ui/Fluxo.tsx` a monta. Diagnóstico e Repositório viraram folhas, atrás de dois
selos discretos.

**Coleta feita:** `nucleo/sessao.ts` tem as regras puras (quem conta presença,
quem não conta, a janela de 10 s antes de aceitar o fechamento) e
`ui/TelaColeta.tsx` desenha. Som por Web Audio, tocado **depois** de gravar. A
tela se reconstrói do log: fechar o notebook no meio da aula não perde a
chamada.

**Cofre feito:** `ambiente/pasta.ts` (File System Access) e
`ambiente/sincronia.ts`. A pasta é a dona; o IndexedDB é cache. `restaurar()`
reconstrói a base inteira lendo a pasta, e há teste que apaga o cache e prova
isso — é o que separa "cofre" de "mais um backup". O handle fica guardado, e
limpar dados do site apaga o handle, **não** a pasta.

**Sal do cofre, corrigido em 19/08/2026:** `restaurar` e `restaurarDeArquivos`
não liam `config.json`, e o sal não voltava. Como cada navegador sorteia o dele
ao abrir, restaurar devolvia os nomes e **perdia as pessoas** — mesmo crachá,
outro hash, turma inteira desconhecida, sem erro. Derrubava a promessa de que
limpar dados do site não perde nada. `adotarSal` roda antes de tudo nas duas
restaurações e adota **só o sal**: o `instalacaoId` tem de continuar diferente
por navegador, senão duas instalações cunham o mesmo `evento_id`. Não troca por
cima de vínculos locais — aí a decisão é humana. Ver `docs/01_cofre.md`.

**As teclas de ensaio, corrigidas em 20/08/2026:** o autor perguntou como `P`
podia representar o crachá do professor antes de o professor ter crachá. Não
podia: a tecla não fazia nada e não dizia nada. Agora ela explica que o crachá
dele nasce na cerimônia. E faltava um estado inteiro — **não havia como produzir
um crachá desconhecido depois da cerimônia**, porque o baralho é finito e,
cadastrado inteiro, toda carta vira gente conhecida. `N` (`uidInedito`) sorteia
um crachá que o app nunca viu, e é o que torna a busca do desconhecido
exercitável à mão. **Ensaio que não alcança todos os estados não valida fluxo
nenhum.**

**Modo de ensaio em 19/08/2026:** `ambiente/preferencias.ts` guarda o que é
desta máquina — modo de ensaio, leitor escolhido, conselho dispensado — no
`localStorage` e **não** no cofre, senão o professor que recebe a pasta herdaria
o modo de ensaio de quem a mandou. Desligado por padrão, e com ele desligado
somem leitor simulado, teclas `espaço`/`P`, semear e apagar. A regra do que fica
atrás dele: **se existe para provar que o programa funciona, é ensaio; se existe
para descobrir por que não funcionou, é diagnóstico, e diagnóstico é de
produção.** Dois defeitos apareceram na hora: o padrão publicado era o leitor
**simulado**, e a escolha de leitor não sobrevivia ao recarregamento.

**A pasta se explica em 19/08/2026:** `LEIA-ME.txt` é gravado a cada
sincronização (`paraLeiaMe` em `nucleo/cofre.ts`) e diz o que é cada arquivo,
como recuperar tudo nos dois caminhos, que ali há dado pessoal e o que não
apagar. `.txt` e não `.md` porque abre limpo com dois cliques. Teste amarra o
texto aos nomes reais — documentação que descreve arquivo inexistente é pior que
nenhuma. Junto veio **"Reler a pasta"** nos Ajustes: era o único caminho de
**puxar** que faltava — `consertarPasta` empurra cache → pasta e a restauração
automática só dispara com a base vazia, então pasta no iCloud atualizada por
outra máquina nunca entrava, apesar de "a pasta é a dona".

**Pendências feitas em 19/08/2026:** nada registrava o que já tinha sido
exportado, então "concluir sem salvar" apagava a pendência da tela e da memória
do app ao mesmo tempo. `nucleo/pendencias.ts` tem a regra pura e
`Config.exportado` guarda `turma → quando do último evento exportado` — data e
não contagem, porque contagem mentiria para menos se o log recebesse eventos
antigos. Cobrado em três lugares: selo do canto, bloco no repouso e
`beforeunload` (só quando há o que perder). Com pasta é zero por construção.

**Convite de instalar no Chrome, 20/08/2026:** o `beforeinstallprompt` chega
**uma vez só** e pode chegar antes de o React montar, então o ouvinte é de
módulo em `ambiente/instalacao.ts`, não de componente. Ali não é sobre perder
dados — com pasta, nada se perde — é sobre janela própria e abrir num clique.
Por isso é convite e não aviso, e recusar dispensa para sempre: insistir a cada
abertura é como um convite vira incômodo.

**Safari feito:** `ambiente/instalacao.ts` separa quem tem prazo (WebKit) de
quem só não tem pasta (Firefox), e `ui/TelaNavegador.tsx` tem duas caras na rota
`'navegador'`: no WebKit **recomenda Chrome/Edge no título** e ensina o caminho do menu
logo abaixo, como plano B (não há botão de instalar, `beforeinstallprompt` é do
Chromium); no
Firefox trocar de navegador **é** a ação, porque lá não há conserto no lugar.
Onde há seletor de pasta não há tela nenhuma — o app já está no melhor arranjo.
`TelaResumo` inverte a hierarquia sem pasta: salvar é a ação de acento, concluir
vira "concluir sem salvar". Ler a pasta já era um clique no Safari via
`webkitdirectory`; o que falta lá é só escrever de volta sozinho.

**Ainda a fazer:** a passada visual (tipografia, espaço, claro/escuro,
Mushroom cards) e o corte de texto das telas de vínculo e base.

**Vale por si, independente de hardware:**
- ler só o UID público, nunca Crypto1 — é legitimidade, não limitação técnica
- hash com sal — é privacidade
- registro append-only
- um só nome chamado por vez na cerimônia — é a garantia contra trocar aluno
- leitura da página do SIGAA: nome, matrícula, conferência do total
- encurtar nome por legibilidade (o conceito, não os números)

**Nascido aqui:** rota é o estado, orçamento de toques, o cofre em `docs/01`.
