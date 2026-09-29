# 08 — Lançar no SIGAA

Especificação da v2, do micro ao macro. Em construção na branch, nada publicado. Pedida pelo Prof.
Paulo em 24/09/2026, no dia da primeira aula limpa: levar as presenças do
Adsum direto para o SIGAA. Funcionalidade nova: espera as quatro semanas
limpas do `CLAUDE.md`, e cada camada abaixo só começa com a de baixo
provada.

**Estado em 25/09/2026:** especificação e esboço das telas prontos
(`docs/09_esboco_da_janela.md`). Nenhum portão começou. O próximo passo não é
código: é o portão A, o HTML da planilha salvo pelo Prof. Paulo. Três
perguntas de desenho esperam o autor (fim do `09`). O congelamento vai até a
quarta semana limpa; a primeira foi a de 24/09.

**Estado em 27/09/2026:** as três perguntas do `09` foram decididas, e tudo o
que não depende do HTML está sendo construído na branch, passo a passo, em
`docs/11_roteiro_v2.md`.

Como ler: §1–3 dizem **o quê** e **com que garantias**. §4 diz **como**,
camada por camada, cada uma com contrato, leis e o que custa se ela falhar.
§5 é a experiência. §6 são os portões que validam a rota antes de ela
escrever uma célula de verdade.

---

## 1. Objetivo e critério de sucesso

O professor passa as presenças do Adsum para o SIGAA **no ritmo que quiser**
— toda aula, a cada três, ou no fim do semestre — **com o mesmo gesto**, e
consegue **provar** que o SIGAA ficou igual ao Adsum.

Sucesso é, medido em uso real:

- **Nenhuma célula errada gravada.** Nenhuma, não "quase nenhuma".
- **Três cliques** além de chegar à planilha — favorito, Preencher, Gravar —
  para um dia ou sessenta.
- **Toda diferença entre SIGAA e Adsum aparece**, com nome, dia e os dois
  valores. Nenhuma é resolvida em silêncio.
- **O professor pode ignorar a ferramenta** a qualquer momento e lançar à
  mão, como sempre, sem que nada quebre.

## 2. O terreno: o que se sabe e o que falta saber

| Fato | Fonte | Situação |
|---|---|---|
| Não existe importação oficial de frequência | manuais UFPE e UFRN | sabido |
| A "Lançar Freq. em Planilha" traz o semestre inteiro, com coluna Matrícula | [manual UFPE][m2] | sabido |
| A célula aceita digitar o número de faltas; 0 é presente | [manual UFPE][m2] | sabido |
| Marcas do SIGAA: trancado (`T`), matriculado depois, feriado, cancelada, lançado | [manuais][m1] | sabido |
| Um só Gravar Frequências para a planilha inteira | [manual UFPE][m2] | sabido |
| A falta só vira definitiva quando o docente a ratifica nos conceitos | [manual UFPE][m1] | sabido |
| Aula na UFPE = 50 min (Portaria Normativa 07/2022) | SIGAA, página do aluno | sabido |
| SIGAA v4.15.0.206, RichFaces 3.3.3 / a4j, jQuery 1.4; versão no rodapé | SIGAA, página do aluno | sabido |
| Paulo: mesmo Chrome e perfil para SIGAA e Adsum; computador próprio, sem políticas | autor, 24/09 | sabido |
| Paulo lança na planilha, dia a dia | autor, 24/09 | sabido |
| Célula vazia é distinguível de célula `0`? Sim: faltas `null` × `0` | planilha real (CIN0114, 29/09) | sabido |
| A célula é um `<td>` com texto, classes `aluno_<id> aula_<n>`; clicar cria um `<input>` temporário | planilha real (CIN0114, 29/09) | sabido |
| O máximo de cada dia está nos dados da aula (número de aulas do dia). Não é sempre 2: há dias de 4 e de 12 | planilha real (CIN0114, 29/09) | sabido |
| Lançada, feriado, cancelada, suspensa e extra vêm por aula; trancado, matriculado depois e bloqueado, por aluno × aula | planilha real (CIN0114, 29/09) | sabido |
| Os dados chegam estruturados em variáveis da página (`auxAulas`, `auxAlunos`), e a tabela é desenhada por script | planilha real (CIN0114, 29/09) | sabido |
| O Gravar lê o **texto das células** no envio (`atualizarFrequencias`) e manda a grade inteira num campo só; célula vazia mantém o valor que tinha. Nenhum evento é necessário | planilha real (CIN0114, 29/09) | sabido |
| **A planilha salva sozinha a cada 5 minutos**, pelo mesmo caminho do Gravar. Ver "O que a planilha real mudou" | planilha real (CIN0114, 29/09) | sabido |
| A página recusa lançar data futura e data fora do período letivo | planilha real (CIN0114, 29/09) | sabido |
| Dia lançado com células vazias existe e é aceito (alunos que entraram depois) | planilha real (CIN0114, 29/09) | sabido |
| Mensagem de sucesso e de erro do Gravar | HTML depois | **falta** |
| O SIGAA manda `Cross-Origin-Opener-Policy`? | cabeçalhos da resposta | **falta** |
| "Lançar Frequência" é em duas etapas: calendário (verde = lançado, vermelho = feriado, amarelo = cancelada), e só depois de escolher o dia, a lista de alunos com uma lista de opções por aluno ("presente" ou quantas aulas perdeu) | tela do SIGAA de teste da UFRRJ, v3.53 (2020), vista em 29/09/2026 | referência: a UFPE roda a 4.15, e o HTML pode diferir |

