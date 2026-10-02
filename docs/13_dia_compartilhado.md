# Aula com mais de um professor

> As seções 1 a 4 descrevem a regra que está na branch `v2/dia-compartilhado`
> desde 02/10/2026, e ainda não foi ao ar. Da seção 5 em diante são **ideias
> guardadas**, nenhuma decidida: somar sobre o número do outro professor,
> com chave por aula, livro-razão por computador e compare-and-set na
> página. Ficaram para quando a regra simples incomodar.

## 1. O caso

Na quinta, CIN0144 (Aprendizado de Máquina e Ciência de Dados) tem dois
blocos: das 8h às 10h com o Prof. Ricardo Prudêncio, e das 10h às 12h com o
Prof. Paulo Freitas. No SIGAA é **uma coluna só**, com máximo 4. O Ricardo
lança as faltas do bloco dele: 0 para quem veio, 2 para quem faltou. Duas
horas depois o Paulo abre a mesma planilha e **acrescenta** as dele. Quem veio
aos dois blocos fica com 0. Quem veio só ao do Ricardo passa de 0 a 2. Quem
faltou aos dois passa de 2 a 4.

A soma é feita à mão, sobre o número que o outro professor deixou. Se o
Ricardo também usar o Adsum, a ordem pode ser qualquer uma, e os dois
computadores nunca conversam.

## 2. O defeito

A conciliação punha 0 para quem esteve e **o máximo da coluna** para quem
faltou. Na quinta do Paulo, quem faltou ao bloco dele levava 4, e não 2. Se o
Ricardo lançasse antes, o Adsum não escrevia nada (a aula já lançada é do
professor, `docs/08`, §2) e mostrava como diferença cada célula em que o
número dele não batia com o do Ricardo.

## 3. A regra: o professor escolhe quanto vale a falta

Só o professor sabe se a chamada foi da aula inteira ou só do bloco dele.
Por isso o Adsum não deduz: em cada aula a lançar, a folha mostra quanto vale
a falta, e o professor muda com − e +, de 1 até o máximo da coluna.

- **O valor inicial** é o que o Adsum lançou naquela aula; sem isso, o da
  última aula do mesmo dia da semana que ele lançou; sem nenhuma, o máximo
  da coluna, como sempre foi. A primeira quinta pede o ajuste para 2; as
  seguintes já vêm com 2. A memória é a auditoria da pasta, que já guarda o
  valor escrito em cada célula: nada novo é gravado.
- **O seletor aparece onde importa:** na aula com mais aulas que o comum da
  planilha (a quinta de 4, o dia especial de 12), ou onde o valor já não é
  o máximo. Na terça comum de 2 aulas, a folha não muda.
- **A conferência depois** compara a aula lançada com o valor escolhido, e
  não com o máximo: a quinta lançada com 2 não vira diferença na semana
  seguinte.
- **A coluna já lançada por outra pessoa** continua como toda aula lançada:
  o Adsum não escreve nela, e mostra as diferenças. Em aula com dois
  professores, quem lança depois soma a sua parte à mão.

A grade não entra na conta. Ela não tem data de vigência: mudar a grade no
meio do semestre mudaria o passado. E não diz se há outro professor no dia.

## 4. O que fica em aberto

- **A planilha de faltas da pasta** (`faltas/<turma>.csv`) ainda conta a
  falta pela grade atual (`periodosDoBloco`), e é recalculada do zero: uma
  grade mudada no semestre muda os dias antigos, e o número pode não bater
  com o escolhido no SIGAA. Juntar as duas contas é o próximo passo natural.
- **Se o outro professor lançar antes**, as diferenças da quinta aparecem na
  folha do Paulo. Nada é escrito, mas o aviso aparece. Se incomodar, o
  cartão "lance à mão", com uma pergunta ao professor, é a primeira ideia
  guardada a voltar.

## 5. Um sistema distribuído sem rede

Cada computador com o Adsum é um **nó**. Os nós não têm canal entre si: não
há servidor, e a pasta de cada professor é só dele. O único estado
compartilhado é a célula do SIGAA, e ela guarda **um inteiro**: a soma das
partes, sem dizer de quem é cada uma. Um professor sem Adsum, lançando à mão,
é mais um escritor nessa célula.

