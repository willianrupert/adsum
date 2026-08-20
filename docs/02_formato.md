# 02 — Formato dos arquivos, decidido do zero

Não implementado. Substitui o formato herdado do firmware.

## Quem consome o quê

Sem aparelho, sobraram três consumidores, e só um deles não é o app:

| Consumidor | Precisa de |
|---|---|
| A planilha do professor | uma linha por presença, com a matrícula |
| O dongle USB | nada — ele só produz UID, não lê arquivo |
| O próprio app | o cofre inteiro, para reabrir onde parou |

O dongle não ler nada é o que liberta o formato. **Todas as concessões que
existiam por causa do firmware caem.**

## Cofre: JSON

`config.json`, `vinculos.json` e `turmas/<turma>.json`. São dados que o app
reescreve por inteiro quando corrige algo, e ninguém além dele lê. JSON com
`versao` no topo, e acabou a discussão.

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
  da pasta duplicou.
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
- **`resultado`** — `ok`, `duplicado`, `desconhecido`, `rapido_demais`.

  `rapido_demais` entrou em 20/08/2026, com a regra de intervalo mínimo entre
  crachás diferentes: dois cartões numa mão só são lidos em centenas de
  milissegundos, e duas pessoas numa fila levam segundos. A recusa fica no log
  com o `uid_hash` do crachá recusado — recusa muda é bug, e o professor merece
  poder conferir depois que houve tentativa. Arquivo antigo nunca contém o
  valor, então ler o passado continua funcionando.
- **`uid_hash`** — o único identificador que sobra quando o crachá é
  desconhecido, e portanto o único jeito de resolver depois quem era.

**Sai `sessao_id`**, que existia no formato antigo: turma mais data já dizem de
que aula é a linha, e um campo a menos é um campo que não pode divergir.

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
