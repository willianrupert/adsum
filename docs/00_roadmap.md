# 00 — Roteiro

Seis passos. Cada um termina em algo que abre no navegador e faz alguma coisa —
nada de passo que só existe como preparação para o próximo.

## 1 · Esqueleto, leitor simulado e diagnóstico — **feito**

Vite + React + TypeScript + Dexie, PWA publicável no GitHub Pages. As duas
portas (`LeitorDeCracha`, `Repositorio`) e os dois primeiros adaptadores
(`LeitorSimulado`, `RepositorioDexie`). Uma tela: diagnóstico.

Por que o diagnóstico vem primeiro, e não a tela bonita: o app depende de APIs
que variam por navegador e por contexto — WebSerial não existe no Firefox,
WebNFC só no Chrome Android, quase nada funciona fora de contexto seguro, e o
IndexedDB some em navegação privada. Descobrir isso na frente da turma é tarde.

Vale o mesmo princípio do firmware: **toda regra precisa de voz na tela**. Lá, a
janela de 60 s recusava em silêncio e era indistinguível de aparelho quebrado.

## 2 · Repositório de verdade — **feito**

Vínculos e grade com CRUD, importação e exportação em CSV pelo File System
Access, **nos mesmos formatos do cartão** (`uid_hash;papel;nome` e
`hash_prof;dia;hh:mm;hh:mm;turma`). Compatibilidade de formato é o que permite
arrastar o arquivo do volume `ADSUM` para cá e de volta.

Aqui entra também o sal de frota: importar o sal do aparelho é o que faz as duas
bases falarem do mesmo crachá.

Feito: `nucleo/csv.ts` com os três arquivos, leitura que **relata cada linha
descartada e por quê**, tela de vínculos e grade com edição, e o campo do sal
com aviso de que trocar invalida vínculo e grade. Toda leitura de CSV tem teste
contra as linhas literais dos documentos do firmware — se o app deixar de
conversar com o aparelho, quebra no `npm test`, não na aula.

## 3 · Cerimônia de vínculo — **feito**

O `vincular.html` reescrito: lista colada do SIGAA, encurtamento de nome com
medida em pixel, **um nome armado por vez**. A garantia contra trocar aluno não
vem do meio de transporte; vem de não haver segundo candidato.

Cuidados que já custaram bug e não podem se perder: aluno vem seguido de
`(Perfil)` e docente de `Departamento:`; a dica de docente vem primeiro na
ordem, para que cerimônia interrompida no meio já tenha o essencial feito.

Feito: `nucleo/nomes.ts` traz do `vincular.html` **as tabelas de avanço das
fontes do firmware**, com teste para cada regra — partícula, colisão
desempatada, e os dois limites (210 px na coluna, 31 bytes no buffer). A tela
arma um nome por vez, recusa crachá já vinculado dizendo de quem é, e permite
armar de novo um nome já feito, porque segunda via existe.

Duas regras mudaram em relação ao `vincular.html`, e as duas por decisão de
produto:

- **O nome exibido é primeiro + segundo nome** — "Willian Neves", não "Willian
  Jones". É como a pessoa é chamada, e é o que o mockup de `Adsum/docs/03` já
  mostrava. De quebra, a regra de sufixo de linhagem deixa de ser necessária:
  pegando pela frente, "Breno Filho" não é mais alcançável.
- **Todo mundo entra como aluno**, e professor é um toque. A dica do SIGAA vira
  marca na linha em vez de decisão automática, e um aviso fica na tela enquanto
  ninguém estiver marcado — a trava passa de recusa para visibilidade.

A leitura da página `Turma › Participantes` mora em `nucleo/sigaa.ts` e traz
**nome completo e login do CIn**. Duas coisas que ela faz e um extrator ingênuo
não faria:

- **confere o total contra o cabeçalho.** A página declara `Docentes (2)` e
  `Discentes (47)`; se o que foi lido não bater, ela diz. Colar metade da página
  produz uma lista perfeitamente plausível, e o aluno que ficou de fora só
  descobriria na hora da chamada.
- **marca login que é só dígitos.** Quando a pessoa não escolheu login, o SIGAA
  cai na matrícula — e às vezes no CPF. Vira `só número` na tela, para decisão
  humana.

A lista é guardada **por turma**, e reabrir uma turma repõe quem já tem crachá.

Medida que ficou registrada no teste: **"Amanda Nascimento" ocupa 209 dos 210
pixels da coluna.** Nome comum já raspa o limite — é o número que explica por
que 47 dos 48 nomes reais não cabiam, e por que contar letras nunca resolveria.

## 4 · Sessão e coleta — **feito**

A máquina de estados de `Adsum/docs/02` no navegador: `SEM_HORA` → `OCIOSO` →
`IDENTIFICANDO_TURMA` → `CONFIRMANDO` → `COLETANDO` → `ENCERRANDO`, com a janela
de 60 s e a tela única de coleta. Registros append-only, `evento_id` idempotente.

Uma tela só durante a coleta, como no aparelho — pelo mesmo motivo: com fila,
uma confirmação de 2,5 s ou trunca ou atrasa.

