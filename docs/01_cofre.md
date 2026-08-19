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
