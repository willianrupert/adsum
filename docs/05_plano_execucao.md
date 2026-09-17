# Plano de execução — triagem de 15/09/2026

Registro do que foi levantado numa sessão de triagem depois da primeira aula
real com o Adsum, para a próxima sessão não recomeçar a investigação do zero.
Cada item tem a causa raiz (arquivo + linha, lida no código, não suposta) e a
direção de correção decidida com o autor.

## Fase 1 — bugs de dados, confirmados ao vivo ou por leitura de código — **feita** (16/09/2026)

Commitado local, não publicado: `263b75a`, `07e614c`, `62cbeea`, `87b6691`.
409 testes viraram 410 (um novo por cenário reproduzido), suíte inteira verde
isolada. Uma lacuna apareceu na revisão e foi fechada no mesmo dia, fora do
que tinha sido escrito abaixo originalmente: `ordemDaBusca`
(`src/ui/TelaAula.tsx`) ainda filtrava quem já tem crachá por
`papel === 'aluno'` — um professor que perdia o crachá e trazia outro ficava
invisível na busca, e "Cadastrar" de novo criaria um segundo vínculo real
(reabrindo o bug da grade dividida). `vincularCracha` passou a substituir
também um vínculo real antigo do mesmo professor, não só um sintético.

### Vínculo sintético do professor rouba identidade real (funde os pedidos 3 e 6)

Ao vivo: o professor puxou a lista do SIGAA e, ao iniciar a chamada, o docente
Mauricio Sightman apareceu "vinculado" sem nunca ter encostado crachá.

Causa: `garantirProfessor` (`src/ui/Fluxo.tsx:488`) cria um vínculo sintético
para permitir abrir a chamada sem crachá físico — isso é deliberado e correto
(ver comentário em `src/nucleo/tipos.ts:29`, campo `sintetico`). O bug é que,
ao criar esse sintético, a linha 492 busca `listarMatriculados().find(m =>
m.papel === 'professor')` — o primeiro docente encontrado **em toda a base,
de qualquer turma** — e copia nome/matrícula dele pro vínculo sintético
(linhas 496-497). `quemFalta` (`src/nucleo/sessao.ts:21`) e `vinculoDe`
(`src/ui/TelaAula.tsx:269`) casam por nome/matrícula sem filtrar turma, então
esse vínculo "sintético com nome de gente real" marca o docente como
vinculado em qualquer lugar que ele apareça.

Direção decidida: `garantirProfessor` para de adivinhar identidade.

- Sem vínculo real de professor ainda: sintético nasce genérico — `nome:
  'Professor'`, sem matrícula, sem apontar pra ninguém.
- Com vínculo real (professor já se cadastrou explicitamente, ver abaixo):
  usa esse vínculo em vez de criar sintético.
- `listarVinculos().find(papel === 'professor')` (linha 489) continua sem
  filtrar por turma — a máquina é de um professor só, faz sentido reusar.

Isso também entrega o pedido 6: professores aparecem numa seção separada,
acima da lista de alunos, e o cadastro deles vira sempre um clique explícito
em "Cadastrar" — nunca automático. Sem essa seção nova, `garantirProfessor`
não teria de onde puxar um vínculo real explícito.

Consequência a avisar: o vínculo sintético com o nome do Mauricio já pode
estar gravado na base real do professor. O fix de código impede *novos*
casos; o registro que já existe só sai removendo manualmente em Ajustes →
Vínculos — avisar o professor depois do deploy.

### Contador de presença sobe com crachá de professor

`src/nucleo/sessao.ts:202` (branch `cadastro` de `decidir`) não olha `papel`;
`src/ui/TelaAula.tsx:337` soma ao contador (`jaPresentes`) em qualquer
`cadastro`/`presenca`, sem exceção. Só professor **já vinculado** hoje fica de
fora (o branch `professor` de `decidir`, linha 157, nunca retorna
`presenca`/`cadastro`). Fix: excluir `papel === 'professor'` da contagem
também no caminho de primeiro cadastro.

### Apelido editado em Ajustes não aparece na chamada