## 5 · Leitor de verdade — **metade adiantada**

Adaptador `LeitorWebSerial`, falando o protocolo CDC linha a linha
(`PING`, `HORA`, `ARMAR`, `SIMULAR`, `LISTAR`…) com o Adsum A1. **Falta.**

O `LeitorWebNfc` foi escrito antes da hora, porque a pergunta que ele responde é
grande: *um professor com Android registra presença sem aparelho nenhum?*

**Medido em 18/08/2026 e a resposta é sim.** Chrome no Android, permissão
concedida, quatro leituras com UID a partir do crachá do CIn. O Web NFC cobre
tags NFC Forum tipo 1–5 e o Mifare Classic não é nenhum desses, mas o Chromium
entrega o `serialNumber` mesmo assim. Isso põe a demo sem hardware (etapa 3 do
roteiro com o professor) ao alcance de hoje.

**O que ainda não está provado:** que esse UID é o mesmo byte a byte que o PN532
vai entregar. Ordem e comprimento podem divergir entre pilhas NFC, e se
divergirem, vínculo feito pelo celular não é reconhecido pelo aparelho nem com
sal compartilhado. O teste é direto e só depende da peça chegar — ver a
pendência em `CLAUDE.md`.

Escrever esses dois adaptadores não tocou em tela nenhuma além da escolha do
leitor — que é a prova de que a porta do passo 1 estava no lugar certo.

## 6 · Saída para a planilha e publicação

Exportação para a aba `registros` — arquivo para arrastar, e envio ao Web App do
Apps Script para quem quiser. `sync.log` com a mesma disciplina de append-only.
PWA instalável, publicado, com instruções de instalação.

O nome continua não trafegando: sai `uid_hash`, a planilha resolve.

## O que este roteiro não faz

- **Não substitui o aparelho.** O A1 funciona sem laptop, sem rede e sem
  navegador aberto. O app é a ponte e o cadastro, não o registrador.
- **Não cria backend.** Se um dia precisar, é Apps Script preso à planilha.

## Desenho — ideação de 18/08/2026

Não implementado. Registro para a próxima sessão não recomeçar do zero.

**Princípio: a rota é o estado.** Não há abas. *(Implementado em
`nucleo/rota.ts` e `ui/Fluxo.tsx`; a coleta ainda falta.)*

Não há abas. A tela decorre do que existe na
pasta e da hora. Seis estados, um de cada vez:

1. sem pasta → *escolha onde guardar* (única ação da tela)
2. sem turma → *cole sua turma*
3. turma sem crachás → cerimônia de vínculo
4. tudo pronto, fora de horário → repouso, com a próxima aula
5. dentro do horário → coleta
6. algo quebrado → o problema e a ação que resolve, nada mais

**Uma coisa grande por vez.** Um número ou um nome em corpo enorme; todo o
resto pequeno e cinza. Acento só para o que acabou de acontecer.

**O som é o feedback primário.** Em fila ninguém olha a tela — isso valia para
o display e vale igual no navegador. Web Audio, bipe curto depois de gravar.

**O diagnóstico vira selo discreto** (leitor ✓ pasta ✓) num canto, que só fica
alto quando algo falha. Deixa de ser aba.

**Nunca perguntar o que dá para saber.** A grade e o relógio escolhem a turma;
só o caso ambíguo vira pergunta. É a lógica de `CONFIRMANDO`/`ESCOLHENDO` do
desenho antigo, que já era isso.

**A tela de coleta do mockup antigo continua valendo** — contador sem
denominador, nomes abreviados, uma tela só. Foi pensada, não improvisada.

**Evitar:** vidro sobre fundo variável (contraste é requisito), texto que
explica decisão de projeto, e qualquer pergunta que o app poderia responder.

### Orçamento de toques

O projeto mede flash e pixel em vez de preferir. Vale medir interação também.

| Situação | Toques na tela |
|---|---|
| Aula normal, do começo ao fim | **0** |
| Cerimônia de vínculo | 1 por aluno — e é o crachá dele, não a tela |
| Primeira configuração | 2: escolher a pasta, colar a turma |

Zero na aula normal é o número que importa: crachá abre, crachás registram,
crachá fecha. **Se uma aula normal exigir um clique, algo do desenho falhou** —
e isso é verificável, não opinião.

Decorrências que esse número impõe:

- **Não existe "exportar".** Se a pasta é a dona, `registros.csv` já está
  pronto no disco o tempo todo. Botão de exportar é o app pedindo que o humano
  faça o trabalho dele.
- **Erro não interrompe a fila.** Crachá desconhecido é linha vermelha e bipe
  grave, nunca diálogo. Nada bloqueia quem está atrás.
- **Confirmação vira desfazer.** "Tem certeza?" é o app terceirizando
  responsabilidade. Age, e oferece voltar atrás.
- **Só falar quando há decisão a tomar.** "Turma salva!" não é informação, é
  ruído.
- **Fechar o notebook no meio não perde o lugar.** Reabriu, a sessão continua
  onde estava — sem "bem-vindo de volta".