O que ainda **falta** vem da planilha depois de um Gravar e dos cabeçalhos da
resposta. Ver §6.

### O que a planilha real mudou (portão A, 29/09/2026)

Capturada com o Prof. Paulo: a planilha de CIN0114 (45 alunos, 38 aulas, 12
lançadas, 1 feriado) e a tela do calendário. Fora do repositório, analisada
com nomes e matrículas mascarados. **A rota funciona para ler e para
escrever**, com três mudanças de desenho e algumas regras novas.

1. **Salvamento automático.** A cada 5 minutos a página chama
   `atualizarFrequencias`, que recolhe o texto de todas as células, e envia a
   grade ao servidor. Vale para os cliques do professor e valeria para o que o
   favorito escrevesse: **Preencher passa a ser o gesto que grava**, em até 5
   minutos, com ou sem Gravar. E o Desfazer deixa de ser confiável depois do
   primeiro salvamento: a coleta muda o valor guardado na página, e célula
   vazia, dali em diante, mantém o que foi escrito. **Decidido pelo autor em
   29/09 (opção A):** a folha avisa antes de preencher que o SIGAA salva
   sozinho em até 5 minutos; o Desfazer vale até a primeira coleta (o
   favorito percebe pelo campo `form:frequencias` mudando) e, depois dela, a
   barra diz como corrigir: clicando na célula, como sempre.
2. **Ler pelos dados, escrever na tabela.** O favorito lê `auxAulas` e
   `auxAlunos`, que são o modelo da própria página, em vez de raspar a
   tabela; escreve o texto nas células, que é o que a coleta lê. O bruto
   provisório da camada 1 passa a ser esses dados.
3. **O máximo não é fixo.** Há dias de 4 e de 12 aulas. Ausente num dia de 12
   leva 12 faltas: a folha mostra quanto a falta vale quando o dia não é o
   comum.

Regras da página que o favorito respeita como a própria página: não escreve
em data futura nem fora do período letivo; não escreve em célula de
trancado, matriculado depois, bloqueado, feriado, cancelada ou suspensa. Dia
já lançado com células vazias é normal (quem entrou depois); os alunos da
página sem par no Adsum ficam vazios e são ditos.

**Aula já lançada é do professor (29/09/2026).** Na planilha real, quem
entrou na turma depois fica vazio nas aulas já lançadas, sem marca de
"matriculado depois"; o Adsum, que não sabe quando cada aluno entrou,
proporia falta a quem nem estava na turma. Por isso o Adsum não acrescenta
nada em aula que o SIGAA já tem como lançada: ali ele só confere, e as vazias
são ditas.

**Regra do professor (29/09/2026):** o Adsum nunca modifica o que já está
escrito no SIGAA, apenas acrescenta, e avisa o que não modificou e por quê. É
a lei 2 ("nunca toca lançado") e a linha de informativos da folha, agora
dita por ele.

**O que não entra no repositório:** a página e os scripts do SIGAA. As
páginas vieram do SIGAA da UFPE, pelo Prof. Paulo, e têm dados de alunos; o
software é da UFRN, licenciado à UFPE. A descrição detalhada de ambas está
em `docs/12_planilha_sigaa.md`. A fixture versionada é o modelo de dados,
anonimizado e no nosso formato; a bancada com a página inteira fica local.

## 3. Princípios que não se negociam

**Segurança** ([PoSIC da UFPE][ps], 2016/2017, vigente):

- **Art. 22** — senha é "equivalente à assinatura", "intransferível". A
  ferramenta **nunca vê, digita, guarda nem pede senha**. Não faz login, não
  mantém sessão: usa a página que o professor já abriu.