Não é bug de persistência — `TelaRepositorio.tsx:483` grava certo no Dexie
(`await` correto, `RepositorioDexie.gravarVinculo`, `put`). O problema é que
`Vinculo.nome` (editado em Ajustes → Vínculos) e `Matriculado.nome` (vindo do
SIGAA) são campos de tabelas diferentes, e `TelaAula.tsx` (`efetivo(p)`)
sempre lê `Matriculado.nome`, nunca `Vinculo.nome`. Fix: `TelaAula` passa a
preferir `Vinculo.nome` quando existir. Sem teste cobrindo esse fluxo hoje —
precisa de um novo.

### Apelidos podem colidir mesmo com o aviso na tela

Ao vivo: "Julio Ferreira C." saiu idêntico para duas pessoas de nomes
completos diferentes, e o aviso de nomes iguais apareceu — mas os apelidos
continuaram iguais.

Causa: `prepararLista` (`src/nucleo/nomes.ts:74`) desambigua por inicial do
último sobrenome; se **ainda assim** colidir, marca `ambiguo: true`
(linha 112) e avisa, mas **mantém os apelidos idênticos** — o aviso substitui
a garantia em vez de anteceder um fallback. Fix: quando a inicial não
resolver, cair automaticamente para o nome completo (a matrícula já
desempata qualquer coisa que sobrar) — sem aviso, porque aí não há mais
colisão.

### Tela de repouso não indica "em aula" com mais de um vínculo de professor na base

A tela de repouso (`Repouso`, `src/ui/Fluxo.tsx:1140`) já tem o design certo
— três estados: "Começar chamada em [Turma]" quando o horário bate agora,
"Sua próxima aula" quando não bate mas há uma futura, "Ver presenças" em
destaque quando não há nenhuma. Não era caso de redesenho — era bug.

Reproduzido: 15/09/2026, 9:40, mais de uma turma cadastrada, só uma com aula
naquele horário. A tela não caiu no primeiro estado mesmo assim.

Causa: `recontar()` (`src/ui/Fluxo.tsx:227`) escolhe **um único** vínculo de
professor pra decidir "que turma está em aula agora" —
`vinculos.find(v => v.papel === 'professor')`. `listarVinculos()`
(`src/adaptadores/repositorio/RepositorioDexie.ts:71`) ordena por `nome`,
então esse `.find` sempre pega o professor cujo nome vence a ordem
alfabética — e é o `uidHash` dele que `aulasAgora`/`abrirSozinho`
(`src/nucleo/grade.ts`) usam pra filtrar `Aula.uidHashProfessor` por
igualdade estrita. Se existir mais de um vínculo `papel: 'professor'` na
base — o que o uso normal produz sem passar por Ajustes, bastando colar
duas turmas do SIGAA e identificar o crachá de cada docente pela busca
(`TelaAula.tsx:843`, vínculo real) em momentos diferentes, ou um vínculo
sintético do bug anterior já existir antes do crachá real ser lido pela
primeira vez — a tela só enxerga a grade de **um** professor. A turma presa
ao vínculo que perdeu o desempate alfabético nunca aparece como "em aula",
silenciosamente.

Fix: `recontar()` para de escolher um professor arbitrário — passa a checar
a grade de **todos** os vínculos com `papel: 'professor'`. Mais de uma turma
batendo "agora" entre professores diferentes cai na mesma lógica de
ambiguidade que `escolherTurma` já tem pro clique manual ("perguntar é
respeito, não incômodo"), estendida também pro monitoramento automático da
tela ociosa.

Ponta solta que o fix do item anterior deixa, e este item amarra: quando o
crachá real do professor é identificado e um vínculo sintético já existia
antes, hoje os dois ficam na base — a correção de `uidHashProfessor` vazio
(`Fluxo.tsx:246-254`) só cobre aula sem hash nenhum, não aula presa ao hash
sintético antigo. Vínculo real precisa substituir o sintético, migrando
qualquer `Aula` que ainda aponte pro hash velho.

## Fase 2 — reorganização de UI, tudo já decidido

Itens 1-3 **feitos** (16/09/2026), commitados local: `3cff356`, `258f95c`.
411 testes verdes. Itens 4-6 seguem para a próxima leva.

- ~~**Botão "Ver presenças" sumindo:**~~ **feito.** Link secundário sempre
  visível na tela de repouso, independente do estado.
- ~~**Simplificar Ajustes:**~~ **feito.** Card "Registros" saiu de Ajustes,
  Importar/Exportar/Exportar faltas migraram para Diagnóstico.
- ~~**Reordenar cards de Ajustes:**~~ **feito.** Ver presenças → Grade
  horária → Vínculos.
- **Diagnóstico, "Últimas leituras" x "Chamadas recentes":** dados não são
  redundantes (um é log cru de leituras, inclusive recusadas; o outro é
  resumo agregado por sessão encerrada, usado para calibrar
  `INTERVALO_MINIMO_MS`) — mas "Últimas leituras" é ferramenta de depuração,
  não uso do dia a dia. Fix: recolhida por padrão, "Chamadas recentes" em
  primeiro plano. Sem perda de dado.
- **Rodapé de Ajustes:** `Diagnóstico · Manual · GitHub` (o botão GitHub abre
  `github.com/willianrupert/adsum`), e "Willian Rupert" em cinza claro
  embaixo, estilo copyright © 2026.
- **Popup de novidades:** lista estática versionada embutida no build
  (`nucleo/novidades.ts`, `{ versao, resumo }[]`), comparada com "última
  versão vista" guardada em preferências locais (mesmo padrão de
  `encerradas()`). Toast de uma linha no rodapé, aparece uma vez por versão
  nova, dispensa sozinho. Sem servidor, sem CDN — mantém a regra de "nada
  sai do computador".

