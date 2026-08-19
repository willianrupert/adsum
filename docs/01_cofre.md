# 01 — O cofre

Não implementado. Desenho registrado em 18/08/2026 para a próxima sessão.

## A inversão

Hoje o IndexedDB é o dono e o arquivo é cópia. Isso é o que faz o professor
poder perder tudo: limpar dados do site apaga a base, e a cópia só existe se
alguém lembrou de exportar.

**A pasta passa a ser a dona. O IndexedDB vira cache, descartável por
definição.** Perder a base deixa de ser um clique de limpeza e passa a exigir
apagar uma pasta — que tem Lixeira, sincronização e consciência no meio.

Consequência prática: o app pode jogar fora o IndexedDB inteiro a qualquer
momento e reconstruí-lo lendo a pasta. Se isso não for verdade, a inversão não
aconteceu de fato.

## Layout

```
Adsum/
  config.json        sal, preferências, versão do formato
  vinculos.json      uid_hash → { login, nome, papel, criadoEm }
  turmas/
    IF685-T01.json   lista da turma: login, nome completo, nome curto, papel
  registros.csv      append-only, é o que a planilha consome
```

**JSON para o que é reescrito, CSV para o que só cresce.** Vínculo e turma são
corrigidos — nome errado, papel trocado, aluno que trancou — então reescrever o
arquivo inteiro é o certo. Registro nunca é corrigido: linha nova sempre.

Um arquivo por turma, e não um arquivo com todas: reimportar uma turma toca um
arquivo só, e uma turma corrompida não leva as outras junto.

## Como cada arquivo é escrito

| Arquivo | Escrita | Por quê |
|---|---|---|
| `config.json`, `vinculos.json`, `grade.json`, `turmas/*.json` | reescrita inteira | são corrigidos: nome errado, papel trocado, aluno que trancou |
| `registros/<turma>.csv` | **append, uma linha por vez** | é log; e regravar a cada crachá seria trabalho crescente por leitura |

O append não é preferência de estilo. Com cinquenta alunos numa fila, regravar
o arquivo a cada leitura cresce com o tamanho da aula. E com a pasta
sincronizada, reescrever apagaria a aula que a outra máquina acabou de gravar —
enquanto o append, no pior caso, gera arquivo em conflito com **nenhuma linha
perdida**, e `evento_id` deduplica na junção.

## Regras

- **`registros.csv` é append puro.** Sem `seek`, sem reescrita, sem rename.
  Linha só vale se terminar em `\n`; truncada na ponta é descartada.
- **Escrever antes de dar o retorno.** O bipe significa "está no disco", não
  "eu ouvi". `close()` do `FileSystemWritableFileStream` antes do som.
- **`version` no `config.json`.** Sem ele, a primeira mudança de formato
  encontra pastas antigas sem saber que são antigas.

## Pasta sincronizada

Se a pasta ficar no iCloud ou no Drive, backup fora da máquina e troca de
computador saem de graça, sem servidor nosso. Em troca vêm dois problemas que
não existiam:

- **Duas máquinas escrevendo.** Para os JSON, a última escrita vence e alguma
  coisa se perde. Para `registros.csv`, append-only faz o serviço sozinho: o
  serviço de sincronização pode gerar arquivo em conflito, mas **nenhuma linha
  se perde**, e `evento_id` deduplica na junção. É mais uma razão para o log
  nunca virar JSON.
- **O sal viaja junto.** Ele mora no `config.json` e é o único segredo do
  sistema — pasta sincronizada significa sal na nuvem. É decisão consciente, e
  o alternativo (sal fora da pasta) quebra a troca de máquina, que era o ponto.

## Quando a gravação falha

Permissão revogada, pasta desmontada, disco cheio. O que **não** pode acontecer
é a aula seguir parecendo salva — gravação que falha em silêncio é o pior
defeito possível aqui, porque só se descobre depois, quando não dá mais para
recuperar a chamada.

O desenho: o erro vira estado visível (o selo do rodapé fica vermelho e um aviso
explica), **o dado continua no cache**, e existe um botão que regrava. O
conserto usa `repararLog`, que reescreve o log a partir do cache — legítimo aqui
porque o cache tem tudo o que a pasta tem e mais, e proibido no caminho normal,
onde regravar apagaria o que outra máquina escreveu.

## Reconexão