Disso sai o princípio do desenho: **nenhum nó tenta decompor o número.** Cada
um guarda a própria parte no seu livro-razão, a auditoria da pasta
(`sigaa/<turma>.csv`), que já registra, para cada célula preenchida, o valor
lido e o valor aplicado. Um nó sabe do outro de uma forma só: o número da
célula mudou depois que ele escreveu.

## 6. O modelo

### A parte de cada nó

A **parte** de cada professor é quanto vale a falta no bloco dele: o número
que ele escolhe na folha (§3). A primeira versão desta ideia tirava a parte
da grade, e foi descartada: a grade não tem data de vigência, não diz se há
outro professor, e transformaria em "compartilhado" o dia especial de 12
aulas de um professor só.

### O livro-razão

Para cada (dia, matrícula), o nó tem no máximo **uma soma**: a linha de
`preenchimento` da auditoria, com `lido` (o número que estava lá) e
`aplicado` (o que o Adsum escreveu). É o "quantas vezes o Adsum inseriu"
daquela célula, e a resposta só pode ser zero ou uma.

Uma soma passa por três estados:

- **preenchida**: escrita na página, ainda não recolhida pelo SIGAA;
- **confirmada**: o SIGAA recolheu (o favorito vê o campo `form:frequencias`
  mudar, como no Desfazer) ou uma leitura depois mostrou `aplicado` na célula;
- **não chegou**: a página foi fechada antes de o SIGAA recolher, e a
  leitura seguinte mostra de novo o `lido`.

### A chave do dia

Somar sobre o número de outro professor exige uma **chave**, ligada pelo
professor para aquela turma naquele dia, na folha. Ela fica desligada por
padrão, e a folha só a oferece quando o dia é compartilhado e a coluna já tem
números. Fica guardada como o remanejo: uma decisão datada, só acrescentada,
e a mais nova vale. Desligar depois de somar não desfaz nada: só impede somas
novas.

### O que cada célula vira

Para uma célula de dia compartilhado, com parte *p* e máximo *M*. *V* é o
número na página. *L* e *A* são o lido e o aplicado do livro-razão, quando há
soma.

| Página | Livro-razão | Chave | Categoria | Escreve |
|---|---|---|---|---|
| vazia, coluna sem números | — | — | a lançar | 0 ou *p* (como hoje, com *p* no lugar de *M*) |
| vazia, coluna com números | — | — | fora (entrou depois na turma) | nada |
| *V* | sem soma | desligada | **de outro professor** | nada |
| *V* | sem soma | ligada, presente | confere | nada |
| *V* | sem soma | ligada, ausente, *V*+*p* ≤ *M* | **a somar** | *V*+*p*, só se a célula ainda mostrar *V* |
| *V* | sem soma | ligada, ausente, *V*+*p* > *M* | **passa do máximo** | nada |
| *V* = *A* | confirmada | — | **somada** | nada |
| *V* > *A* | confirmada | — | **somada, e outro somou *V*−*A*** | nada |
| *V* < *A* | confirmada | — | **mudou depois** | nada |
| *V* = *L* | não confirmada | ligada | **não chegou**: a somar de novo | *L*+*p* |

"Mudou depois" quer dizer que alguém tirou faltas depois da soma: uma
correção, ou uma gravação concorrente (§8). O Adsum não sabe qual das duas, e
por isso só avisa, com os três números: o que leu, o que somou e o que está
lá agora.

## 7. A escrita: compare-and-set na página

Hoje toda instrução leva `antes: 'vazia'`, e o favorito recusa escrever em
célula que não esteja vazia (`validarPlano`, e o próprio favorito na página).
A soma ganha uma instrução com `antes` numérico: **escreva `valor` só se a
célula ainda mostrar `antes`**. Se o outro professor gravou entre a leitura e
o Preencher, a célula não mostra mais `antes`, a instrução é recusada, e a
folha pede para ler de novo. É a mesma ideia do `antes: 'vazia'`, estendida
ao número.

E duas travas novas, conferidas no validador do Adsum e no do favorito:

- **nunca diminui**: `valor` ≥ `antes`;
- **nunca passa do máximo**: `valor` ≤ *M*.