## Fase 3 — escopo maior, desenho antes de código

### Grade simplificada e grade completa

Hoje `BLOCOS` (`src/nucleo/horarios.ts:33`) é uma lista fixa de 9 blocos que
é ao mesmo tempo a unidade de marcação **e** a unidade de exibição
(`GradeDaSemana.tsx:125` desenha uma linha por bloco, direto do array). Não
existe hoje forma de marcar meia hora dentro de um bloco de 100 minutos.

Decidido com o autor: duas grades, com um toggle estilo Apple acima —
**simplificada** (blocos atuais, sem os horários de sábado 07:00–11:50 /
13:00–17:50 aparecendo à parte) e **completa**, com granularidade de 50 min,
pra onde o bloco de meio-dia (hoje o único "curto") migra.

**Desenho fechado (16/09/2026):**

Achado ao investigar: **não precisa mudar nada no Dexie.** `Aula.inicio`/`fim`
já são strings livres, e `marcadosDe()` (`nucleo/horarios.ts`) já tolera uma
`Aula` que não bate com bloco nenhum (conta como `foraDosBlocos`, avisa, mas a
aula continua abrindo chamada normal). O problema é só de UI: hoje existe um
catálogo só (`BLOCOS`), que vira ao mesmo tempo as linhas da grade e a unidade
de marcação. A saída: dois catálogos independentes, ambos só produzem
`Aula{inicio, fim}` — sem conflito de dado, só de qual conjunto de horários a
tela oferece pra clicar.

Cada período de verdade tem 50 min, com 10 min de intervalo até o próximo —
confirmado pelo autor (`8:00–8:50`, `9:00–9:50`...) — **exceto** o par da
noite (18:50–20:30), que já era documentado como "encostado" (sem intervalo):
inferido como `18:50–19:40` / `19:40–20:30`, sem confirmação explícita —
conferir contra a grade oficial antes de publicar.

Fatiando os blocos atuais nesse ritmo, os horários de sábado (07:00–11:50 e
13:00–17:50) batem exatamente com os mesmos períodos de segunda a sexta —
sábado só ganha um período a mais, às 07:00, que dia de semana não tem.
Catálogo completo:

| Período | Seg-Sex | Sáb |
|---|---|---|
| 07:00–07:50 | não | sim |
| 08:00–08:50 | sim | sim |
| 09:00–09:50 | sim | sim |
| 10:00–10:50 | sim | sim |
| 11:00–11:50 | sim | sim |
| 12:00–12:50 | sim | não |
| 13:00–13:50 | sim | sim |
| 14:00–14:50 | sim | sim |
| 15:00–15:50 | sim | sim |
| 16:00–16:50 | sim | sim |
| 17:00–17:50 | sim | sim |
| 18:00–18:50 | sim | não |
| 18:50–19:40 | sim (inferido) | não |
| 19:40–20:30 | sim (inferido) | não |