O `FileSystemDirectoryHandle` é guardado no IndexedDB e reusado. Limpar dados
do site apaga o handle, **não a pasta**: o professor reescolhe a pasta e tudo
volta. Esse caminho de reescolher precisa ser tão bom quanto o primeiro uso —
é ele que transforma "perdi tudo" em "cliquei de novo".

## Onde não funciona

Só Chrome e Edge têm seletor de diretório. **O OPFS do Safari não serve:** mora
dentro do armazenamento do navegador, não aparece no Finder e some ao limpar
dados do site — é o problema original com outro nome. Em Safari e Firefox,
degrada para exportar e importar arquivo à mão, e o app deve dizer isso em vez
de fingir que está guardado.

## O Safari tem prazo, e isso muda o desenho

Medido em 19/08/2026, ao rever o texto que dizia só "os dados ficam no
navegador". Está errado por omissão: no WebKit **não é inconveniência, é
prazo**. O ITP apaga toda a escrita de script — IndexedDB, localStorage e até o
registro do service worker — depois de **sete dias de uso do Safari sem visitar
o site**. Não é despejo sob pressão de espaço, que é raro e imprevisível: é
rotina. Um recesso e o cadastro da turma some sem uma palavra.

O Firefox também não tem seletor de pasta, mas **não apaga nada sozinho**. São
dois casos diferentes e o aviso tem de distinguir — senão mente para metade dos
navegadores. É o que `ambiente/instalacao.ts` separa: `ehWebKit()` marca quem
tem prazo, e o Firefox fica de fora de propósito.

### A saída é do próprio WebKit

App adicionado ao Dock (macOS) ou à tela de início (iOS) **sai do Safari**:
ganha container de armazenamento próprio, e o ITP pula esse domínio no
algoritmo de remoção. O contador passa a ser de uso do app.

Duas consequências que mudaram o desenho, e não são detalhe de texto:

1. **O convite vem antes de cadastrar a turma.** Armazenamento próprio quer
   dizer separado: o app instalado **não enxerga** o que ficou na aba. Instalar
   depois faria o professor recomeçar. Por isso `rota.ts` ganhou `'instalar'`,
   no mesmo lugar onde o Chrome pede a pasta — nos dois a primeira pergunta é
   "onde isto vai viver", e só muda a resposta que cada navegador sabe dar.
2. **Não há botão.** `beforeinstallprompt` é do Chromium; o Safari não expõe
   nada para clicar. A tela só pode ensinar o caminho do menu, e o peso vem do
   tamanho e do espaço em vez de uma pílula azul que convidaria ao clique
   inútil.

### O que já era seamless, e ninguém tinha dito

**Ler já é um clique.** `abrirVarios()` usa `webkitdirectory`, e com ele o
Safari oferece a **pasta inteira** — restaurar o cofre lá é tão bom quanto no
Chrome. O que falta é só escrever de volta sozinho.

**Escrever é um clique também, só que manual.** O Safari baixa **sem diálogo**,
na pasta configurada nas preferências. Se o professor apontar os downloads para
uma pasta no iCloud Drive, cada exportação cai fora da máquina sozinha. O que
não dá é *append*: cada gravação é arquivo novo, e os nomes acumulam.

Daí a inversão em `TelaResumo`: sem pasta, **salvar é a ação de acento** e
concluir vira "concluir sem salvar". Botão secundário para a única coisa que
preserva a aula é mentira de desenho. E como o download não abre diálogo, a
tela precisa dizer que baixou — sem isso o clique não produz sinal nenhum e o
professor clica de novo achando que falhou.

**O saldo honesto:** o Safari fica **um clique atrás** do Chrome, por aula. Esse
clique é decisão da Apple, não do projeto.

## Trocar de navegador na mesma máquina

Perguntado em 19/08/2026, e a expectativa do autor era a certa: **deve ser
normal**. Não era — havia uma falha calada, e ela derrubava a promessa central
do cofre.

O `uid_hash` é `SHA-256(sal ‖ uid)`, e **cada navegador sorteia o sal dele ao
abrir**. O `sincronizar` escrevia `config.json` na pasta, mas nem `restaurar`
nem `restaurarDeArquivos` liam esse arquivo de volta — o `config.json` estava
explicitamente na lista de pulados. Consequência: restaurar devolvia os nomes e
**perdia as pessoas**. O mesmo crachá passava a dar outro hash, a turma inteira
virava gente desconhecida, e o professor recadastraria os quarenta e nove por
cima, criando vínculos em dois sais para as mesmas pessoas. Sem erro nenhum.

