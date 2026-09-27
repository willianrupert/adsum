# 11 — Roteiro da v2: o que se constrói antes do HTML

Documento vivo. É o passo a passo de execução da especificação
`08_lancar_no_sigaa.md`, na parte que **não depende do HTML da planilha do
docente** (portão A). Começou em 27/09/2026, na branch `v2/lancar-no-sigaa`,
que não vai ao ar: publicar continua preso ao congelamento do `CLAUDE.md` e
aos portões do `08`, §6.

## Andamento: 94%

100% é tudo o que dá para construir e provar sem a página real. O que depende
dela está no fim, fora da conta.

## Como um passo anda

Especificação primeiro, depois teste, depois código:

1. O contrato e os exemplos saem do `08` (camada correspondente).
2. Os testes são escritos e **vistos falhar**.
3. O código os faz passar, sem mexer no teste.
4. Suíte inteira, lint e tipos verdes; o passo vira commit, e o percentual
   deste documento muda no mesmo commit.

Teste que passa de primeira não prova nada sozinho: o código é mutado de
propósito (uma regra desligada por vez) até cada mutação derrubar algum
teste. Mutação que sobrevive é teste faltando.

Passo pela metade conta zero. Nenhum passo de cima conserta defeito de um de
baixo: se aparecer, volta-se ao passo de baixo, com teste.

## A cebola

Dependência só aponta para dentro. O HTML do SIGAA toca apenas a casca mais
externa, em dois lugares pequenos: o extrator do favorito (página → bruto) e
os seletores com que ele escreve nas células.

```
favorito (DOM)        ← espera o HTML: seletores e extração
  protocolo           mensagens entre as janelas
    folha, rota       a tela do Adsum
      porta PonteSigaa, persistência (Dexie v9, sigaa/<turma>.csv)
        plano, validador
          conciliação  ← o núcleo, com as leis
            tipos     LeituraPlanilha: o contrato com a casca
```

Tudo abaixo do favorito conversa por `LeituraPlanilha`. Os testes usam
leituras inventadas nesse formato, geradas por `src/testes/planilhaSigaa.ts`.

## Os passos

| # | Passo | Camada (`08`) | Peso | Estado |
|---|---|---|---|---|
| 1 | Tipos da leitura e gerador de leituras de teste | 0 | 5 | feito, 27/09 |
| 2 | Conciliação por exemplo, e qual turma | 2 | 12 | feito, 27/09 |
| 3 | As sete leis, sobre entradas geradas | 2 | 10 | feito, 27/09 |
| 4 | Plano e validador | 3 | 8 | feito, 27/09 |
| 5 | Protocolo: mensagens, versão, origem, `id` | 4 | 8 | feito, 27/09 |
| 6 | Leitura: bruto provisório, datas das colunas, problemas | 1 | 6 | feito, 27/09 |
| 7 | Dexie v9 e a porta: ajustes e auditoria, só acréscimo | 7 | 10 | feito, 27/09 |
| 8 | Auditoria na pasta: `sigaa/<turma>.csv` | 7 | 5 | feito, 27/09 |
| 9 | Porta `PonteSigaa` e o chão: lista para lançar à mão | porta | 8 | feito, 27/09 |
| 10 | Folha do Adsum: rota `#/sigaa` e os três estados | 6 | 12 | feito, 27/09 |
| 11 | Favorito sem DOM: comparar e trocar, desfazer, build | 5 | 10 | feito, 27/09 |
| 12 | Jornada sem página, sobre cofre com histórico | 8 | 6 |  |

### 1 · Tipos (5)

`nucleo/lancar/tipos.ts`: `Celula`, `ColunaDia`, `LinhaAluno`,
`LeituraPlanilha`, `AjusteSigaa`, `Instrucao`, e as categorias do relatório.
Estado impossível não é representável: não há célula bloqueada com valor,
nem coluna sem data. `testes/planilhaSigaa.ts` gera leituras inventadas,
determinísticas por semente, com trancado, feriado e cancelada.

### 2 · Conciliação por exemplo (12)

`conciliar(leitura, matriculados, eventos, ajustes) → Relatorio`, com a
tabela de categorias do `08` inteira em exemplos, e `escolherTurma` (código do
cabeçalho **e** matrículas que cobrem a página; duas ou nenhuma, recusa). A
presença de cada dia vem de `presencasDoDia`, a mesma regra da planilha de
faltas da v1.