Implementação: `Bloco` ganha `dias: number[]` no lugar de `soSabado?: boolean`
— mais geral, cobre "a maioria dos períodos vale seg-sex e sábado, menos
alguns" sem caso especial. `BLOCOS` (simplificada) perde os dois blocos de
sábado — a coluna de sábado some da grade simplificada inteira, porque não
sobra nada pra marcar nela; sábado vira só alcançável pela completa.
`GradeDaSemana.tsx`, `marcadosDe`, `aulasDe`, `horasPorSemana`, `ehCurto`
passam a receber a lista de blocos como parâmetro em vez de importar `BLOCOS`
fixo — mesma lógica, dois catálogos. Toggle (visual de segmentado, reaproveita
`.segmentado`/`.segmento` já usado na escolha de leitor) guardado em
`ambiente/preferencias.ts` — é escolha desta máquina, não da turma.

Trocar de modo não perde dado: uma `Aula` de 09:00-09:50 (só metade de um
bloco da simplificada) aparece como `foraDosBlocos` ao voltar pra
simplificada — mecanismo que já existe, sem trabalho extra.

## Fase 4 — desempenho e escala, achado na véspera/dia da validação real (16-17/09/2026)

Origem: investigando por que a leitura falhou em 15/09 (ver o fix de
`evento.timeStamp`, commit `4d89ad6`, e o rig de hardware real,
`ferramentas/rig-de-cracha/`, que validou 200 pessoas com sucesso), apareceu
uma pergunta diferente — o fix resolve uma **medição errada** de tempo; ele
não resolve uma conta que é **genuinamente lenta**. Investigado a fundo,
inclusive com benchmark real rodado contra o código de produção (script
descartado depois, não commitado — os números abaixo são de execução real,
não estimativa).

**B, C, D, E implementados e testados em 17/09/2026** (não commitado —
fica pra revisão do autor antes de subir; nada disso vai ao ar no mesmo dia
de uma validação real). Suíte inteira verde (448 testes + os novos deste
lote), `tsc --noEmit` limpo. A e F continuam só registrados, sem
implementação — A por pedido explícito do autor ("guardar por ora"), F por
mudar uma garantia que precisa de conversa antes.

### A — Falha silenciosa ainda estrutural no `LeitorTeclado`

Quando uma rajada é recusada por parecer digitação humana
(`interpretarDigitacao` devolve `undefined`), `LeitorTeclado.#fechar()`
(`src/adaptadores/leitor/LeitorTeclado.ts`) só incrementa `#recusados` —
nenhuma `Leitura` é emitida, `TelaAula` nunca é chamada, sem toast, sem
bipe. O fix de `timeStamp` fechou a causa de 15/09; não fechou a classe do
problema — qualquer causa nova que volte a rejeitar rajadas de verdade
produz o mesmo sintoma invisível. **Status: registrado, sem decisão do
autor ainda** — ele pediu para guardar e ver como sai a validação de
17/09/2026 antes de decidir se vale dar voz a essa recusa (ex.: toast
"leitura ignorada, parecia digitação").

### B — Leituras e consultas não escopadas por turma — **implementado** (17/09/2026)

`Repositorio.listarEventos(limite?)` (`src/portas/Repositorio.ts:84`) não
aceita filtro de turma, mesmo o schema do Dexie já indexando `eventos` por
`turma` (`banco.ts:54`, `where('turma').equals(...)` seria imediato). Três
chamadores no caminho quente (a cada crachá aceito) leem a tabela inteira
pra depois filtrar em JS:

- `TelaAula.recarregar()` — `src/ui/TelaAula.tsx:258`
- `Fluxo.recontar()` — `src/ui/Fluxo.tsx:250`
- `sincronia.gravarFaltas()` / `repararLog()` — `src/ambiente/sincronia.ts:58,109`

`Fluxo.recontar()` também chama `listarMatriculados()` **sem** turma
(`Fluxo.tsx` ~linha 251), embora `listarMatriculados(turma?)` já aceite o
parâmetro (`Repositorio.ts:53`) — a porta já suporta, a chamada não usa.

Direção proposta: `listarEventos` ganha `turma?: string` opcional, usando o
índice já existente; os três chamadores do caminho quente passam a pedir só
a turma da sessão aberta quando fizer sentido (Diagnóstico e "Ver
presenças" continuam pedindo tudo — são tela aberta por escolha, não
caminho quente). **Sem mudança de comportamento observável** — mesmo dado,
mesma tela, só para de ler o que não precisa. Baixo risco.