Isso não era só sobre trocar de navegador. **"Limpar dados do site apaga o
handle, não a pasta"** só é verdade se o sal voltar junto — e ele não voltava.
Navegador de verdade apaga a config junto com o resto.

Por que os testes não pegaram: eles usavam `esvaziarCache()`, que preserva a
config **de propósito**, e portanto nunca exercitaram a perda do sal. O teste
que faltava é o que usa **dois repositórios diferentes** — que é o que dois
navegadores são.

### O que ficou

`adotarSal` roda antes de tudo nas duas restaurações, e:

- **só o sal.** O `instalacaoId` prefixa o `evento_id` e tem de continuar
  diferente em cada navegador: é ele que garante que duas instalações nunca
  cunhem o mesmo id, e é o que deixa dois logs coexistirem na mesma pasta sem
  que a idempotência engula registro de verdade;
- **não troca por cima de vínculos locais.** Trocar o sal com base própria no
  lugar torna irreconhecíveis os crachás daqui. A recusa é dita, e o caminho
  humano já existe: "Passar os crachás a outro professor" pergunta antes.

### O que continua sendo diferente entre navegadores, e é esperado

- **Só o Chrome e o Edge escrevem na pasta.** Uma aula dada no Safari fica no
  IndexedDB dele até ser exportada — a pasta não recebe sozinha.
- **A sessão aberta é local.** Trocar de navegador no meio de uma aula não leva
  a aula junto; a chamada se reconstrói do log, mas dentro do mesmo navegador.
- **Chrome e Edge apontando para a mesma pasta ao mesmo tempo:** o log é append
  com `evento_id` idempotente e junta sozinho, mas `sincronizar` reescreve
  `vinculos.json`, `grade.json` e `turmas/` por inteiro — o último a gravar
  ganha. Alternar tudo bem; usar os dois na mesma aula, não.

## "Fica lá até ser exportada" não era seguro

Perguntado em 19/08/2026. A resposta honesta era **não**, e o defeito não estava
no armazenamento — estava na **memória do app**.

Nada registrava o que já tinha sido exportado. Consequência: `TelaResumo` dizia
"salve o arquivo", o professor clicava em *concluir sem salvar*, e a pendência
sumia da tela e da memória do programa ao mesmo tempo. Depois disso **nada**
distinguia uma base inteira salva de uma aula inteira por salvar. O aviso do
canto falava do navegador ("sem pasta", "apaga em 7 dias"), nunca do trabalho.

### A marca

`Config.exportado` é `turma → quando do último evento exportado`. Data e não
contagem: se um dia o log receber eventos antigos — restauração vinda de outra
máquina —, contagem passaria a mentir **para menos**, e errar para menos aqui é
dizer "está tudo salvo" quando não está.

A marca sai do **conteúdo do arquivo** (`marcarAte`), não de `Date.now()`: se a
exportação levou 40 registros, é o quadragésimo que ficou salvo. Com o relógio,
uma leitura chegando durante a gravação ficaria marcada como salva sem estar.
E **cancelar o diálogo não marca nada**.

Campo novo dentro do registro de config, não tabela nova: `version(n)` do Dexie
descreve índices, e a marca nunca é consultada por índice.

### Três lugares, porque um só não basta

1. **O selo do canto** passa a contar registros por salvar, em tom grave, e
   vence os outros avisos: os outros descrevem o navegador, este descreve uma
   aula em risco.
2. **O repouso cobra**, com turma, quantidade e desde quando — é onde o
   professor cai depois de encerrar, e a única tela que pode lembrá-lo. A
   pendência empurra o "encoste o crachá" para baixo: enquanto houver aula só
   no navegador, ela é a tarefa da tela.
3. **`beforeunload`**, só quando há o que perder. Fechar a aba é um gesto de um
   segundo e era a forma mais fácil de perder a chamada. Um aviso sempre ligado
   viraria ruído e seria ignorado justamente quando importasse.

### O que continua sem garantia, e é preciso dizer

