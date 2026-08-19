# 03 — Desenho visual

Não implementado. Requisitos e raciocínio, para a passada dedicada.

## A restrição que manda em tudo: alto fluxo

Quando a fila pega o ritmo, **é um crachá a cada 1 ou 2 segundos**. Esse número
elimina sozinho a maior parte das ideias boas em telas paradas:

- **Nada de pop-up que precise sair.** Um cartão de confirmação de 2 s é
  interrompido pelo próximo antes de terminar — ou trunca, e o aluno não viu,
  ou enfileira, e a tela fica atrasada em relação à fila. Sem transição de
  entrada e saída, o problema não existe.
- **Nada que se mova muito.** Movimento a cada 1,5 s por cinquenta vezes vira
  ruído visual e cansa. Uma entrada curta (150–200 ms) na linha nova, e nada
  mais.
- **O som não pode empilhar nem cansar.** Ver a seção de som abaixo.

**O que a Apple faz nesse caso** é não celebrar cada evento. O feedback é
pequeno, imediato e igual toda vez — a lista cresce, o número muda. Comemoração
por leitura é desenho de aplicativo de banco, não de fila.

**Tentado e descartado:** o nome ocupando por um instante o lugar do contador.
Funcionava tecnicamente e ainda assim estava errado — **celebrar cada leitura
cansa depois da quinta**, e com um crachá a cada 1,5 s vira ruído. É o que a
Apple não faz.

**Como ficou:** o contador não se mexe além de subir, e o feedback é a linha
que chega no topo da lista. Calmo aguenta a aula inteira; festivo não.

## Feito na passada de 18/08/2026

Tipografia do sistema (`-apple-system`), hierarquia por tamanho e peso, e
agrupamento por espaço — as bordas de 1px que faziam tudo parecer painel de
controle saíram. Claro e escuro seguindo o sistema, com o verde mudando entre
os dois: o `#5DCAA5` do escuro não tem contraste sobre branco.

Cartões de estado no topo da folha da base — ícone à esquerda, uma linha
principal e uma de apoio, para ler de relance em vez de somar números.

Corte de texto: as legendas dos painéis passaram de explicação de projeto para
uma frase — "Quais crachás são de quem", "O que a planilha consome". O que
saiu era documentação, e documentação mora aqui.

Falta: a mesma dieta na tela de diagnóstico, e um passe de revisão nas telas com
a régua "isto ajuda quem quer fazer a chamada?".

## Valores medidos em apple.com

Não são aproximações de memória — foram lidos dos elementos da página.

| | Valor |
|---|---|
| Texto | `#1d1d1f` · secundário `#6e6e73` · terciário `#86868b` |
| Fundo | `#ffffff` e `#f5f5f7` |
| Ação | `#0071e3` no claro, `#2997ff` no escuro |
| Botão | pílula de `980px`, **peso 400**, `8px 16px` |
| Corpo | 17px, entrelinha 1,47, tracking −0,374px |
| Título | 21/28px, peso 600, tracking −0,019em |

Três regras que vêm junto e mudam mais que a paleta:

1. **Seção se separa por tom, não por sombra.** Nenhum `box-shadow` no app.
2. **Conteúdo se separa por espaço, não por borda de 1px.**
3. **Campo de texto não usa monoespaçada.** Só hash e caminho de arquivo, onde o
   alinhamento por caractere é a razão de ela existir.

**Um botão preenchido por tela, e é a ação pela qual a tela existe.** Todo o
resto é botão de texto azul; destrutivo é texto vermelho. Dois preenchidos na
mesma tela competem, e a resposta para "qual eu clico?" deixa de ser óbvia. Em
folha de ajustes não há nenhum: ajuste não é tarefa.

**Diagnóstico e base ficam atrás de uma engrenagem.** São ferramentas de quem
conserta, não de quem dá aula — e uma delas troca o sal, que desfaz todos os
vínculos. O que fica visível no rodapé é um aviso, e só quando há o que avisar.

**O que não tem volta pede um clique a mais.** O sal mora atrás de "Avançado", e
o botão diz quantos crachás serão desfeitos antes de perguntar.

