# 08 — Lançar no SIGAA

Especificação da v2, do micro ao macro. Não implementado. Pedido do Prof.
Paulo em 24/09/2026, no dia da primeira aula limpa: "agora é fazer a v2 para
migrar direto para o SIGAA". Funcionalidade nova: espera as quatro semanas
limpas do `CLAUDE.md`, e cada camada abaixo só começa com a de baixo
provada.

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
| Célula vazia é distinguível de célula `0`? | HTML do docente | **falta** |
| Célula é `<input>`? Ligada à matrícula por `name` ou pela linha? | HTML do docente | **falta** |
| Onde está o máximo de faltas de cada dia? | HTML do docente | **falta** |
| Como a página marca lançado / cancelado / feriado / trancado / matriculado depois | HTML do docente | **falta** |
| Mudar a célula dispara evento de que o Gravar depende? | HTML do docente | **falta** |
| O Gravar envia só o que mudou ou tudo? O que faz com vazia? | HTML antes e depois | **falta** |
| Mensagem de sucesso e de erro do Gravar | HTML depois | **falta** |
| O SIGAA manda `Cross-Origin-Opener-Policy`? | cabeçalhos da resposta | **falta** |

Tudo o que está como **falta** vem de uma coisa só: a planilha do docente,
salva antes e depois de um Gravar, com os cabeçalhos. Ver §6.

## 3. Princípios que não se negociam

**Segurança** ([PoSIC da UFPE][ps], 2016/2017, vigente):

- **Art. 22** — senha é "equivalente à assinatura", "intransferível". A
  ferramenta **nunca vê, digita, guarda nem pede senha**. Não faz login, não
  mantém sessão: usa a página que o professor já abriu.
- **Art. 54, II** — o usuário responde pelos efeitos de todo acesso com a sua
  identificação. **O Gravar é sempre um clique do professor**, depois de ver
  o que mudou. A ferramenta nunca clica em botão do SIGAA.
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

### 5 · Favorito

Pequeno, gerado no build a partir de `src/favorito/`, testado em jsdom
contra a fixture. Faz quatro coisas e nenhuma outra:

1. **Ler** a página crua.
2. **Abrir** a janela do Adsum e mandar a leitura.
3. **Aplicar** o plano com *comparar e trocar*: cada célula só é escrita se
   ainda estiver como na leitura (`antes`). Se o professor mexeu nela no
   meio tempo, fica como ele deixou, e a barra diz quantas foram puladas.
4. **Pintar e desfazer:** azul no que mudou, amarelo nas diferenças
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

## 5. A experiência

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
- *Há o que lançar* — diferenças primeiro, num cartão amarelo: nome, dia, os
  dois valores, "o SIGAA fica como está", e **Aceitar o SIGAA** em cada uma.
  Depois um cartão por aula (dia, presentes, faltas), todos marcados;
  desmarcar deixa o dia de fora. Informativos recolhidos numa linha. Ação:
  **Preencher 3 aulas**; ao lado, Só conferir.
- *Recusa* — página que não é a planilha, turma que não casa, favorito
  antigo, base vazia neste navegador. Uma frase do que houve e do que fazer.

**Preencher fecha a janela.** Ela vive o tempo de uma decisão. Nenhuma página
consegue ficar sempre por cima; por isso ela não precisa. Se sumir atrás do
Chrome antes disso, o favorito de novo a traz de volta, no mesmo estado.

**De volta à planilha.** Azul no que mudou, amarelo nas diferenças, barra de
uma linha no pé que reserva o próprio espaço e recolhe para uma pílula:
"Adsum preencheu 3 aulas. Azul é o que mudou. Confira e clique em Gravar
Frequências." e **Desfazer**. O mouse sobre uma célula azul diz "Adsum:
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

**A · HTML do docente** (Paulo salva a planilha antes e depois de um Gravar,
com os cabeçalhos; fora do repositório).
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

## 7. O que já se tentou, e as rotas descartadas

- **[auto-sigaa][fc]** (Prof. Filipe Calegario, UFPE, 2023): notas, Selenium,
  professor loga e navega, script preenche, não salva. Casa por
  `contains(text(), nome)` e segue calado quando não acha.
- **[notinhas][nt]** (SIGEduc da Bahia): Playwright, frequência em lote.
  Sofreu com a navegação do JSF; casa por nome fonético; **digita a senha**.
- **[SIGAAutils][su]** (IFC), **[sigaa-horarios-extension][sh]** (UFBA):
  extensões; login automático, e leitura do código de horário.

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
   ratificação.

O perfil que lança frequência é o de docente. O pedido tem de sair do
professor, ou com ele.

[m1]: https://manuaisdesistemas.ufpe.br/index.php/Lan%C3%A7ar_Frequ%C3%AAncia
[m2]: https://manuaisdesistemas.ufpe.br/index.php/Lan%C3%A7ar_Frequencia_em_Planilha
[fc]: https://github.com/filipecalegario/auto-sigaa
[nt]: https://github.com/devmagary/notinhas
[su]: https://github.com/zebedelu/SIGAAutils
[sh]: https://github.com/ernestosrf/sigaa-horarios-extension
[ps]: https://www.ufpe.br/documents/38982/806616/PoSIC+-+Vers%C3%A3o+para+o+Portal.pdf/2cc2ed7b-0cfa-4c1e-9a59-59084c6ba691
