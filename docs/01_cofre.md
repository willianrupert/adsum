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
