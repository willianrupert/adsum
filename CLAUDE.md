# Adsum Web — contexto do projeto

Leia antes de qualquer tarefa. Histórico de decisões datado, achados de
validação e o raciocínio por trás de cada mudança: `docs/04_historico.md`.
Este arquivo guarda só o que vale agora.

> ## O Adsum A1 não existe mais
>
> Não há aparelho ESP32. O leitor é um **dongle USB** ligado ao computador do
> professor; ler pelo **celular Android com NFC** é caminho experimental e não
> é o foco. **O repositório `../Adsum` é histórico**, não fonte da verdade —
> exceto pelas regras de crachá e privacidade, que continuam valendo por si e
> estão listadas abaixo.
>
> **Os comentários do código ainda falam do A1 em vários lugares.** A limpeza
> dos textos de tela foi feita; a dos comentários ficou pendente por orçamento.

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
  voz alta**; quem julga é o professor, que está na sala. A escolha é
  assimétrica de propósito — errar bloqueando custa um toque a mais, com o
  cartão ainda na mão; errar deixando passar grava presença de quem não estava.
  O diagnóstico mostra **o intervalo entre leituras** para que o número saia de
  medição, e não de palpite.
- **O formato CSV não muda sem motivo.** Ele veio do firmware antigo e continua
  servindo: `;`, BOM, e `evento_id` como chave de idempotência. Os testes usam
  as linhas literais herdadas — mudar o formato é decisão, não descuido.
- **Tela também se testa.** As telas rodam em jsdom contra o `RepositorioDexie`
  de verdade e o `LeitorSimulado` — sem dublê. Dublê que concorda com tudo é
  como se descobre tarde que a tela e o adaptador discordavam.
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

## Palavras que não se usam

**"Armar" e "armado" não aparecem.** Lembra arma, não é institucional: a
pessoa cujo nome aparece grande na tela está **chamada**, que é o que se faz
numa chamada. `chamado` em toda parte — inclusive nos identificadores, não só
no texto de tela.

**"Aparelho" é do A1.** Onde a palavra significa "esta máquina", é
**computador** — inclusive na descrição do manifesto. Onde a palavra conta
história ("o verde que estava aqui era do Adsum A1"), ela fica: aí ela explica
uma decisão.

Palavra herdada não some porque a tela mudou. Ela mora nos identificadores, e é
lá que precisa ser procurada.

## Voz da interface

O texto de tela não é o texto dos comentários. Nos comentários o travessão
carrega o raciocínio; **na tela ele soa a ensaio** — "parece de IA".

A regra: **travessão em tela quase sempre é duas frases disfarçadas de uma.**
Separe, ou use dois-pontos quando a segunda parte explica a primeira. Frase
curta e completa ganha de fragmento elegante.

E título não repete o verbo do botão. "Instalar o Adsum" com um botão
"Instalar" logo ao lado é a mesma palavra duas vezes; o título vale mais dizendo
o que a pessoa ganha — "O Adsum em janela própria".

## Estilo visual

Direção: **estilo Apple — só funciona, e não se pensa em nada.** O que faz uma
interface Apple parecer assim **não é o material — é a ausência de decisão.**
Uma ação óbvia por tela, navegação que decorre do estado, nada de configuração
à vista.

Referências levantadas pelo autor: *liquid glass*, Apple recente, *Mushroom
cards* (Home Assistant), iPadOS.

- **Mushroom** é a mais útil das três: cartão compacto e arredondado, ícone
  colorido à esquerda, uma linha de informação principal e uma de apoio. É
  desenho de estado num relance.
- **Cuidado com o vidro.** Isto pode acabar num projetor ou numa sala clara,
  visto de longe e de canto de olho. `backdrop-filter` sobre fundo variável
  derruba contraste, e contraste aqui é requisito, não gosto. Translucidez só
  onde existe camada de verdade (algo sobreposto), nunca como textura de fundo.
  `Sheet` (`ui/componentes/Sheet.tsx`) é o único lugar que usa isso hoje.

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

**A rota é o estado.** `nucleo/rota.ts` decide a tela a partir do estado do
app (`decidirRota`), e `ui/Fluxo.tsx` monta o que ela devolve — nenhuma tela
decide sozinha se deve aparecer.

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

## O problema em aberto: o professor não pode perder a base

*(Resolvido no Chrome/Edge; ainda pendente em Safari/Firefox.)*

Tudo vive no IndexedDB de **um navegador de uma máquina**. Trocar de
computador, limpar dados do site, ou o navegador despejar sob pressão de espaço
— e o cadastro da turma inteira se vai. **"Dados 100% locais" é justamente o
que cria esse risco.**

**Decidido pelo autor: o crachá do professor autentica.** Ele encosta o
próprio crachá e a base dele carrega. Autenticação resolve *quem entra*, não
*de onde vem o dado*: para carregar em outra máquina, os dados precisam
existir em algum lugar fora dela.

Sobre a força do crachá como credencial: o UID trafega em claro na
anticolisão, antes de qualquer chave — é por isso que o projeto lê o crachá do
CIn sem as chaves do CIn. Clonar exige cartão de UID gravável e intenção
deliberada; **para uma sala de aula isso é aceitável** (avaliação de risco do
autor: quem clona um crachá já podia forjar presença, e o professor está na
sala). O que muda de natureza é o **alcance** do que o crachá abre — presença
é um registro, a conta do professor guarda nome, login e e-mail de dezenas de
alunos. Meio-termo adotado: **crachá abre máquina já confiada; máquina nova
exige o arquivo de backup** (ou pasta escolhida).

**Caminho escolhido: pasta escolhida uma vez** (File System Access,
Chrome/Edge) — o app grava sozinho a cada mudança numa pasta de verdade do
computador. O `FileSystemDirectoryHandle` fica guardado no IndexedDB; limpar
dados do site apaga o handle, **não a pasta** — o professor reescolhe e tudo
volta. Nada trafega na rede, não é preciso autenticar: quem tem a máquina e a
pasta tem a base. Se a pasta ficar dentro de iCloud/Drive já sincronizado, o
backup fora da máquina vem de graça.

**Limite:** só Chrome e Edge têm seletor de diretório. O OPFS do Safari não
serve — mora dentro do armazenamento do navegador e some ao limpar dados do
site, o mesmo problema com outro nome. **No Safari é pior:** o ITP apaga
IndexedDB, localStorage e o service worker depois de **sete dias de uso do
Safari sem visitar o site** (dias de uso do navegador, não de calendário). A
saída é instalar (Dock/tela de início) — sai do Safari, ganha container
próprio, é pulado no algoritmo de remoção. Como o armazenamento é separado,
**instalar tem que vir antes de cadastrar a turma** — rota `'instalar'`. O
Firefox não tem pasta mas também não apaga — textos diferentes nos dois, senão
o aviso mente para metade dos navegadores. Ver `docs/01_cofre.md`.

Enquanto Safari/Firefox não tiverem solução equivalente, **o app não deve dar
a entender que os dados estão seguros** neles.

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
- **A passada visual** (tipografia, espaço, claro/escuro, Mushroom cards) e o
  corte de texto residual nas telas de vínculo e base continuam por fazer.

**Vale por si, independente de hardware:** ler só o UID público (legitimidade,
não limitação técnica), hash com sal (privacidade), registro append-only, um
só nome chamado por vez (garantia contra trocar aluno), leitura da página do
SIGAA (nome, matrícula, conferência do total), encurtar nome por legibilidade.