**Medido (17/09/2026), contra `RepositorioDexie` de verdade** (mesmo banco
de 3.960 eventos, 20 repetições pra suavizar ruído): `listarEventos()`
(tabela inteira + `.filter()` em JS) = 11,0ms em média; a mesma consulta
via `where('turma').equals(...)` (o índice que já existe) = 4,0ms — **2,8×
mais rápido**. Bem menor que o ganho do item D, mas é chamado duas vezes
por crachá hoje (item E) — resolver B já elimina metade de E de graça.

### C — `gravarFaltas`/`sincronizar` recalculam TODAS as turmas a cada crachá — **implementado** (17/09/2026)

`gravarFaltas()` (`src/ambiente/sincronia.ts:57`, `for (const turma of
turmas)`) e `sincronizar()` (`sincronia.ts:148`, mesmo padrão) recomputam e
regravam em disco os arquivos de **todas** as turmas do professor a cada
crachá aceito em **qualquer uma** delas. Com duas turmas, um crachá na
Turma A regrava a planilha de faltas da Turma B também, sem que nada nela
tenha mudado.

Direção proposta: `mudou()` (`Fluxo.tsx:440`) passa a informar qual turma
mudou; `gravarFaltas`/`sincronizar` recalculam só essa turma quando o
chamador souber qual é (nos outros casos — abrir o app, restaurar da pasta
— continuam recalculando tudo, que é o comportamento certo ali). Baixo
risco, mesma saída em disco, só menos trabalho por turma que não mudou.

### D — `planilhaDeFaltas`: O(alunos × dias × eventos_da_turma), com `new Date()` dentro do loop — **crítico, medido, implementado** (17/09/2026)

`planilhaDeFaltas` (`src/nucleo/faltas.ts:114-127`) refaz um `.filter()`
sobre `daTurma` inteiro dentro de um duplo loop (`alunos.map` × `for (const
dia of dias)`), e cada comparação chama `diaLocal(e.quando)`
(`faltas.ts:26`), que faz `new Date(iso)` **a cada chamada** — não fora do
loop, não memoizado.

**Benchmark real** (função de produção, dados sintéticos representando o
cenário descrito pelo autor — duas turmas, 50 e 80 alunos, 60h/semestre ≈
30 aulas cada — script rodado e descartado, não commitado):

| Aulas acumuladas | Eventos no banco | Custo por crachá (as 2 turmas) |
|---|---|---|
| 3 | 396 | 20ms |
| 6 | 792 | **57ms** — já no limiar de `INTERVALO_MAXIMO_MS` (60ms) |
| 10 | 1.320 | 149ms |
| 15 | 1.980 | 328ms |
| 20 | 2.640 | 572ms |
| 25 | 3.300 | 899ms |
| 30 (fim do semestre) | 3.960 | **1.319ms** |

Crescimento quadrático, não linear (`eventos_da_turma` também cresce com
`dias`). Pelo benchmark, o limiar que causou o incidente de 15/09 é
cruzado por volta da **sexta aula** do semestre — não no fim dele. Sem
correção, é esperado que o mesmo sintoma silencioso (item A) volte a
acontecer de forma recorrente, cedo, numa turma com esse porte, mesmo com
o fix de `timeStamp` já no ar — porque esse atraso não é medição errada,
é conta real acontecendo de verdade.

Direção proposta: trocar o duplo `.filter()` por uma indexação prévia —
agrupar `daTurma` num `Map<string, Evento[]>` chaveado por identidade do
dono do evento (`matricula`, ou `nome` quando não há matrícula — a mesma
regra de `ehDoAluno`) e dia, numa única passada, antes dos loops. O corpo
do loop principal passa a ser uma busca no `Map` em vez de um novo
`.filter()` completo. `diaLocal` calculado uma vez por evento nessa
passada, não uma vez por célula. Mesma saída, mesma planilha — O(eventos +
alunos × dias) em vez de O(alunos × dias × eventos).

**Verificado, não só proposto (17/09/2026):** implementei essa versão num
script descartado (não commitado), com teste de equivalência — mesma
entrada, `expect(otimizada).toEqual(original)` — **passou**, confirmando
que a saída é idêntica, célula a célula. Rodando o mesmo cenário de fim de
semestre (2 turmas, 50 e 80 alunos, 30 aulas, 3.960 eventos):

