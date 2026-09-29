# 12 — A planilha de frequência do SIGAA, por dentro

Documento vivo. Descreve as duas páginas que o Prof. Paulo capturou em
29/09/2026 no SIGAA da UFPE: "Lançar Freq. em Planilha" (a planilha) e
"Lançar Frequência" (o calendário, de onde se chega a ela). É a referência de
que dependem a leitura (`nucleo/lancar/leitura.ts`) e a escrita
(`favorito/paginaSigaa.ts`) da v2: se o SIGAA mudar, compara-se a página nova
com este documento, e o que divergir aponta o que ajustar.

**O que não está aqui, de propósito.** Nenhum dado de aluno: as capturas têm
nomes e matrículas reais e ficam fora do repositório; os números abaixo são
agregados. Nenhuma cópia do código do SIGAA: o software é da UFRN, licenciado
à UFPE, e aqui se descreve o comportamento, citando só nomes de funções e de
variáveis. A análise foi feita sobre cópias locais, com nomes e matrículas
mascarados.

## A pilha

JSF (páginas `.jsf`, formulários com `javax.faces.ViewState`), RichFaces
3.3.3 / Ajax4jsf (`A4J.AJAX.*`), jQuery 1.4 renomeado para `J` (convive com o
Prototype), PrimeFaces para os diálogos, e um script próprio da planilha,
`frequencia-lote.js`. Nada de framework de componentes no navegador: a
planilha é desenhada à mão, célula por célula, a partir de duas strings que o
servidor escreve na página.

## Como se chega à planilha

A tela "Lançar Frequência" (`FrequenciaAluno/form.jsf`) mostra o calendário do
período. No menu lateral da turma virtual, o item "Lançar Freq. em Planilha"
não é um link comum: o clique envia o formulário do menu (`jsfcljs`) com alvo
`_blank`, e o servidor responde com a planilha numa **aba nova**, no endereço
`ava/index.jsf`. A aba é do próprio `sigaa.ufpe.br`, e é nela que o favorito
roda.

## A planilha

Uma página curta (cerca de 670 px de largura no contêiner), com o cabeçalho
da turma, um texto de instrução, a tabela, a legenda e dois botões: "Gravar
Frequências" e "Cancelar" (que fecha a aba).

### O cabeçalho da turma

Um `<legend>` no formato `CIN0114 - NOME DA DISCIPLINA (60h) - Turma: 01
(2026.2)`: código, nome, carga horária, turma e semestre. É daí que a leitura
tira o código da disciplina e o ano.

### Os dados: duas strings e duas variáveis

O servidor escreve o modelo inteiro em variáveis de um `<script>` da página:

- `auxAulas`: uma aula por item, itens separados por `;`, campos por `,`.
- `auxAlunos`: um registro por aluno **e** aula (alunos × aulas registros), no
  mesmo formato.
- `dataInicioPeriodoLetivo` e `dataFimPeriodoLetivo`: o período letivo.
- `TOTAL_AULAS_CH`, `FREQUENCIA_MINIMA` e afins: usados só nos totais.

Ao carregar, `converteEmVetor` transforma as strings nos vetores `aulas` e
`alunos`, e `inicializa` desenha a tabela a partir deles.

**Campos de uma aula** (posição no item de `auxAulas`):

| Posição | Campo |
|---|---|
| 0, 1 | dia, mês |
| 2 | número de aulas do dia: **o máximo de faltas** |
| 3 | a data, no formato do Java (`Tue Aug 11 00:00:00 BRT 2026`) |
| 4 | lançada (`true`/`false`) |
| 5 | feriado |
| 6 | cancelada |
| 7 | aula extra adicional |
| 8 | ano |
| 9 | suspensa |

**Campos de um registro de aluno** (as constantes do próprio script dão
nome às posições):

| Posição | Constante | Campo |
|---|---|---|
| 0 | `ID_MAT` | id interno da matrícula na turma (não é a matrícula) |
| 1 | `MAT` | **a matrícula**, 11 dígitos na captura |
| 2 | `NOME` | nome completo |
| 3, 4 | `DIA`, `MES` | a aula |
| 5 | `NUM_FALTAS` | **faltas: `null` é não lançado, `0` é presente** |
| 6 | `ID_FREQ` | id do lançamento |
| 7 | `ALTERADA` | não é usado pelo navegador |
| 8 | `NUM_AULAS` | aulas do dia |
| 9 | `ID_DISCENTE` | id interno do aluno |
| 10 | `DATA` | a data, formato do Java |
| 11 | `TRANCADO` | trancou |
| 12 | `IMPOSSIBILITADO` | matriculado depois da data da aula |
| 13 | (sem constante) | `true` em todos os registros da captura; sentido desconhecido |
| 14 | `BLOQUEADO` | bloqueado |
| 15 | (sem constante) | `false` em todos; sentido desconhecido |

### A tabela

`<table id="planilha">`, desenhada por script. Três linhas de cabeçalho (ano,
mês, dia) e uma linha por aluno: número, matrícula, nome, uma célula por aula
e três de totais (faltas, percentual sobre a carga horária, percentual sobre
as aulas lançadas).