- **Art. 54, II** — o usuário responde pelos efeitos de todo acesso com a sua
  identificação. **O Gravar é sempre um clique do professor**, depois de ver
  o que mudou. A ferramenta nunca clica em botão do SIGAA. **(29/09/2026)** A planilha salva sozinha a cada 5 minutos: o clique que
  grava passa a ser o Preencher, depois de ver o que muda (§2, "O que a
  planilha real mudou").
- **Art. 10** — ética, legalidade, finalidade. A ferramenta faz só o que o
  professor faria à mão, na tela que o SIGAA oferece para isso.
- A PoSIC não fala de automação; por isso a ferramenta fica no que é
  indistinguível de digitar: **nenhuma requisição própria ao SIGAA**, nenhuma
  navegação, nenhum envio de formulário.
- **Nada sai do computador.** As duas janelas conversam na mesma máquina.
- **Nenhum código remoto** entra na sessão do SIGAA.
- **O favorito não lê nomes.** Matrícula basta; os nomes o Adsum já tem.

**Domínio:**

- **Matrícula ou nada.** Nunca casar por nome.
- **Nunca muda o que o SIGAA já tem.** Célula lançada é do professor.
- **Nunca inventa dia.** Sem chamada no Adsum, a célula fica como está.
- **Nunca adivinha o máximo do dia.** Vem da página; sem ele, o dia é
  recusado com o motivo.
- **Nunca age em silêncio.** Tudo o que não foi preenchido tem motivo na
  tela — a regra do "46 onde deveria haver 48".
- **Nada é reescrito.** Ajuste e auditoria são linhas novas.

**Autonomia:** automatiza-se o mecânico (ler, casar, calcular, preencher,
registrar). O julgamento fica com o professor: quando usar, quais aulas, o
que fazer com cada diferença, e gravar ou não.

## 4. Camadas, do micro ao macro

Cada camada tem especificação escrita **antes** do código, com exemplos que
viram os testes, e só se apoia na de baixo, já provada. Nenhuma camada de
cima conserta defeito de uma de baixo.

```
 9 Ensaio e chegada          §6
 8 Jornada completa          fixture + base real + favorito, sobre cofre com histórico
 7 Persistência              ajustes e auditoria (Dexie v9, pasta)
 6 Folha do Adsum            tela, jsdom contra o RepositorioDexie de verdade
 5 Favorito                  lê, aplica, pinta, desfaz — sem domínio
 4 Protocolo                 mensagens entre as janelas
 3 Plano                     instruções + validador
 2 Conciliação               o núcleo: leis
 1 Leitura                   página crua → LeituraPlanilha
 0 Tipos                     estado impossível não é representável
```

As camadas 0–3 são funções puras em `nucleo/`, testáveis sem navegador. É
nelas que mora a garantia; 4–7 só transportam, mostram e guardam.

### 0 · Tipos

```ts
type Celula =
  | { tipo: 'vazia' }
  | { tipo: 'lancada'; faltas: number }
  | { tipo: 'bloqueada'; motivo: 'trancado' | 'matriculadoDepois' | 'feriado' | 'cancelada' }

interface ColunaDia  { indice: number; dia: string /* AAAA-MM-DD */; maximo?: number; marca?: 'lancado' | 'feriado' | 'cancelada' }
interface LinhaAluno { indice: number; matricula: string; celulas: Celula[] }
interface LeituraPlanilha {
  id: string                    // um por clique no favorito
  versaoSigaa: string           // rodapé
  cabecalhoTurma: string        // "CIN0144 - … - Turma: 01 (2026.2)"
  colunas: ColunaDia[]
  linhas: LinhaAluno[]
}
```

Sem nome em lugar nenhum. Não existe "bloqueada com valor", nem dia sem data.

### 1 · Leitura

`lerPlanilha(bruto) → { leitura?, problemas[] }`. O favorito extrai da página
só dados crus (textos de cabeçalho, classes, valores, nomes de campo), e é o
Adsum que interpreta — assim o conserto de uma mudança do SIGAA é um deploy,
não um favorito novo.

- Nunca lança exceção. Nunca descarta linha em silêncio: linha sem matrícula
  legível vira problema com o número da linha.
- A data de cada coluna vem de mês (cabeçalho agrupado) + dia + ano do
  semestre. Coluna que não resolve para uma data única recusa a leitura
  inteira: data errada é falta no dia errado.
- Testada contra as fixtures anonimizadas da planilha real (§6), inclusive
  com trancado, cancelada e feriado.

### 2 · Conciliação

`conciliar(leitura, turma, eventos, ajustes) → Relatorio`. O núcleo.

Para cada linha (matrícula *m*) e coluna (dia *d*), o **esperado** é:

- se existe **ajuste** (*m*, *d*): o valor do ajuste mais recente;
- senão, se o Adsum tem chamada da turma em *d*: `0` se *m* esteve presente
  (`presencasDoDia`, o mesmo cálculo da planilha de faltas da v1, incluindo
  presença à mão e "Não presente"), o **máximo** da coluna se não esteve;
- senão: **nenhum**.

A categoria da célula decorre do par (SIGAA, esperado):

| SIGAA \ esperado | nenhum | valor *e* |
|---|---|---|
| bloqueada | Fora | Fora |
| vazia | Fora | **A lançar** *e* |
| lançada *n* | **Só no SIGAA** | *n* = *e*: **Confere** (ou **Confere, ajustada**) · *n* ≠ *e*: **Diverge** |

E fora da grade de células:

- **Sem par (SIGAA):** matrícula da página que não está na turma do Adsum.
- **Sem par (Adsum):** matriculado do Adsum sem linha na página.
- **Sem onde lançar:** chamada no Adsum num dia que não é coluna, ou é
  coluna de feriado ou cancelada.
- **Sem máximo:** coluna com esperado mas sem máximo legível — o dia inteiro
  vai para cá, e nenhuma instrução sai para ele.

**Qual turma:** a do Adsum cujo código casa com o cabeçalho **e** cujas
matrículas cobrem a página. Duas candidatas, ou nenhuma, recusa com o motivo.

**Leis** — valem para qualquer entrada, testadas em massa com entradas
geradas, não só por exemplo:

1. **Partição:** toda célula cai em exatamente uma categoria; as contas
   fecham com linhas × colunas.
2. **Nunca toca lançado:** nenhuma instrução sai de célula lançada ou
   bloqueada.
3. **Nunca inventa dia:** nenhuma instrução para dia sem chamada nem ajuste.
4. **Faixa:** todo valor em 0…máximo; presente é 0, ausente é o máximo.
5. **Idempotência:** aplicar as instruções e conciliar de novo dá zero a
   lançar.
6. **Concordância com a v1:** o conjunto de presentes de cada dia é o mesmo
   que a planilha de faltas exporta.
7. **Monotonia do ajuste:** acrescentar um ajuste só muda a célula dele.

### 3 · Plano

`planejar(relatorio, escolhas) → Instrucao[]`, com
`Instrucao = { linha, coluna, antes: 'vazia', valor }`. *Escolhas* são as
aulas que o professor desmarcou. `validarPlano(plano, leitura)` confere cada
instrução contra as leis 2–4, e é **o mesmo validador** que o favorito roda
ao receber.

### 4 · Protocolo

Duas mensagens, com versão:

```
favorito → Adsum   { v, tipo: 'leitura', versaoFavorito, id, bruto }
Adsum → favorito   { v, tipo: 'plano', id, instrucoes }  |  { v, tipo: 'nada', id }
```

- Origem conferida nos dois sentidos: o Adsum só aceita de
  `https://sigaa.ufpe.br` e só da janela que o abriu; o favorito só aceita da
  origem do Adsum e da janela que ele abriu.
- O `id` amarra o plano à leitura. Plano de outra leitura é recusado.
- Favorito de versão desconhecida é recusado com "arraste o favorito novo".

### O método: bookmarklet

**Decidido pelo autor, 24/09/2026: a ponte é um bookmarklet** — o
"favorito" deste documento.

#### O que é

Um favorito comum do navegador, com uma diferença: o endereço dele não é
`https://…`, é `javascript:` seguido de código. Clicar num favorito normal
leva o navegador a outra página. Clicar num bookmarklet **roda o código na
página que já está aberta**, como se ele fizesse parte dela. A técnica é
tão antiga quanto o JavaScript nos navegadores, e funciona em Chrome, Edge,
Safari e Firefox sem nada instalado.

Num esboço (o de verdade sai do build, §5):

```js
javascript:(() => {
  const leitura = lerPaginaCrua(document)            // só o que está na tela
  const janela = open(ADSUM + '#/sigaa', 'adsum-sigaa', 'popup,width=420,height=640')
  addEventListener('message', (e) => {
    if (e.origin !== ADSUM || e.source !== janela) return   // só o Adsum que ele abriu
    aplicarComCuidado(e.data)                         // escreve, pinta, oferece Desfazer
  })
  janela.postMessage(leitura, ADSUM)                  // quando a janela disser que está pronta
})()
```

#### Por que ele resolve o problema

O problema de fundo é que **os dados estão num lugar e a página está em
outro**. As presenças moram no Adsum (`willianrupert.github.io`); a planilha
mora no SIGAA (`sigaa.ufpe.br`). O navegador separa sites diferentes de
propósito: o Adsum não pode tocar na página do SIGAA, e o SIGAA não pode ler
a base do Adsum. Qualquer ponte precisa atravessar essa parede sem abri-la.

O bookmarklet atravessa do jeito mais estreito possível:

1. **Entra no SIGAA pela mão do professor.** O código só roda porque ele
   clicou, na página que ele abriu, já autenticado. Não há login, não há
   senha, não há sessão paralela: é a sessão dele, no momento dele.
2. **Abre o Adsum de verdade ao lado.** Uma janela própria do Adsum, com a
   base e a pasta do professor — não uma cópia, não um painel emprestado.
3. **Os dois conversam por `postMessage`**, o canal que o navegador oferece
   exatamente para isso: cada lado diz a quem manda e confere de quem
   recebe. O SIGAA manda a página crua, sem nomes; o Adsum devolve só
   "célula tal = n".
4. **Cada lado fica com o que sabe.** A inteligência (casar matrículas,
   comparar, decidir) fica no Adsum, onde há testes. O bookmarklet só lê,
   escreve e pinta. Quando o SIGAA mudar um detalhe, o conserto é um deploy
   do Adsum; o favorito na barra continua o mesmo.
5. **O último passo é humano.** O bookmarklet preenche a tela; o Gravar é do
   professor. Para o SIGAA, é o professor digitando rápido.

#### Por que ele, e não o resto (§7)

- **Nada a instalar além de arrastar.** Sem loja, sem permissão, sem conta
  de desenvolvedor, sem política institucional no caminho. Igual no Mac do
  Paulo e no Windows/Linux da universidade.
- **Age só quando clicado, só onde foi clicado.** Não observa a navegação,
  não roda sozinho, não guarda nada entre um clique e outro. Uma extensão,
  mesmo bem-comportada, fica instalada e com permissões esperando; o
  bookmarklet não existe até o clique.
- **Arrastar é o único jeito de instalar**, e isso é proteção do Chrome:
  página nenhuma consegue gravar código num favorito sozinha. O professor
  faz o gesto, ciente.
- **Não pede nada ao servidor do SIGAA.** Nenhuma requisição própria, nenhum
  formulário enviado. É o que mantém a ferramenta dentro do que a PoSIC
  permite sem precisar interpretar (§3).

#### Três escolhas que o método exigiu

- **Código autossuficiente, nunca carregado de fora.** Um bookmarklet que
  busca o script no site do Adsum nunca precisaria ser reinstalado — mas
  poria código remoto dentro de uma sessão autenticada do SIGAA, e um Adsum
  comprometido leria tudo o que o professor vê. O preço é a versão: quando o
  favorito precisar mudar, a folha pede para arrastar o novo (protocolo,
  acima). Por isso ele é mínimo e sem domínio: quanto menos sabe, mais
  raramente muda.
- **Janela própria, não painel dentro do SIGAA.** Um `iframe` do Adsum
  dentro da página do SIGAA teria o armazenamento particionado pelo Chrome e
  veria uma base **vazia**. A janela é o Adsum inteiro.
- **Gerado, não escrito à mão.** O código vive em `src/favorito/`, é testado
  em jsdom contra a fixture como qualquer módulo, e o build o reduz ao
  `javascript:` que o cartão dos Ajustes oferece para arrastar. O favorito
  que o professor tem é sempre o que passou nos testes.

#### Limites, ditos junto

- Precisa do mesmo navegador e perfil em que o Adsum roda (confirmado para
  o Paulo). No Safari, o app instalado tem armazenamento próprio e a janela
  veria base vazia: a folha detecta e diz, em vez de mostrar "nada a lançar".
- Se o SIGAA mandar `Cross-Origin-Opener-Policy`, a janela perde a ligação
  com a página; o plano vai pela área de transferência, com um clique a mais
  (§6, portão A).
- Não fica sempre por cima, e não precisa: a janela vive o tempo de uma
  decisão, e o que tem de ficar visível mora na barra, dentro da planilha.

### 5 · Favorito

Pequeno, gerado no build a partir de `src/favorito/`, testado em jsdom
contra a fixture. Faz quatro coisas e nenhuma outra:

1. **Ler** a página crua.
2. **Abrir** a janela do Adsum e mandar a leitura.
3. **Aplicar** o plano com *comparar e trocar*: cada célula só é escrita se
   ainda estiver como na leitura (`antes`). Se o professor mexeu nela no
   meio tempo, fica como ele deixou, e a barra diz quantas foram puladas.
4. **Pintar e desfazer:** azul no que mudou, laranja nas diferenças
   (intocadas), uma barra no pé com o resumo e **Desfazer**.

Nunca clica, navega, envia formulário nem executa o que recebe. Lei:
**desfazer devolve cada célula ao valor lido**, idêntico.

### 6 · Folha do Adsum

Abre em `#/sigaa`, pela regra da casa: `decidirRota` vê que a janela foi
aberta pelo favorito. Estados — *Tudo confere*, *Há o que lançar*, *Recusa* —
descritos em §5. Testada em jsdom contra o `RepositorioDexie` de verdade.

### 7 · Persistência

- **Dexie v9** (versão nova, nunca edição da v8): duas tabelas,
  `ajustesSigaa` e `auditoriaSigaa`. A porta `Repositorio` ganha
  `gravarAjusteSigaa`, `lerAjustesSigaa`, `acrescentarAuditoriaSigaa` — e,
  como o resto, **nada de atualizar ou remover**.
- **Ajuste** (decidido pelo autor, 24/09): `{ turma, dia, matricula, valor,
  em }`. Nasce do toque em "Aceitar o SIGAA". Não toca o evento de presença:
  diz "o professor decidiu diferente".
- **Auditoria** (decidido pelo autor, 24/09): arquivo próprio,
  `sigaa/<turma>.csv`, fora do diário técnico. Uma linha por célula tocada ou
  divergente, por conferência, preenchimento e aceite:
  `quando;acao;versao_sigaa;dia_aula;matricula;lido;proposto;aplicado`.
  Sem nome. `;` e BOM, como os outros CSV.
- A janela não pede permissão de pasta: grava no IndexedDB, e o Adsum
  principal leva para a pasta na próxima abertura. O que pode esperar,
  espera.

### 8 · Jornada completa

Fixture da planilha + base real + favorito em jsdom: conferir → preencher →
"gravar" (a fixture recarregada com os valores novos) → conferir dá *Tudo
confere*. **Sobre cofre com histórico**, nunca base limpa — é a regra de
`docs/06`.

### A porta e o chão

`PonteSigaa` é a porta; dois adaptadores:

1. **Lista para lançar à mão** — "14/10: todos presentes, exceto" e quem
   faltou. Não depende de nada do SIGAA. É o chão: se o favorito quebrar num
   dia de SIGAA diferente, o professor lança igual, sem esperar conserto.
2. **Favorito + janela** — a rota. **Decidido pelo autor, 24/09/2026**:
   extensão não entra, nem como plano B.

### A rota por dia: o professor navega, o favorito orienta

Decidido pelo autor em 29/09/2026. A tela "Lançar Frequência" é em duas
etapas: um calendário, e a lista de alunos só depois de escolher o dia. **O
favorito não navega por ela.** Clicar num dia do calendário é uma requisição
ao SIGAA em nome do professor, e a regra do §3 (nunca clica, navega nem envia
formulário) vale aqui como na planilha. Quem clica no dia e no Gravar é o
professor; o favorito lê a tela em que ele está, entende o dia aberto e diz em
uma frase o que fazer, com no máximo uma ação.

**No calendário, sem dia aberto**, o favorito compara os dias marcados como
lançados com as chamadas do Adsum: "Faltam 2 aulas: 16/03 e 17/03. Clique em
16/03 no calendário." Isso já é uma conferência do semestre inteiro.

**Com um dia aberto:**

| Situação do dia aberto | O que a janela diz | Ação |
|---|---|---|
| Vazio no SIGAA, com chamada no Adsum | "16/03: 46 presentes, 2 faltas." | Preencher |
| Já lançado e igual ao Adsum | "16/03 já confere. Próximo: 17/03." | nenhuma |
| Já lançado e diferente | a diferença, com nome e os dois valores | Aceitar o SIGAA |
| Sem chamada no Adsum | "O Adsum não tem chamada de 16/03. Nada a preencher." | nenhuma |
| Feriado ou aula cancelada | "16/03 é feriado no SIGAA." | nenhuma |

Depois de preencher, a barra no pé diz "Adsum preencheu 16/03. Confira e
clique em Gravar. Depois, o próximo é 17/03." A orientação tem sempre a mesma
forma: o estado do dia em uma frase, e o próximo dia pendente.

**O núcleo não muda.** Conciliação, leis, plano e validador já trabalham por
dia: uma página com um dia só é uma planilha de uma coluna. O trabalho novo é
de borda: ler o calendário e a data aberta, escrever em lista de opções (o
`Localizador`), e os textos acima. Custa três cliques por dia contra um Gravar
para vários dias na planilha: a planilha continua a rota principal, e esta
entra se a planilha falhar no portão A ou se o professor preferir esta tela.

## 5. A experiência

As telas desenhadas, com as perguntas que ainda são do autor, estão em
`docs/09_esboco_da_janela.md`.

A regra da casa: uma ação óbvia por tela, a navegação decorre do estado,
nada de configuração à vista.

**Instalar, uma vez.** Nos Ajustes do Adsum, cartão "Lançar no SIGAA": um
botão "Adsum → SIGAA" para **arrastar** à barra de favoritos, e a dica de
Cmd/Ctrl+Shift+B para mostrar a barra. Arrastar é o único jeito que o Chrome
aceita, de propósito. O favorito é um `javascript:` dentro do próprio
favorito: não é site, subdomínio nem servidor.

**No dia a dia, no Adsum.** O cartão da turma ganha uma linha de apoio:
"3 aulas ainda não conferidas no SIGAA" ou "Conferido com o SIGAA até 21/10".
Sem botão: o gesto está onde o Gravar mora.

**Na planilha, favorito → janela.** Uma janela de verdade do sistema, aberta
em modo popup encostada à direita (~420 × 640), com
`willianrupert.github.io` na barra — o selo de que aquilo é o Adsum. Arrasta,
redimensiona, minimiza e fecha. Dentro, uma folha:

- *Tudo confere* — um visto e "SIGAA e Adsum iguais em 12 aulas". Fechar.
- *Há o que lançar* — diferenças primeiro, num cartão laranja: nome, dia, os
  dois valores, "o SIGAA fica como está", e **Aceitar o SIGAA** em cada uma.
  Depois um cartão por aula (dia, presentes, faltas), todos marcados;
  desmarcar deixa o dia de fora; tocar no cartão mostra quem faltou, pelo
  nome, para conferir antes de preencher. Informativos numa linha só ("2
  trancados e o feriado de 12/10 ficam de fora"). Uma ação, pílula azul de
  largura cheia que conta o que vai fazer: **Preencher 3 aulas** — o número
  acompanha o que está marcado. Abaixo, quieto, **Agora não**. E a frase que
  sustenta a confiança, sempre visível sob o botão. Era "Nada é gravado aqui.
  Você confere e grava no SIGAA."; a planilha real salva sozinha (§2), e
  desde 29/09 é "Ao preencher, o SIGAA salva sozinho em até 5 minutos."
- O título é o estado em uma frase ("3 aulas para lançar", "Tudo confere"),
  com a turma e "planilha lida agora, 48 alunos, todos pela matrícula" como
  apoio. Tokens, pílulas, cartões e tipografia são os do `estilo.css`: a
  janela é o Adsum, não uma tela nova.
- *Recusa* — página que não é a planilha, turma que não casa, favorito
  antigo, base vazia neste navegador. Uma frase do que houve e do que fazer.

**Preencher fecha a janela.** Ela vive o tempo de uma decisão. Nenhuma página
consegue ficar sempre por cima; por isso ela não precisa. Se sumir atrás do
Chrome antes disso, o favorito de novo a traz de volta, no mesmo estado.

**De volta à planilha.** Azul no que mudou, laranja nas diferenças, barra de
uma linha no pé que reserva o próprio espaço e recolhe para uma pílula:
"Adsum preencheu 3 aulas. Azul é o que mudou. O SIGAA salva sozinho em até
5 minutos, ou agora, em Gravar Frequências." e **Desfazer**, que vale até a
página coletar os valores; depois, a barra diz "O SIGAA já salvou o
preenchimento. Para mudar uma célula, clique nela, como sempre." (29/09). O mouse sobre uma célula azul diz "Adsum:
ausente, 2 faltas. Antes: vazia".

**Depois do Gravar.** Favorito de novo: *Tudo confere*. É essa conferência
que atualiza "Conferido até" no cartão da turma — o Adsum nunca supõe que o
Gravar aconteceu.

**Falhas que ficam baratas por construção.** Sessão expirada antes do
Gravar: entrar de novo e repetir; a idempotência garante que refazer não
duplica. Página que mudou com a janela aberta: "A planilha do SIGAA mudou.
Clique no favorito de novo." Célula mexida entre ler e aplicar: pulada, pelo
comparar e trocar.

## 6. Validar a rota: portões

A rota é validada em portões. Cada um tem critério de passagem e o que muda
se não passar. Nenhum portão depois do C escreve no SIGAA sem o anterior.

**A · HTML do docente** (fora do repositório). **Passou em parte em
29/09/2026** (§2): leitura e escrita possíveis; falta a planilha depois de um
Gravar, a segunda turma e os cabeçalhos. O mínimo, pedido em
29/09/2026, tudo salvo **antes** de lançar, em "Página da Web, completa":
"Lançar Freq. em Planilha" numa turma com dias já lançados (a coluna de hoje,
vazia, ao lado de dias com 0, responde vazia ≠ 0); e, para a rota por dia,
"Lançar Frequência" com o calendário e com um dia aberto. A planilha depois de
um Gravar e os cabeçalhos da resposta (COOP) são segunda rodada.
Passa se: células legíveis por código, vazia ≠ 0, máximo do dia encontrável,
sem COOP que corte a ligação entre janelas.
Se não passar: célula ilegível ou vazia = 0 muda a rota para a tela de um dia
(um `<select>` por aluno, a data no título); COOP presente faz o plano ir
pela área de transferência, com um clique a mais. Máximo não encontrável é
o único que para tudo — aí se conversa com a STI.

**B · Núcleo provado.** Camadas 0–4 com as leis passando sobre as fixtures
anonimizadas (`scripts/anonimizar_sigaa.py`, irmão do `anonimizar_cofre.py`:
troca nomes e matrículas, remove `jsessionid` e `ViewState`, e recusa gravar
se sobrar dado original). Passa se: todas as leis, e a jornada completa (8).

**C · Só conferência, em uso real.** Favorito e folha no ar **sem**
Preencher. O professor continua lançando à mão. Várias semanas de páginas
reais passando pelo leitor. Passa se: nenhuma leitura recusada sem motivo
certo, nenhuma diferença falsa. Risco de escrita: zero.

**D · Primeiro Preencher.** Em ambiente de homologação, se a STI der; senão,
numa turma real, com o professor ao lado, uma aula por vez, conferindo cada
célula azul antes do Gravar, e conferência depois. Passa se: *Tudo confere*
depois de cada Gravar, e o `sigaa/<turma>.csv` bate com o que se viu.

**E · Outros professores.** Só depois de a STI saber e concordar por escrito.

## 7. Trabalhos anteriores, e as rotas descartadas

Este desenho não parte do zero. Outros já resolveram partes do mesmo
problema, cada um no seu contexto, e o que eles acertaram está aqui dentro.

- **[auto-sigaa][fc]** (Prof. Filipe Calegario, CIn/UFPE, 2023) — indicado
  pelo Prof. Paulo como ponto de partida. Lança notas a partir de uma
  planilha, com Selenium. Dele vem a divisão de trabalho que este desenho
  adota inteira: **o professor faz o login e navega, a ferramenta preenche,
  e quem salva é o professor**, depois de conferir. O contexto dele é outro
  — notas, a partir de uma planilha que o próprio professor monta com os
  nomes do SIGAA —, e por isso ele identifica o aluno pelo nome. Aqui o
  aluno chega pelo crachá, e a matrícula está disponível dos dois lados; a
  diferença de caminho vem daí.
- **[notinhas][nt]** (SIGEduc da Bahia, da mesma família SIG). Playwright,
  frequência e notas em lote, com interface gráfica. Documenta com cuidado o
  comportamento do JSF sob automação — navegação direta e "voltar" perdem o
  estado —, o que ajudou a decidir que a ferramenta aqui não navega. Oferece
  a opção de gravar com a senha informada pelo usuário; aqui a escolha foi
  outra, pela leitura do Art. 22 da PoSIC da UFPE (§3).
- **[SIGAAutils][su]** (IFC) e **[sigaa-horarios-extension][sh]** (UFBA):
  extensões que melhoram o uso do SIGAA. A segunda mostra que o código de
  horário (`23T56`) é legível por máquina — ideia registrada para depois.

Descartadas, e por quê: **robô** (Selenium/Playwright) — peças soltas na
máquina e navegação que o JSF pune; **POST direto** — exige lidar com sessão
e login; **agente de IA** — não determinístico para registro oficial;
**favorito que carrega código remoto** — um Adsum comprometido leria a sessão
do SIGAA; **extensão** — recusada pelo autor; **colar o texto da planilha** —
só conferiria, e só se a célula copiasse o valor.

## 8. Contato com a STI

Dois pedidos independentes, e o primeiro vale mais que o segundo:

1. **Ciência e de acordo** com o desenho (§3 é o argumento), antes do portão
   E. É o que transforma "segue as regras, na nossa leitura" em "a UFPE sabe
   e concorda".
2. **Ambiente de homologação ou turma de teste**, para o portão D. Sem ele,
   o portão D acontece numa turma real, com o professor ao lado — mais lento,
   não mais perigoso, porque o Gravar é dele e a falta só vira definitiva na
   ratificação. Esses ambientes existem em instalações do SIGAA: a UFRRJ tem
   um (`testesigaa.ufrrj.br`, com docente e turma fictícios). Com um na UFPE,
   até o Gravar se testa sem dado real, e o pedido pode andar em paralelo ao
   HTML do professor.

O perfil que lança frequência é o de docente. O pedido tem de sair do
professor, ou com ele.

[m1]: https://manuaisdesistemas.ufpe.br/index.php/Lan%C3%A7ar_Frequ%C3%AAncia
[m2]: https://manuaisdesistemas.ufpe.br/index.php/Lan%C3%A7ar_Frequencia_em_Planilha
[fc]: https://github.com/filipecalegario/auto-sigaa
[nt]: https://github.com/devmagary/notinhas
[su]: https://github.com/zebedelu/SIGAAutils
[sh]: https://github.com/ernestosrf/sigaa-horarios-extension
[ps]: https://www.ufpe.br/documents/38982/806616/PoSIC+-+Vers%C3%A3o+para+o+Portal.pdf/2cc2ed7b-0cfa-4c1e-9a59-59084c6ba691
