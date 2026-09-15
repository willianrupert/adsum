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

---

**Fora deste plano, mas relevante:** o sistema já está em uso real por um
professor. Qualquer item acima que toque em `Vinculo`/`Matriculado`/`Sessao`
precisa rodar contra `RepositorioDexie`/`LeitorSimulado` de verdade (regra já
existente do projeto) antes de subir — item 3 em particular mexe em dado que
já existe na base real de alguém.