Compatibilidade: o favorito de hoje (`VERSAO_DO_FAVORITO = 1`) recusa
`antes` numérico como formato desconhecido, e o plano inteiro cai. É o lado
seguro. O Adsum, que recebe a versão do favorito em toda leitura, pede para
arrastar o favorito novo antes de oferecer a chave.

## 8. Concorrência: o que se detecta e o que não

O SIGAA guarda o que a página manda, e a página manda o que tem: se duas
abas estão abertas na mesma planilha, a que grava por último vale para as
células que ela envia. O salvamento automático a cada 5 minutos faz isso sem
ninguém clicar. A página manda **a grade inteira**, não só o que mudou
(`docs/12`, "Como o Gravar coleta"). Falta medir se o servidor regrava todas
as células enviadas ou só as que mudaram (§12). O pior caso supõe a primeira
opção: uma aba do Ricardo aberta desde antes de o Paulo lançar, gravando
depois, devolve os números antigos.

O que cada nó percebe, com o Ricardo sobrescrevendo a soma do Paulo a partir
de uma aba antiga:

| O aluno faltou ao bloco de | O que fica na célula | Quem percebe, e quando |
|---|---|---|
| só Paulo | 0 (a soma do Paulo some) | o Paulo, na próxima leitura: *V* < *A* |
| só Ricardo | 2 | ninguém precisa: o total está certo |
| os dois | 2, quando deveria ser 4 | **ninguém**: para os dois, *V* é igual ao que escreveram |

O terceiro caso é invisível pelo número: o que se perdeu tem exatamente o
tamanho do que ficou. Nenhuma regra que olhe só a célula o pega. O que dá
para fazer é **estreitar a janela**:

1. o favorito sabe quando a página foi carregada, e com a chave ligada pede
   para recarregar antes de preencher se ela tiver mais de alguns minutos;
2. o compare-and-set (§7) recusa escrever sobre um número que mudou entre a
   leitura e o Preencher;
3. depois do Gravar, a próxima leitura confere *V* contra *A*. Assim todo
   desaparecimento visível aparece na primeira oportunidade, para quem somou.

## 9. Correção depois de somar

O Paulo somou 2 e depois descobre que o aluno estava presente. Desfazer a
soma é tirar 2: modificar o que está no SIGAA. Pendente (§11, D2).

## 10. Leis novas

Somam-se às leis de `docs/08`, §4, e são testadas em massa, com entradas
geradas:

- **Nunca toca lançado sem a chave.** Com ela, só soma a própria parte.
- **Nunca diminui.** Nenhuma instrução escreve menos que o número lido.
- **Uma vez por nó.** Com a soma no livro-razão, conciliar de novo dá zero
  instruções, qualquer que seja o número na página.
- **A ordem não importa.** Dois nós com partes disjuntas, sem gravação
  concorrente, terminam com a soma das partes, em qualquer ordem, com ou sem
  um terceiro lançando à mão antes.
- **Teto.** Nada passa do máximo, e quando passaria nada é escrito, e o caso
  é dito.

A lei 4 (faixa) muda em um ponto: num dia compartilhado, ausente vale a
parte, não o máximo.

## 11. Decisões pendentes

- **D1 (Paulo).** "O Adsum nunca modifica o que está no SIGAA, apenas
  acrescenta" cobre somar faltas sobre o número de outro professor, com a
  chave ligada? O exemplo do Ricardo é o caso para levar a ele.
- **D2 (Paulo).** Correção depois de somar: o Adsum só avisa e o professor
  corrige à mão, ou pode tirar o que ele mesmo somou, e nada além disso?
- **D3 (autor).** A chave vale para um dia, ou para o dia da semana da turma
  ("toda quinta é compartilhada")? A proposta é por dia, com a folha
  lembrando que na semana anterior estava ligada.
- **D4 (autor).** A parte vem da grade sem perguntar, mostrada na folha, ou
  o professor confirma na primeira vez?

## 12. O que medir na bancada

- O Gravar e o salvamento automático mandam a coluna inteira ou só as
  células que mudaram? E o servidor regrava o que veio igual?
- Uma aba aberta antes de outra gravar, e deixada aberta, sobrescreve no
  próximo salvamento automático?
