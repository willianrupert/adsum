# 02 — Formato dos arquivos, decidido do zero

Documento vivo. Decidido e implementado em 18-19/08/2026, no lugar do formato
herdado do firmware; é o que está no ar. Revisto em 25/09/2026.

**O formato não muda sem motivo** (`CLAUDE.md`). Os testes usam as linhas
literais; mudar uma coluna é decisão, não descuido, e entra aqui com data.

## Quem consome o quê

Sem aparelho, sobraram três consumidores, e só um deles não é o app:

| Consumidor | Precisa de |
|---|---|
| A planilha do professor | uma linha por presença, com a matrícula; e a planilha de faltas pronta para entregar |
| O dongle USB | nada — ele só produz UID, não lê arquivo |
| O próprio app | o cofre inteiro, para reabrir onde parou |

O dongle não ler nada é o que liberta o formato. **Todas as concessões que
existiam por causa do firmware caem.**

## Cofre: JSON

`config.json`, `vinculos.json`, `grade.json` e `turmas/<turma>.json`. São
dados que o app reescreve por inteiro quando corrige algo, e ninguém além dele
lê. Todos no mesmo envelope (`nucleo/cofre.ts`):

```json
{ "versao": 1, "gravadoEm": "2026-09-24T14:02:11.000Z", "conteudo": … }
```

Indentado, para o professor poder conferir sem o app. Arquivo com `versao`
maior que a do app é recusado com o motivo: lê-lo pela metade e regravar
perderia o que não foi entendido.

O que cada um guarda, e por quê, está nos tipos de `nucleo/tipos.ts`. Os
campos que já custaram uma aula:

- `config.json`: `salHex` (o sal atual), `saisAnteriores` (o chaveiro,
  nunca encolhe), `instalacaoId` (prefixo do `evento_id`, diferente em cada
  navegador), `proximaSequencia` (o próximo número de evento, só anda para
  frente).
- `vinculos.json`: `uidHash`, `papel`, `nome` (curto), `matricula`,
  `criadoEm`, `salId` (impressão do sal em que o crachá foi cadastrado),
  `sintetico` (vínculo de professor sem crachá físico, criado pelo botão).

## Saída: CSV, um arquivo por turma

```
registros/IF685-T01.csv
```

Um por turma, e não um mestre: cada turma vira uma planilha, e turma nova não
mexe em arquivo de turma antiga.

```
evento_id;quando;turma;matricula;nome;origem;resultado;uid_hash
```

Cada coluna se justifica sozinha:

- **`evento_id`** — chave de idempotência. Reimportar o mesmo arquivo não pode
  duplicar linha, e é ela que permite juntar dois arquivos que a sincronização
  da pasta duplicou. Forma: `<instalação>-<AAAAMMDD>-<sequência>`.

  **O número é reservado, não contado** (desde 22/09/2026). Contar eventos
  para numerar fez duas telas cunharem o mesmo id no mesmo dia, e a base
  recusou calada metade da chamada. Hoje o número sai de
  `Config.proximaSequencia`, reservado em transação por `reservarSequencia`, e
  todo evento novo passa por `gravarEventoNovo`. Linha antiga com id repetido
  e conteúdo diferente entra na base como `<id>.2`; o arquivo fica como foi
  gravado.
- **`quando`** — ISO 8601 com fuso. Data em formato local numa planilha é como
  se perde uma turma inteira em fevereiro.
- **`turma`** — redundante com o nome do arquivo, e fica: arquivo renomeado ou
  colado noutro lugar continua sabendo de onde veio.
- **`matricula`** — é o que fecha a chamada. Nome muda com correção de
  cadastro, matrícula não.

  Aqui esteve escrito `login`, e por um tempo o código também. **O login do
  SIGAA é credencial de acesso**, e credencial de acesso não entra em arquivo de
  frequência nem viaja em planilha — a página de participantes mostra o campo, e
  o parser passa por ele de propósito, sem ler. A matrícula identifica sem
  destravar nada.
- **`nome`** — só para quem abrir o arquivo e querer entender o que está vendo.
  Nenhum cálculo depende dele.
- **`origem`** — `cracha`, `professor`, `manual`.
- **`resultado`** — `ok`, `duplicado`, `desconhecido`, `rapido_demais`,
  `removido`.

  `rapido_demais` entrou em 20/08/2026, com a regra de intervalo mínimo entre
  crachás diferentes: dois cartões numa mão dependem do ciclo de varredura do
  leitor, e duas pessoas apressadas precisam mover o braço. A recusa fica no log
  com o `uid_hash` do crachá recusado — recusa muda é bug, e o professor merece
  poder conferir depois que houve tentativa. Arquivo antigo nunca contém o
  valor, então ler o passado continua funcionando.

  `removido` entrou em 11/09/2026: o professor tirando à mão, em "Não
  presente" ou em "Ver presenças", uma presença contada por engano. A leitura
  original continua no arquivo; só deixa de valer como presença. Crachá
  gravado depois de um `removido` devolve a presença (23/09/2026), e quem diz
  "depois" é o número do evento, não o `quando`.