Decidido ao escrever os exemplos, onde o `08` deixava espaço, sempre para o
lado de não adivinhar:

- **Dia sem máximo:** o dia inteiro fica fora e vai para `semMaximo`,
  inclusive quem estava presente e as células já lançadas.
- **Matrícula da página sem par no Adsum** nunca recebe valor esperado:
  ninguém lança falta para quem o Adsum não conhece.
- **Qual turma:** o código da disciplina (`CIN0144`) no cabeçalho e no nome
  da turma, e pelo menos 80% das matrículas da página na turma
  (`COBERTURA_MINIMA`). **Corrigido no passo 12:** o nome da turma é texto
  livre do professor, e o cofre real anonimizado tem o código no meio
  (`2026.2 - TESTE01 - TURMA A`); o código agora vale em qualquer lugar do
  nome. Turma sem código no nome é recusada, com o motivo: só pelas
  matrículas, a chamada de uma disciplina iria para a planilha de outra da
  mesma turma de alunos. **A conferir no zip de sexta:** como as turmas do
  Prof. Paulo se chamam.

### 3 · As sete leis (10)

Partição, nunca toca lançado, nunca inventa dia, faixa, idempotência,
concordância com a v1, monotonia do ajuste. Testadas sobre centenas de
entradas geradas com semente fixa (sem dependência nova), além dos exemplos.

A lei da faixa achou uma lacuna na semente 4: um ajuste do professor virava
"a lançar" num dia sem máximo, e um ajuste acima do máximo de hoje passaria.
Agora ajuste também precisa caber na faixa da página. Cada lei tem uma
mutação da regra que ela protege, e todas são derrubadas.

### 4 · Plano e validador (8)

`planejar(relatorio, desmarcadas) → Instrucao[]` e
`validarPlano(plano, leitura)`, o mesmo validador que o favorito roda ao
receber. Um plano adulterado (célula lançada, fora da faixa, dia sem
chamada) é recusado inteiro.

### 5 · Protocolo (8)

As duas mensagens com versão, conferência de origem e de janela nos dois
sentidos, o `id` amarrando plano e leitura, favorito de versão desconhecida
recusado com "arraste o favorito novo". Funções puras sobre o conteúdo de um
`MessageEvent`.

### 6 · Leitura, sem o HTML (6)

`lerPlanilha(bruto) → { leitura?, problemas }` sobre um **bruto provisório**:
os textos que o favorito vai extrair (cabeçalhos de mês e dia, valores,
marcas, matrícula). Datas das colunas por mês + dia + ano do semestre, com
recusa da leitura inteira quando uma coluna não resolve para uma data única.
Nunca lança, nunca descarta linha calada. O formato do bruto é o que o
portão A pode mudar; a interpretação fica aqui, no Adsum, para que mudar o
SIGAA seja um deploy e não um favorito novo.

### 7 · Dexie v9 e a porta (10)

Versão 9 nova, sem tocar a 8: tabelas `ajustesSigaa` e `auditoriaSigaa`.
`Repositorio` ganha `gravarAjusteSigaa`, `lerAjustesSigaa`,
`acrescentarAuditoriaSigaa`, e nada de atualizar ou remover. Teste de
migração sobre uma base v8 com histórico.

### 8 · Auditoria na pasta (5)

`sigaa/<turma>.csv`, `quando;acao;versao_sigaa;dia_aula;matricula;lido;proposto;aplicado`,
com `;` e BOM, pela fila de gravação da pasta, sem nome. O `LEIA-ME.txt` da
pasta ganha a linha do arquivo novo.

### 9 · `PonteSigaa` e o chão (8)

