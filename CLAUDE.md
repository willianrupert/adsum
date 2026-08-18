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
> - **Um só nome armado por vez** na cerimônia de vínculo.
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
- **`uid_hash` = 8 primeiros bytes de SHA-256(sal ‖ uid).**
- **Sem hora confiável, a sessão não abre.**
- **O nome não trafega.** Sai `uid_hash`; a planilha resolve.

Específicas do app:

- **Nenhum dado sai do aparelho sem gesto explícito do professor.** Não existe
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
- **O login do CIn é o identificador da pessoa.** Nome muda com correção de
  cadastro; login não. É por ele que a planilha fecha a chamada, e é ele que vai
  na coluna `login` de `registros.csv`. O nome continua sendo só apresentação.
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
- **O formato CSV não muda sem motivo.** Ele veio do firmware antigo e continua
  servindo: `;`, BOM, e `evento_id` como chave de idempotência. Os testes usam
  as linhas literais herdadas — mudar o formato é decisão, não descuido.
- **Leitura de CSV nunca descarta linha em silêncio.** Toda função devolve
  `{ itens, problemas }`, e a tela mostra linha, conteúdo e motivo. É a mesma
  regra da recusa muda: 46 alunos onde deveria haver 48, sem explicação, é bug.

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
adaptadores/  LeitorSimulado, LeitorWebNfc, RepositorioDexie  (falta WebSerial)
ambiente/     capacidades do navegador, entrada e saída de arquivo
ui/           telas
```

`src/ui/adsum.ts` guarda a lista `LEITORES`. Adaptador novo entra ali e aparece
sozinho na escolha do diagnóstico — nenhuma tela precisa saber que ele existe.

`LeitorSimulavel` e `RepositorioApagavel` estendem as portas e ficam **fora**
delas de propósito: são ferramentas de diagnóstico, e o acesso passa por um
`ehSimulavel()` / `podeApagar()`. Leitor de verdade não implementa `SIMULAR`.

## Estado atual

Atualizado em 18/08/2026. **Passos 1, 2 e 3 de 6 feitos**, com a lista do SIGAA
lida de verdade — nome completo e login do CIn, guardada por turma. Medido na
turma real do IF685: **49 de 49**, batendo com `Docentes (2)` e `Discentes (47)`,
nenhum nome estourando a coluna de 210 px e quatro logins que são só dígitos
(duas matrículas e dois que têm cara de CPF), sinalizados na tela.

Mais o `LeitorWebNfc` adiantado do passo 5 (ver `docs/00_roadmap.md`).
`npm test`: 78 testes.
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
  vinculado **recusado dizendo de quem é**, com o nome armado permanecendo
  armado;
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
  que o firmware lê. O login fica na base local e é preenchido **na saída** do
  `registros.csv`, a partir do vínculo — assim corrigir um login corrige as
  exportações seguintes sem reescrever uma linha do log. Se um dia o firmware
  aceitar uma quarta coluna, o login pode viajar no cartão também.
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
quem não conta, a janela de 60 s antes de aceitar o fechamento) e
`ui/TelaColeta.tsx` desenha. Som por Web Audio, tocado **depois** de gravar. A
tela se reconstrói do log: fechar o notebook no meio da aula não perde a
chamada.

**Cofre feito:** `ambiente/pasta.ts` (File System Access) e
`ambiente/sincronia.ts`. A pasta é a dona; o IndexedDB é cache. `restaurar()`
reconstrói a base inteira lendo a pasta, e há teste que apaga o cache e prova
isso — é o que separa "cofre" de "mais um backup". O handle fica guardado, e
limpar dados do site apaga o handle, **não** a pasta.

**Ainda a fazer:** a passada visual (tipografia, espaço, claro/escuro,
Mushroom cards) e o corte de texto das telas de vínculo e base.

**Vale por si, independente de hardware:**
- ler só o UID público, nunca Crypto1 — é legitimidade, não limitação técnica
- hash com sal — é privacidade
- registro append-only
- um só nome armado por vez na cerimônia — é a garantia contra trocar aluno
- leitura da página do SIGAA: nome, login, conferência do total
- encurtar nome por legibilidade (o conceito, não os números)

**Nascido aqui:** rota é o estado, orçamento de toques, o cofre em `docs/01`.