- **O arquivo salvo cai no mesmo disco.** Downloads é uma pasta local; se a
  máquina se perder, as duas cópias se perdem juntas. A cópia fora da máquina só
  existe se o professor apontar a pasta de downloads do Safari para o iCloud
  Drive — aí cada exportação sai da máquina sozinha.
- **O app avisa, não obriga.** `beforeunload` é descartável com um clique.
- **Se ele nunca mais abrir o app**, o prazo do WebKit corre e leva a pendência
  junto com a base. Instalar é o que tira esse prazo do caminho.

Com pasta nada disso existe: cada evento é gravado no ato, e `porSalvar` é zero
por construção.

## A recomendação de navegador, e por que ela é por navegador

Pedida em 19/08/2026, concisa. A ironia foi notada pelo autor: um app desenhado
à Apple recomendando Chrome. A saída foi não fazer piada — **o motivo faz o
trabalho**, e ele cabe numa frase.

A rota `'navegador'` ocupa o mesmo lugar em que o Chrome pede a pasta, porque é
a mesma pergunta: onde isto vai viver. O que muda é a resposta que cada
navegador sabe dar, e daí as duas caras:

- **WebKit na aba** — existe conserto no lugar. A ação é instalar, com o caminho
  do menu ali mesmo, e a recomendação de Chrome/Edge vem **depois**. Mandar
  trocar de navegador como primeira frase presume que a pessoa tem outro.
- **Firefox** — não tem pasta, não apaga sozinho, e instalar não muda nada. O
  único ganho real é trocar, então trocar **é** a ação da tela. Oferecer outra
  coisa como se resolvesse seria mentira. Antes disto o Firefox não recebia
  aviso nenhum: caía direto em "cole sua turma".
- **Chrome e Edge** — nenhuma tela. Já estão no melhor arranjo que existe, e uma
  tela a mais seria só um toque a mais.

O motivo é sempre o mesmo, mas a frase não pode ser: numa tela ele vem depois de
nomear o Chrome ("lá cada presença…"), na outra ele **é** a abertura. A primeira
versão compartilhava o texto e deixava um "lá" sem antecedente — abstrair prosa
só porque ela se repete é como se escreve frase que não fecha.

**Efeito colateral nos testes:** o jsdom não tem seletor de pasta, então o
conselho passou a valer nele e virou a primeira tela de toda a suíte. Quem não
está testando o conselho dispensa no `beforeEach` — é o equivalente ao professor
que já decidiu.

## Auditoria do texto, 19/08/2026

O autor questionou duas frases. Uma estava errada, uma estava frouxa, e a
terceira — a recomendação de Chrome — ficou como estava, com fonte a mais.

**Errada: "sete dias sem visita."** O WebKit conta **sete dias de uso do
Safari** sem interação com o site, não dias de calendário. Um mês sem abrir o
Safari não gasta um dia sequer. A diferença importa: um professor de férias não
perde a turma por ficar longe do computador, perde por usar o Safari para outras
coisas sem voltar aqui. Corrigido em `TelaNavegador`, `TelaRepositorio`,
`TelaResumo` e no selo do canto — que virou "o Safari pode apagar a base
sozinho", curto e sem prometer calendário. Exagerar um risco verdadeiro é a
forma mais rápida de o aviso deixar de ser levado a sério.

**Frouxa: "o Adsum abre sozinho numa janela própria."** Que o ícone entra no
Dock na hora está documentado; que a janela se abre por conta própria, não.
Sumiu da tela, e não fazia falta nenhuma.

**Reforçada: "o app instalado começa em branco."** É melhor documentada do que
eu supunha — ao adicionar ao Dock, o Safari **copia os cookies** para o web app
e **nenhum outro armazenamento local**. IndexedDB não vai junto, então a base
realmente começa vazia, e instalar depois de cadastrar a turma faz recomeçar.

**O que continua sendo inferência, e precisa estar dito:** a isenção do prazo
para app instalado é **documentada pelo WebKit para a tela de início do iOS**.
Para o `Adicionar ao Dock` do macOS, o que a Apple documenta é o armazenamento
separado — "não compartilha histórico, cookies, dados de sites nem ajustes com o
Safari". A isenção decorre disso (o contador é por contexto, e o web app não é o
Safari), mas não achei documento da Apple dizendo isso do macOS com todas as
letras. Por isso o texto da tela afirma só o que é certo: **o app instalado
guarda por fora do Safari.**