| Versão | Custo por crachá (as 2 turmas) |
|---|---|
| Original | 1.305,72ms |
| Otimizada | 2,27ms |
| **Speedup medido** | **575,8×** |

Sem mudança de comportamento observável — mesma planilha, mesmo CSV. Risco
baixo (é substituição de implementação, não de contrato), mas é o item que
mais precisa do teste de equivalência entrando na suíte de verdade antes
do deploy — não só "mais rápido", **"o mesmo resultado, mais rápido"**.
Vale também um teste de desempenho com limiar generoso (ex.: "80 alunos, 30
dias, sob Xms") pra este número nunca mais regredir em silêncio.

### E — Leitura duplicada entre `TelaAula.recarregar()` e `Fluxo.recontar()` — **implementado** (17/09/2026)

As duas rodam em sequência, a cada crachá, e cada uma lê `listarEventos()`
e `listarVinculos()` de forma independente — mesma tabela, duas consultas.
Menor prioridade que B-D (não é quadrático, é só 2× em vez de 1×), mas
seria eliminado quase de graça ao resolver B, já que aí as duas leituras
passam a pedir só a turma certa.

**Resolvido como efeito colateral de B.** `TelaAula.recarregar()` já pede
só a turma da aula; `Fluxo.recontar()` continua lendo `listarEventos()`
sem escopo — mas só quando **não** há pasta escolhida (achado extra, ver
abaixo), então no caminho comum (com pasta) essa segunda leitura nem
acontece mais.

**Achado extra durante a implementação:** `Fluxo.recontar()` só usava
`listarEventos()` pra alimentar `naoSalvos()`/`pendencias` — e todo
consumidor de `pendencias` já reduz para `pasta ? [] : pendencias` /
`pasta ? 0 : totalNaoSalvo(...)` (o próprio comentário de
`Config.exportado`, em `nucleo/tipos.ts`, diz isso: "só faz sentido onde
não há pasta"). Com pasta escolhida — o caminho recomendado —, essa leitura
inteira do log virou saltável, **sem mudar nenhum valor observável**:
`recontar()` agora só chama `listarEventos()` quando `!pasta`.

### F — Agrupar gravação em disco (ideia levantada pelo autor, não decidida)

Se, mesmo depois de B-E, a fila dentro de **uma turma só, numa aula só**
ainda pesar (turma muito grande, fila muito rápida), a ideia seria
agrupar a escrita em disco por lote — N eventos **ou** T segundos, o que
vier primeiro, nunca deixando a fila crescer indefinidamente. Importante:
o evento já é gravado no IndexedDB individualmente e na hora
(`repositorio.acrescentarEvento`, `TelaAula.tsx:470`) — isso não faz parte
do que seria adiado. O que atrasaria é só o espelho em disco (a pasta
cofre) e a planilha derivada. Precisa de um indicador visível de
"sincronizando..." durante a janela, reaproveitando o contador `porSalvar`
que já existe pro caso sem pasta escolhida — nunca pode ficar silencioso.
**Isso muda uma garantia que o projeto decidiu proteger de propósito**
("gravação que falha em silêncio é o pior defeito possível", comentário em
`Fluxo.tsx`) — não deve ser feito sem conversa explícita com o autor, e só
depois de B-E, porque é bem possível que B-E sozinhos já sejam suficientes.

### H — `Fluxo.recontar()` computa casamento de grade que é irrelevante com a chamada já aberta

`recontar()` (`Fluxo.tsx:227`) sempre calcula `proximaAulaDeQualquer` e
`abrirSozinhoEntreProfessores` (`nucleo/grade.ts`) — o que decide "que
turma deveria estar em aula agora" e "próxima aula" pra tela de repouso.
Com `chamadaAberta` verdadeiro, `decidirRota` já foi direto pra `'chamada'`
(`rota.ts:90`) — nada desse cálculo aparece na tela, mas ele roda a cada
crachá do mesmo jeito. **Numericamente pequeno** — essas funções percorrem
`aulas` (a grade do professor, tipicamente dezenas de linhas, não
milhares), então o custo em si é baixo, mesmo em escala. Vale mais como
limpeza de desenho do que como otimização de número: `mudou()` poderia
pular a parte de grade/repouso de `recontar()` quando já existe sessão
aberta. Prioridade baixa — junto de B, quase de graça, mas não é o que
move o ponteiro.

### I — Referências novas a cada `recontar()` invalidam memoização em `TelaAula`

`Fluxo.recontar()` chama `setMatriculadosTodos`/`setPendentesDaTurma` com
**arrays novos** a cada crachá, mesmo quando o conteúdo é idêntico ao
anterior (ninguém entrou ou saiu da turma no meio da chamada). Como
`TelaAula` recebe isso como prop (`daTurma`, `pendentes`) e vários
`useMemo` (`alunosDaTurma`, `professoresDaTurma`, `ordemDaBusca`) dependem
dessas referências, toda a memoização é invalidada a cada crachá, mesmo
sem mudança real — React recalcula e potencialmente re-renderiza listas
que não precisavam mudar. **Também numericamente pequeno nesta escala**
(dezenas de itens, não milhares — reconciliação de React nesse tamanho é
da ordem de poucos milissegundos, não segundos). Correção possível:
`recontar()` só chama esses `setState` quando o conteúdo de fato mudou
(comparação rasa por tamanho + id, não deep-equal caro). Prioridade baixa,
mesmo motivo do item H.

### G — Isto não é auditoria exaustiva

B-D vieram de seguir o caminho quente (o que roda a cada crachá aceito) —
não de vasculhar todo arquivo do projeto. Há dezenas de outros lugares com
`.filter`/`.map`/`.find` (`nomes.ts`, `GradeDePresencas.tsx`, `csv.ts`
entre eles) que não foram auditados um a um, porque rodam só quando o
professor abre uma tela de propósito (Ver presenças, Diagnóstico, colar
turma) — custo pago uma vez, por escolha, não a cada crachá. Se algum
desses também tiver comportamento ruim de escala, o efeito é uma tela
lenta pra abrir, não uma presença perdida — categoria de problema
diferente, prioridade menor. Vale revisitar se algum professor relatar
lentidão ao abrir uma tela específica.

### Projeção combinada (17/09/2026)

Juntando os números medidos de D e B/E, e uma redução proporcional
estimada (não medida) pra C — metade da escrita em disco, já que passa a
tocar 1 turma em vez de 2 —, o custo por crachá no fim do semestre (30
aulas, 2 turmas, 3.960 eventos) projetado:

| | Hoje (medido) | Com B+C+D+E (projetado) |
|---|---|---|
| `planilhaDeFaltas` (D) | 1.305,72ms | ~2,3ms (medido) |
| Leitura de eventos (B, ×2 hoje → ×1) | ~22ms (2× 11ms) | ~4ms (medido, 1×) |
| Escrita em disco por turma (C, estimado) | 2 turmas | 1 turma (~metade, não medido) |
| **Total estimado** | **≈ 1.330ms+** | **≈ 10-15ms** |

Isso é uma ordem de grandeza (~100×) abaixo do limiar de 60ms que causou o
incidente de 15/09 — não "menos provável", estruturalmente fora do
alcance desse mecanismo específico, no porte de turma descrito (50+80,
60h). H e I não entram nessa conta porque o próprio benchmark já mostrou
que são pequenos demais pra mover o número nesta escala.

### Status (17/09/2026)

B, C, D, E: implementados, testados (suíte inteira + testes novos de
escopo/desempenho), `tsc --noEmit` limpo. **Não commitado** — fica para
revisão do autor. H e I ficaram de fora de propósito (o próprio
benchmark mostrou que são pequenos demais pra valer o risco). A segue
guardado, sem decisão. F segue fora, precisa de conversa antes.

**Antes de subir:** nenhum destes sobe no mesmo dia de uma aula real com o
professor — mesma regra que já valeu para não tocar em nada em
16-17/09/2026. Revisar o diff, rodar a suíte mais uma vez do zero, e só
então decidir o deploy.

---

**Fora deste plano, mas relevante:** o sistema já está em uso real por um
professor. Qualquer item acima que toque em `Vinculo`/`Matriculado`/`Sessao`
precisa rodar contra `RepositorioDexie`/`LeitorSimulado` de verdade (regra já
existente do projeto) antes de subir — item 3 em particular mexe em dado que
já existe na base real de alguém.