E duas de forma: **rótulo de interface começa com maiúscula** ("Encostar próximo
crachá", não "encostar"), e **poucas opções exclusivas viram controle
segmentado**, não uma lista de botões.

## Símbolos

Redesenhados na gramática do SF Symbols — traço de peso uniforme, pontas
arredondadas, forma resolvida em grade quadrada — e não copiados dos arquivos da
Apple, que não podem ser redistribuídos. Ficam em `ui/componentes/Simbolos.tsx`.

O cadeado aparece no aviso de que os dados só existem no navegador. Ele diz a
metade boa da frase — **nada sai daqui** — enquanto o texto diz a metade que
cobra ação.

**Aviso não é botão.** Com a engrenagem a oito pixels dele, dois caminhos para o
mesmo lugar só fazem duvidar de qual é o certo: o aviso informa, a engrenagem
abre.

### As ondas de aproximação

Medidas no símbolo de referência, não estimadas: o PNG foi decodificado, os
quatro arcos separados por componente conexa e ajustados a um centro comum por
mínimos quadrados.

| Arco | Raio | Abertura |
|---|---|---|
| 1 | 58,7 px | 90,5° |
| 2 | 102,9 px | 75,7° |
| 3 | 149,6 px | 69,6° |
| 4 | 196,3 px | 66,6° |

Traço de 20,2 px, igual nos quatro.

**A abertura diminui conforme o raio cresce** — é o que eu errei três vezes
tentando de olho. Com abertura igual o desenho vira leque; com 180° vira wi-fi.
As pontas dos quatro caem sobre uma reta (passo constante de ~22 px em y e ~41
em x), ou seja, os arcos são cortados por duas diagonais e não por um cone que
sai do centro. É esse corte que dá a leitura de onda.

Lição que vale além deste ícone: **quando existe uma referência, medir custa
menos que iterar.** Três tentativas no olho contra uma decodificação de PNG que
levou dois minutos.

## Som

Cinquenta repetições em um minuto é o número que manda. A primeira versão errava
em quatro pontos, e vale registrar para não voltarem:

| Errado | Por quê |
|---|---|
| senoide a 1200 Hz | agudo cansa, e senoide pura soa a caixa de supermercado |
| bipe duplo para repetido | repetição é o que mais irrita cinquenta vezes |
| corte linear no fim | deixa estalo audível |
| sons somando | duas leituras juntas dobravam o volume |

Como ficou: notas curtas com **decaimento exponencial**, como corda beliscada —
som que já está sumindo quando se percebe. Onda triangular filtrada em 2,6 kHz,
tudo entre 349 e 784 Hz, volume entre 0,09 e 0,12, e **nada passa de meio
segundo**. Um toque novo corta o anterior em 20 ms em vez de somar.

A diferença entre avisos é de **altura, nunca de repetição**: subir é bom,
descer é problema. Presença registrada é o toque mais discreto de todos — uma
nota só — porque é o caso normal, e o normal não se anuncia.

Há teste garantindo cada uma dessas propriedades: duração, faixa de frequência,
volume, número de notas, e a direção de cada par.

## Movimento

| | |
|---|---|
| Curva geral | `cubic-bezier(0.28, 0.11, 0.32, 1)` |
| Folha que sobe | `cubic-bezier(0.32, 0.72, 0, 1)` |
| Duração | 180 ms para resposta, 320–420 ms para superfície |
| Toque | `scale(0.97)` em 60 ms — o dedo sai da tela sabendo que pegou |

**Latência zero na fila.** A tela responde ao crachá **antes** de gravar; o som
vem depois. São duas promessas diferentes: o olho precisa de resposta imediata
para a fila não parecer travada, e o bipe significa *está salvo*. Gravar antes
de mostrar somava a latência do disco a cada leitura — e numa fila isso se
sente.

## Menos é mais

- **Pouco texto.** Se uma frase explica uma decisão de projeto, ela é
  documentação e mora em `docs/`.
- **O motor não aparece.** Hash, sal, idempotência, sincronia com a pasta,
  service worker: tudo roda sem o usuário saber que existe.
- **Tipografia da Apple.** `-apple-system` / `SF Pro` primeiro, com fallback de
  sistema. Peso e tamanho fazem a hierarquia; borda de 1px, não.
- **Claro e escuro**, seguindo o sistema.
- **Mushroom cards** onde houver estado a mostrar de relance — ícone à esquerda,
  uma linha principal, uma de apoio. O lugar natural é a folha da base.

## Cobrança de cadastro: só no primeiro dia

A faixa "faltam 3 crachás" só aparece quando **ninguém da turma tem crachá
ainda** — o primeiro dia, em que a cerimônia é a própria chamada. Depois disso
ela some: manter um aviso permanente é cobrança sobre gente que pode ter
trancado, e o caso se resolve sozinho.

Quando alguém que faltou no primeiro dia finalmente aparece e encosta o crachá,
o app **pergunta de quem é** — uma folha com busca que filtra a turma a cada
tecla, sem botão de buscar e sem confirmação. Digitar é a ação; Enter resolve
quando sobra um só. Nada é gravado enquanto ninguém responder.

## Safari

Vale tentar, e só se der. O núcleo já funciona lá (IndexedDB, WebCrypto,
service worker). O que não existe é o seletor de pasta — nesse caso o app
degrada para exportar e importar à mão, **dizendo isso**, em vez de fingir que
está guardado.

## Manual

Mais adiante: um PDF que ensine o uso e trate LGPD e confiabilidade dos dados.
**A meta é que ele não seja necessário** — se o manual precisar explicar como
usar a tela, a tela está errada. O que sobra para ele é o que a tela não pode
responder sozinha: onde os dados moram, o que sai do computador (nada), e por
que o crachá pode ser lido sem ferir a política do CIn.
