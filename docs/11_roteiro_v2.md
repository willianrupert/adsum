# 11 — Roteiro da v2: o que se constrói antes do HTML

Documento vivo. É o passo a passo de execução da especificação
`08_lancar_no_sigaa.md`, na parte que **não depende do HTML da planilha do
docente** (portão A). Começou em 27/09/2026, na branch `v2/lancar-no-sigaa`,
que não vai ao ar: publicar continua preso ao congelamento do `CLAUDE.md` e
aos portões do `08`, §6.

## Andamento: 100% da fase 1, 100% da fase 2, 30% da fase 3

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
| 12 | Jornada sem página, sobre cofre com histórico | 8 | 6 | feito, 27/09 |

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
  Prof. Paulo se chamam. **Revisto no passo 23:** a turma sem código nenhum
  no nome é proposta, e o professor confirma; a com outro código continua
  fora.

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

Feita sobre o cofre de 22/09 (turma B, 59 alunos, com presença à mão e "Não
presente"), com o favorito e a folha conversando pela `PonteJanela` de
verdade e as origens conferidas nos dois sentidos. O que se escreveu na
planilha é a planilha de faltas da pasta, célula por célula; uma célula
mudada à mão vira diferença, o aceite a resolve, e a base refeita da pasta
continua conferindo. A jornada achou dois defeitos, consertados com teste:
a turma real tem o código no meio do nome, e o aviso de "nada a preencher"
não saía depois de um aceite.

## Fase 2: com a planilha real (desde 29/09/2026)

O portão A trouxe a planilha de CIN0114 e mudou três coisas no desenho
(`docs/08`, "O que a planilha real mudou"): a planilha salva sozinha a cada
5 minutos, o favorito lê os dados da página em vez de raspar a tabela, e o
máximo do dia não é fixo. A rota por dia ("Lançar Frequência") fica fora, por
decisão do autor em 29/09. A página, por dentro, está em `docs/12`. Mesma regra da fase 1: teste antes, peso por
passo, passo pela metade conta zero.

| # | Passo | Peso | Estado |
|---|---|---|---|
| 13 | Anonimizador da planilha: o modelo de dados vira fixture, sem nome, matrícula nem id real | 6 | feito, 29/09 |
| 14 | Leitura real: o bruto passa a ser `auxAulas` e `auxAlunos` | 12 | feito, 29/09 |
| 15 | Localizador: escrever o texto da célula, como a coleta do SIGAA lê | 10 | feito, 29/09 |
| 16 | Regras da página: data futura, período letivo, bloqueios, dia parcial, máximo fora do comum | 10 | feito, 29/09 |
| 17 | Salvamento automático (opção A, 29/09): a folha avisa, o Desfazer vale até a primeira coleta | 12 | feito, 29/09 |
| 18 | Bancada local: a página anonimizada com os scripts, e um servidor que registra o que o Gravar e o salvamento enviariam | 16 | feito, 29/09 |
| 19 | Jornada sobre a fixture real | 10 | feito, 29/09 |
| 20 | Portão B: as leis sobre a fixture real | 8 | feito, 29/09 |
| 21 | Segunda turma e planilha depois do Gravar (captura e mensagem de sucesso) | — | fora, 29/09: sem captura |
| 22 | Ensaio na bancada | 8 | feito, 29/09 |

### 14 · Leitura real

O bruto é o que a página guarda: a legenda, o período letivo, `auxAulas`,
`auxAlunos` e o texto atual de cada célula (o professor pode ter clicado
antes do favorito). Os bloqueios seguem a precedência da própria página
(marca da aula, depois do aluno, depois a data), e ganharam quatro motivos
que a planilha real trouxe: suspensa, bloqueado, futura e fora do período.
Testada sobre a fixture de CIN0114, com os números do `docs/12`, e na ida e
volta dos 300 cenários.

Decidido aqui: **o favorito confere o plano com a mesma leitura e o mesmo
validador do Adsum** (`conferirContraBruto` = `lerPlanilha` + `validarPlano`).
Com a leitura pequena, a validação duplicada do passo 11 deixa de valer o
risco de as duas divergirem. A data de "agora" é parâmetro da leitura, da
folha e do favorito: sem ela, testes com datas de outubro quebrariam hoje e
voltariam a passar em novembro. E a folha usa um relógio fora do componente:
uma função nova a cada desenho refazia a ligação com a planilha, em laço
(achado aqui, com teste).

### 15 · Localizador

`favorito/localizadorSigaa.ts` reconhece a planilha (tabela `#planilha` e
campo `form:frequencias`), tira legenda, período e as duas strings do texto
dos scripts da página (o estado que veio do servidor) e o texto atual de cada
célula, e acha a célula pela linha e pela coluna na ordem da página. Escreve
o número como texto, que é o que a coleta lê, e pede à página que refaça os
totais da linha, como o clique faria. Célula aberta em edição pelo professor
nunca é vazia para o favorito. A prova é em jsdom, sobre a página montada
com a estrutura do `docs/12` e uma coleta reescrita pela descrição: depois de
escrever, só o registro certo muda. A prova com o script verdadeiro é a
bancada (passo 18).

O favorito dobrou (~16 KB), por levar leitura, validador e localizador; o
teto do teste foi a 32 KB. A jornada ganhou esperas de 5 s e desmonta a folha
antes de fechar a base: no fim da suíte longa (que roda em série), falhou uma
vez por tempo e deixou um `DatabaseClosedError` solto.

### 16 · Regras da página

A leitura já bloqueava como a página (passo 14); aqui a conciliação e a folha
passam a **dizer** cada caso, pela regra do professor de avisar o que não foi
mexido e por quê: aula suspensa e chamada fora do período letivo viram "sem
onde lançar", aluno bloqueado entra na linha do que fica de fora, e o dia com
mais aulas que o comum da planilha avisa no cartão quanto a falta vale ("Dia
de 12 aulas: quem faltou leva 12 faltas."), antes do Preencher. O dia
parcial não pede regra nova: quem está na página sem par no Adsum já fica
vazio e dito.

### 17 · Salvamento automático (opção A)

Os textos deixaram de prometer o que a planilha real não cumpre: a folha diz
"Ao preencher, o SIGAA salva sozinho em até 5 minutos.", e a barra, "O SIGAA
salva sozinho em até 5 minutos, ou agora, em Gravar Frequências." O Desfazer
vale até a página coletar os valores: o favorito guarda o `form:frequencias`
depois de escrever e o vigia a cada segundo; quando muda, a barra troca o
Desfazer por "O SIGAA já salvou o preenchimento. Para mudar uma célula,
clique nela, como sempre." O próprio clique em Desfazer confere de novo, para
não dizer "Desfeito" em vão se a coleta passou um instante antes.

### 18 · Bancada local

A planilha real, anonimizada, rodando com os scripts do próprio SIGAA, sem
nenhuma requisição à UFPE:

- `scripts/anonimizar_sigaa.py … --pagina PAGINA.html` troca nomes,
  matrículas e ids na página inteira, inclusive nas classes `aluno_<id>` das
  células (a primeira versão deixava esses ids: a conferência independente
  pegou, e a fronteira de palavra deixou de tratar `_` como letra). A página
  fica fora do repositório.
- `scripts/bancada_sigaa.mjs PASTA` serve a página com os endereços da UFPE
  reescritos para ela mesma, um botão "Favorito (ensaio)" que carrega o
  favorito gerado com destino local, e responde ao Gravar e ao salvamento
  automático registrando o que chegaria no `form:frequencias`
  (`/bancada/registros`). Serve também a mesma turma para o Adsum
  (`/bancada/cenario.json`).
- No app, só em desenvolvimento, `?bancada` faz a janela do Adsum aceitar a
  origem da bancada e usar uma base própria semeada com esse cenário. O
  pacote publicado não leva nada disso (conferido: zero ocorrências), e o
  favorito publicado nunca aponta para `localhost` (teste).

**Provado com o script verdadeiro do SIGAA** (29/09): o nosso localizador
extrai as 45 linhas da página real; escreve `2` numa célula vazia; a coleta
da própria página (`atualizarFrequencias`, a do Gravar e do salvamento) põe
`2` no registro certo; o marco de coleta muda; a página refaz o total da
linha; e o Gravar envia exatamente essa mudança e nenhuma outra ("aluno
900008, 29/09: null → 2"), que volta gravada ao recarregar.

**Não provado aqui:** as duas janelas conversando. O navegador embutido não
abre janela nova (o `window.open` navega a própria aba). Isso fica para o
Chrome, no ensaio (passo 22):

```
python3 scripts/anonimizar_sigaa.py PLANILHA_SALVA.html /tmp/x.json --pagina PASTA/planilha.html
cp -R "PASTA_DOS_ARQUIVOS_DA_PAGINA" PASTA/
node scripts/bancada_sigaa.mjs PASTA
npm run dev
```

e abrir http://localhost:8080 no Chrome e clicar em "Favorito (ensaio)".

### 19 · Jornada sobre a planilha real

`ui/sigaa/JornadaReal.test.tsx`: a página de CIN0114 com a estrutura do
`docs/12`, o localizador de verdade, o favorito e a folha por mensagens, e o
Adsum com a mesma turma (`testes/cenarioDaBancada.ts`, que a bancada também
usa). Conferir dá 3 aulas para lançar; preencher muda 135 células (45 × 3), só
nelas; gravado, o favorito de novo dá "Tudo confere" em 15 aulas.

**A planilha real mostrou um erro de desenho**, consertado com teste antes:
nas aulas já lançadas, quem entrou na turma depois ficou vazio, sem a marca de
"matriculado depois", e o Adsum, que não sabe quando cada aluno entrou,
proporia 2 faltas a cada um (60 faltas erradas). Regra nova, na linha da do
professor: **aula já lançada no SIGAA é do professor, e o Adsum não acrescenta
nela.** As vazias dali ficam como estão e são ditas ("60 vazias em aulas já
lançadas ficam de fora"); o que está lançado continua conferido.

**Correção ao passo 15:** a instabilidade da jornada não era carga. A folha
fecha depois de gravar a auditoria, e o teste conferia "fechou" logo que a
barra do favorito aparecia, às vezes antes. Medido: 7 de 10 rodadas passavam;
com o teste esperando o fechamento, 20 de 20.

### 20 · Portão B

`nucleo/lancar/leisReais.test.ts`: as leis sobre a planilha real de CIN0114,
em 200 variações do que a vida faz com ela (o dia do clique, as presenças do
Adsum nas aulas não lançadas, o professor mexendo em células antes, ajustes, e
dias em que a chamada foi no papel e o Adsum não tem). Mais a lei 8, da regra
nova: nada "a lançar" em aula já lançada. O plano passa no validador do Adsum e
no do favorito sobre o mesmo bruto. Uma mutação sobreviveu na primeira versão
(ausência valendo sempre 2): a lei da faixa passou a exigir o máximo daquele
dia, e a conferir que os dias de 4 e de 12 aulas aparecem.

### 22 · Ensaio na bancada

**Primeiro achado, 29/09:** no Chrome, o favorito disse "O plano do Adsum não
confere com esta página". A planilha carrega Prototype 1.6 e Ext, que trocam
`entries`, `Array.from`, `reduce` e dezenas de outros nativos (`docs/12`); a
leitura usava `entries()` e desmontava cada aluno. O jsdom não carrega essas
bibliotecas, e nenhum dos testes via isso. Conserto: o favorito roda num
iframe vazio, com os nativos do navegador, e só toca a página pelo DOM; a
mensagem do Adsum é copiada para dentro dele. Teste:
`favorito/ambienteLimpo.test.ts`, o favorito montado numa página com as
trocas medidas; sem o iframe, ele falha.

**Segundo achado, no mesmo ensaio:** com o favorito no iframe, a janela do
Adsum dizia "A planilha não respondeu". O navegador dá como remetente de um
`postMessage` a janela de quem o chama, que passou a ser o iframe, e o Adsum
só aceita a janela que o abriu. O carregador agora deixa no iframe uma função
de envio criada na página, e a leitura sai por ela. O jsdom não preenche o
remetente das mensagens; o teste confere que a função é da página, e o
Chrome conferiu o resto.

**O ensaio, 29/09, no Chrome, sobre a planilha real com os scripts do SIGAA:**
a janela disse "3 aulas para lançar" (01/09, 03/09, 29/09) e "60 vazias em
aulas já lançadas ficam de fora"; Preencher escreveu 135 células (107
presentes, 28 faltas, os números da janela); Desfazer esvaziou as 135;
preenchido de novo, o Gravar enviou exatamente 135 mudanças, de vazio para 0
ou 2, só nessas três aulas; o favorito de novo disse "Tudo confere, SIGAA e
Adsum iguais em 15 aulas". Não se esperou os 5 minutos do salvamento
automático: ele chama a mesma coleta do Gravar (`docs/12`).

Também do ensaio: com o Chrome em tela cheia no Mac, a janela do Adsum abre
como aba. Funciona igual, sem a vista lado a lado; a página não tem como
mudar isso.

### 21 · Fora da conta

Decidido pelo autor em 29/09: não haverá captura da segunda turma nem da
planilha depois do Gravar. O passo sai da conta (84 de 92 pesos, 91%), e o
que ele cobriria fica dito:

- **Trancado, matriculado depois, bloqueado e aula cancelada** não aparecem
  em CIN0114. Continuam cobertos só pelos cenários inventados, na forma que
  o script da página descreve (`docs/12`). O risco é a página marcar esses
  casos de um jeito que o script não mostra.
- **A mensagem depois do Gravar** não é lida pelo Adsum: a conferência é
  clicar no favorito de novo, sobre a página que o servidor devolve. O que se
  perde é só saber como a página diz sucesso ou erro, para a folha poder
  citar as mesmas palavras.

## Fase 3: o caminho do professor, sem atrito (desde 29/09/2026)

Pedida pelo autor depois do ensaio: o caminho ideal, com menos etapas e
confiabilidade máxima. Avaliado e **decidido pelo autor em 29/09: a decisão
continua na janela do Adsum**. A folha sobre a planilha, com o Adsum só
buscando os dados e fechando, foi descartada: depois da decisão a janela
ainda grava na base (a auditoria do preenchimento e o "Aceitar o SIGAA"), e
a página do SIGAA não alcança essa base. Fechar antes obrigaria a auditoria
a registrar o proposto em vez do feito, ou uma segunda janela relâmpago.

Em janela, o Adsum fica ao lado da planilha. Em tela cheia no Mac, o Chrome
abre a janela como aba, e a página não tem como mudar isso: a folha vira uma
tela pensada para o tamanho, e ao Preencher fecha e devolve a planilha.

| # | Passo | Peso | Estado |
|---|---|---|---|
| 23 | Escolha da turma: entre duas, o professor escolhe; sem o código no nome, as matrículas propõem a turma e ele confirma | 15 | feito, 29/09 |
| 24 | A folha nos dois tamanhos: ao lado da planilha e em tela cheia | 15 | feito, 29/09 |
| 25 | A barra na planilha no padrão do Adsum, clara e escura | 10 |  |
| 26 | O favorito chega ao professor: gerado no build e oferecido em Ajustes, com o gesto de arrastar | 20 |  |
| 27 | Histórico em Ajustes: o que foi lançado, quando, em cada turma | 10 |  |
| 28 | Ensaio no Chrome, em janela e em tela cheia | 20 |  |
| 29 | Esboço (`docs/09`), vitrine e documentos | 10 |  |

### 23 · Escolha da turma

Antes, a folha recusava em dois casos que o professor resolve num toque:
duas turmas que servem (uma cadastrada duas vezes), e a turma sem o código
da disciplina no nome ("Programação, manhã"). Agora a folha pergunta:

- **Duas servem:** "Qual é a turma desta planilha?", uma linha por turma.
- **Sem o código no nome, mas com as matrículas:** "Esta planilha é de
  CIN0144", com "Usar Programação" e "Não é esta". A matrícula sozinha não
  decide, porque a mesma gente cursa outras disciplinas: decide o professor,
  uma vez. O Adsum lembra (preferência deste computador,
  `turmasConfirmadas`) e não pergunta de novo.
- **Turma com outro código** continua fora: é outra disciplina.

Com isso, o nome da turma deixa de ser requisito. Quatro mutações da regra,
as quatro derrubadas.

### 24 · A folha nos dois tamanhos

Na janela de 420 × 640 ao lado da planilha, nada muda: a folha começa no
alto. De 700 × 760 para cima (a aba da tela cheia), ela vira uma tela de
decisão: centrada na vertical, título e apoio centrados, o ícone do Adsum no
alto dizendo onde a pessoa está. Só CSS (`estilo.css`, fim do bloco da
folha); `safe center` não corta o alto quando a folha é maior que a tela.
Visto no Chrome, na bancada; o endereço do ícone ganha o `/adsum/` no build.

## Fora das fases

- A rota por dia ("Lançar Frequência"): fora por decisão do autor (29/09).
  Desenho em `docs/08`, se voltar.
- Os portões C a E do `08`: uso real, primeiro preenchimento, outros
  professores.