- **`uid_hash`** — o único identificador que sobra quando o crachá é
  desconhecido, e portanto o único jeito de resolver depois quem era.

**Sai `sessao_id`**, que existia no formato antigo: turma mais data já dizem de
que aula é a linha, e um campo a menos é um campo que não pode divergir.

## A planilha de faltas: `faltas/<turma>.csv`

Pedida pelo Prof. Paulo para a v1: o que ele entrega.

```
nome;matricula;15/09/2026;17/09/2026;22/09/2026
Ana Beatriz Souza Lima;20250000001;0;2;0
```

- Uma linha por aluno (docentes ficam de fora), em ordem alfabética do **nome
  completo**, que vem primeiro porque é por ele que se lê a lista.
- **`matricula`**, desde 25/09/2026 (na branch da v2, ainda não publicada). É
  o identificador da pessoa e o que a planilha do SIGAA usa; antes, um nome
  corrigido no cadastro deixava de bater com a lista do professor.
- Uma coluna por dia em que houve chamada (evento de origem `professor`
  naquele dia), em `dd/mm/aaaa`.
- Na célula, quantas faltas o dia vale: `0` se esteve, e senão o número de
  aulas de 50 min da grade daquele dia da semana (`periodosDoBloco`). Sem
  grade, 1: marcar duas sem a grade confirmar seria inventar falta.
- Recalculada a cada mudança, só da turma que mudou. É derivada de
  `registros/`, que é quem manda.

## O diário: `diagnostico/<dia>.log`

Texto, uma linha por fato, campos separados por ` | `:

```
14:02:11 | cracha | hash=3fa2c1d9 | sal=… | vinculo=aluno | decisao=presenca | evento=… | identificar_ms=13 | gravar_ms=7 | tela_ms=48
```

O primeiro campo é a hora, o segundo o tipo (`app_aberto`, `abrir`,
`cracha`, `desconhecido`, `desconhecido_durante_busca`, `recusa`, `foco`,
`id_ocupado`, `conferencia_ok`, `conferencia_divergiu`, `encerrar`, `erro_…`,
entre outros), e o resto `chave=valor`. Sem
nome e sem UID. Não é contrato com ninguém além de quem lê o zip: pode ganhar
campo sem cerimônia, mas não pode perder um que a leitura de sexta usa.

## Os códigos dos crachás: `auditoria/uids.csv`

Só durante a fase de testes, desligável no Diagnóstico.

```
uid_hex;uid_hash;primeira_leitura;leitor
```

Uma linha por crachá, na primeira vez que é lido. `uid_hash` é o do vínculo
em que ele foi achado, não o do sal atual: é o que permite refazer o vínculo
se aquele sal se perder. `;` e BOM, como os outros.

## Lançar no SIGAA: `sigaa/<turma>.csv`

Na branch da v2 (`docs/08`, `docs/11`), ainda não publicado.

```
quando;acao;versao_sigaa;dia_aula;matricula;lido;proposto;aplicado
```

Uma linha por célula tocada ou divergente, em cada `conferencia`,
`preenchimento`, `desfeito` e `aceite`. `lido` é como a célula estava (vazia,
o número, ou o motivo do bloqueio); `proposto`, o que o Adsum diria;
`aplicado`, o que ficou valendo. No `aceite`, a célula do SIGAA não muda, e
`aplicado` é o valor que o professor aceitou: é dessa linha que o ajuste
volta quando a base é refeita. Sem nome, e sem turma: ela é o nome do
arquivo, casado com as turmas da base (ambiguidade é problema dito). `;` e
BOM, só acréscimo. Conferido contra a base nos dois sentidos ao ligar a
pasta; a janela do SIGAA grava só na base.

## O que sobreviveu, e não era herança

No inventário do `CLAUDE.md` eu listei `;` e BOM como herança do firmware.
**Estava errado, e a correção importa:** os dois nunca foram do aparelho.

- **`;` como separador** existe porque o Excel em português usa ponto e vírgula
  como separador de lista. Um CSV com vírgula abre como uma coluna só, e o
  professor vê a planilha quebrada antes de ver qualquer presença.
- **BOM** existe porque sem ele o Excel lê UTF-8 como Latin-1 e "João" vira
  "JoÃ£o".

Os dois são decididos pelo consumidor real, que é a planilha, e continuam.

**Append puro também fica**, e agora por um motivo novo: a pasta pode estar no
iCloud ou no Drive, e duas máquinas escrevendo no mesmo arquivo é caso normal,
não excepcional. Só append faz o conflito ser resolvível — nenhuma linha se
perde, e `evento_id` deduplica na junção.

## O que morre com o aparelho

- `alunos.csv` com três colunas "porque o firmware lê três" — vira
  `vinculos.json`
- `grade.csv` indexada por hash do professor "porque o aparelho circula" — o
  navegador é de um professor só; a grade é dele
- o buffer de 31 bytes e a coluna de 210 px — não há display
