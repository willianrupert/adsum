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
- **O som não pode empilhar.** Bipes de 90 ms com 1,5 s entre eles funcionam;
  dois bipes sobrepostos viram estalo. O som precisa cortar o anterior em vez de
  somar, e o volume tem que aguentar cinquenta repetições sem irritar quem está
  na sala há uma hora.

**O que a Apple faz nesse caso** é não celebrar cada evento. O feedback é
pequeno, imediato e igual toda vez — a lista cresce, o número muda. Comemoração
por leitura é desenho de aplicativo de banco, não de fila.

**Implementado assim:** em vez de pop-up, o **nome ocupa por um instante o
lugar do contador** e volta. Sem caixa, sem sombra, sem entrada e saída — só
troca de conteúdo, e o relógio de 1,6 s recomeça a cada leitura. Aguenta ritmo
porque nada precisa terminar: o próximo crachá simplesmente substitui o
anterior, em vez de esperar a vez.

## Feito na passada de 18/08/2026

Tipografia do sistema (`-apple-system`), hierarquia por tamanho e peso, e
agrupamento por espaço — as bordas de 1px que faziam tudo parecer painel de
controle saíram. Claro e escuro seguindo o sistema, com o verde mudando entre
os dois: o `#5DCAA5` do escuro não tem contraste sobre branco.

Falta: os Mushroom cards na folha da base, e o corte de texto das telas de
vínculo e base.

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