- **Célula de aula:** `<td class="celula aluno_<ID_MAT> aula_<n>">`, com o
  número de faltas **como texto**. `n` é a posição da aula em `aulas`.
- **Célula vazia:** texto vazio (`NUM_FALTAS` = `null`).
- **Cores e marcas:** feriado, cancelada e suspensa são só cor de fundo, sem
  clique; trancado mostra `T`; matriculado depois e bloqueado mostram o valor
  em cor própria, sem clique. As demais têm o clique.
- **Cabeçalho do dia:** `<th class="<n> lancada|feriado|cancelada">`. Em dia
  ainda não lançado, clicar no cabeçalho marca todos os vazios como presentes
  (`zerarDia`).

### O clique numa célula

Dois efeitos, em sequência (`mudarValor`, depois `exibirInput`):

1. Célula vazia recebe o máximo do dia; célula com número desce um, e abaixo
   de zero volta ao máximo.
2. **Todas as outras células vazias daquele dia viram `0`.** Tocar num dia é
   lançá-lo: o SIGAA supõe presentes os que ninguém marcou.

Depois o texto vira um `<input>` de dois dígitos, que só aceita inteiro, é
limitado ao máximo do dia e, ao sair, volta a ser texto (`calcularFaltas`
refaz os totais da linha).

**Travas (`validarDatas`):** não se lança data futura, nem fora do período
letivo; a página avisa com um `alert`.

### Como o Gravar coleta

O formulário tem um campo escondido, `form:frequencias`, que chega preenchido
com o estado do servidor. No envio, o `onsubmit` do formulário chama
`atualizarFrequencias`, que percorre as células de cada aluno, lê o **texto**
de cada uma e, **se não estiver vazio**, põe o valor no registro. Depois
remonta a string inteira e a grava no campo. Consequências:

- **O servidor recebe a grade inteira**, não só o que mudou.
- **O que vale é o texto da célula.** Nenhum evento é necessário: escrever o
  número na célula basta para ele ir no envio.
- **Célula vazia mantém o valor que o registro tinha.** Depois de uma coleta,
  esvaziar a célula não volta o registro para `null`.

### O salvamento automático

A página registra um `A4J.AJAX.Poll` (`form:polling`) de **5 minutos**. A
cada disparo, o Ajax4jsf chama o `onsubmit` do formulário (a mesma
`atualizarFrequencias`) e envia a grade por AJAX, mostrando o diálogo
"Salvando" (`avisoSalvoAutomatico`). Ou seja: **tudo o que estiver escrito na
grade chega ao servidor em até 5 minutos, com ou sem Gravar.** Vale para os
cliques do professor e vale para o que o favorito escrever.

Os botões: "Gravar Frequências" envia o formulário (com proteção contra clique
duplo); "Cancelar" pergunta e fecha a aba.

## O que a captura tinha

CIN0114, período de 10/08 a 12/12/2026: 45 alunos, 38 aulas, 12 lançadas, 1
feriado. Valores de faltas: 1.230 `null`, 329 `0`, 151 `2`. Máximo do dia: 2
em 36 aulas, 4 em uma, **12** em outra. Quatro dias lançados têm 15 células
vazias (alunos que entraram depois): **dia lançado com vazios existe e é
aceito**. Nenhum trancado, matriculado depois ou bloqueado nesta turma: esses
casos continuam cobertos só pelos cenários inventados.

## O que isso significa para o favorito

- **Ler pelos dados.** O favorito lê `auxAulas`, `auxAlunos` e o período, e o
  texto atual de cada célula (o professor pode ter clicado antes). Não raspa
  a tabela para entender o modelo.
- **Escrever como a coleta lê.** Só em célula cujo texto está vazio, e pondo o
  número como texto. Não clica: clicar dispararia o "vira `0` o resto do dia",
  que é decisão do professor, não do Adsum.
- **O Preencher grava.** Por causa do salvamento automático, o gesto que
  decide é o Preencher, e a folha diz isso antes (decidido pelo autor em
  29/09: opção A, `docs/08`).
- **Desfazer até a primeira coleta.** Quando o campo `form:frequencias` muda
  depois do preenchimento, a página já recolheu os valores; dali em diante o
  Desfazer não volta a `null`, e a barra diz como corrigir: clicando na
  célula, como sempre.
- **Aula lançada é do professor.** Vazia em aula já lançada (quem entrou
  depois) fica como está: o Adsum não sabe a data de entrada de ninguém.
- **As mesmas travas da página.** Nada em data futura, fora do período
  letivo, feriado, cancelada, suspensa, trancado, matriculado depois ou
  bloqueado.

## O que ainda falta ver

- A planilha **depois** de um Gravar: a mensagem de sucesso e de erro.
- A planilha da **segunda turma**: outros casos (trancado, cancelada).
- Os **cabeçalhos da resposta**, em especial `Cross-Origin-Opener-Policy`.