A porta, e o primeiro adaptador: a lista para lançar à mão ("14/10: todos
presentes, exceto" e quem faltou), que não depende de nada do SIGAA e é o que
o professor usa se o favorito quebrar.

Como ficou, e por quê:

- **A porta é o canal** (`portas/PonteSigaa.ts`): `PonteJanela` (a janela
  aberta pelo favorito, só `window.opener`, só a origem do SIGAA) e
  `PonteSimulada` (testes e vitrine). A lista à mão **não** é adaptador dela:
  não troca mensagem com a página, e uma interface que um lado não cumpre é a
  mesma armadilha que o `LeitorSimulavel` evita ficando fora da porta.
- **O protocolo ganhou o "pronto"**: a janela recém-aberta ainda não ouve, e
  a leitura mandada antes disso se perdia.
- **A lista à mão sai da planilha de faltas da pasta**, para as duas nunca
  discordarem, e mora nos Ajustes, painel "Lançar no SIGAA".
- **Tudo da v2 na tela passa por `lancarNoSigaaLigado()`**
  (`ambiente/preferencias.ts`), hoje igual ao modo de desenvolvimento: o que
  for da branch para a `main` antes dos portões não aparece ao professor.

### 10 · Folha do Adsum (12)

Rota `#/sigaa` decidida por `decidirRota`; *Tudo confere*, *Há o que
lançar*, *Recusa*; Preencher com o número de aulas marcadas; Aceitar o
SIGAA; testada em jsdom contra o `RepositorioDexie` de verdade. As três
perguntas do fim do `09` foram decididas pelo autor em 27/09 (nomes atrás do
toque, "Agora não" só fecha, aceitar num toque com Desfazer).

Como ficou, e por quê:

- **`#/sigaa` é decidida no `App`, como a vitrine, e não em `decidirRota`.**
  A janela do favorito é uma segunda janela do Adsum, com `sessionStorage`
  próprio: pelo caminho normal, `abrirBase` → `fecharChamadaDeAntes` fecharia
  a chamada da janela principal no meio da aula. Ela abre só o repositório
  (`abrirBaseDaJanelaSigaa`), sem leitor; o teste abre a janela com uma
  chamada aberta e confere que ela continua.
- **O que a folha mostra é função pura** (`nucleo/lancar/folha.ts`); a tela só
  desenha. A conferência grava na auditoria as diferenças, uma vez por
  leitura; "tudo confere" avisa a planilha na hora ("nada a preencher").
- **No mesmo instante, vence o ajuste gravado depois**: sem isso, Desfazer
  logo depois de Aceitar não desfazia (achado aqui, conserto no passo 2).

Fica para depois, fora da conta: o cartão "Lançar no SIGAA" com o favorito
para arrastar (espera o portão A: arrastar um favorito que ainda não lê a
planilha não serve a ninguém) e a linha "Conferido com o SIGAA até" no
cartão da turma (precisa de um registro de conferência sem diferença, que a
auditoria hoje não guarda).

### 11 · Favorito sem DOM (10)

`src/favorito/`: aplicar com comparar e trocar, pintar, desfazer, sobre uma
página abstrata (`ler`/`escrever` por linha e coluna). Lei: desfazer devolve
cada célula ao valor lido. Build que gera o `javascript:` com teto de
tamanho. Só os seletores esperam o HTML.

**Decidido em 27/09:** o Adsum valida o plano contra a leitura inteira
(`validarPlano`); o favorito, contra o bruto que ele mesmo extraiu
(`favorito/aplicar.ts`: célula vazia na leitura, valor inteiro até o máximo
lido). As leis 2 e 4 valem dos dois lados, e o favorito não carrega o
intérprete da página, que continua no Adsum. `receberPlano` recebe a função
de validação.

Como ficou:

- **Tudo o que depende do HTML** mora num `Localizador`
  (`favorito/paginaSigaa.ts`), e o de hoje não reconhece página nenhuma: o
  favorito diz "esta página não é a planilha" em vez de adivinhar. Escrever
  (com `input` e `change`, como quem digita), pintar e a barra são nossos.
- **O favorito gerado é conferido no próprio código**: ~8 KB, e sem
  requisição, clique, envio de formulário, navegação, `eval`, `postMessage`
  para qualquer origem ou armazenamento no navegador do SIGAA.
- **Pendente para a folha (passo 10):** o laranja nas diferenças precisa que
  o plano leve as diferenças junto (mudança de protocolo), e a barra hoje
  fecha em vez de recolher numa pílula (passada visual).

### 12 · Jornada sem página (6)

Cofre com histórico + planilha simulada + favorito lógico + folha:
conferir → preencher → "gravar" → conferir dá *Tudo confere*.

## Depois do portão A (fora da conta)

- O extrator do favorito (página → bruto) e os seletores de escrita.
- `scripts/anonimizar_sigaa.py` e as fixtures da planilha real.
- A jornada completa sobre a fixture, e os portões B a E do `08`.
