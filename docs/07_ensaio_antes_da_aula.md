# Ensaio antes da aula

O que roda depois de todo deploy, antes de a versão encontrar uma turma. A
regra está no `CLAUDE.md` ("Como uma mudança chega à sala"); este é o
roteiro. Nasceu em 23/09/2026, depois de uma aula perdida por mudanças
testadas só sobre base limpa. Documento vivo, revisto em 25/09/2026.

Rodado inteiro pela primeira vez em 23/09, sobre `39830c2`. Achou dois
defeitos que a suíte não achava (`docs/06_falhas_em_sala.md`, J e K), e a
aula seguinte foi a primeira limpa.

## Antes de começar

- **A cópia do cofre.** Uma pasta de um professor real, descompactada numa
  pasta de teste. Nunca a pasta dele, e a cópia nunca volta para ele. Ela
  guarda UID de verdade em `auditoria/uids.csv` e nome de aluno: não sai do
  computador de quem ensaia.
- **Descompactada de novo** quando o que se testa é "a máquina dele
  atualiza" (seção 3). Uma cópia já usada em ensaio tem o sal de quem ensaiou
  no chaveiro, e não é mais a base dele.
- **O dongle de verdade**, e o foco na janela do Adsum.
- **O emulador C3** (`ferramentas/emulador-de-cracha`), para os crachás que
  ninguém tem na mão: desconhecidos, fila. O rig S3 não existe mais.
- **A versão certa.** Diagnóstico → carimbo da build. Tem que ser o do
  deploy que se está validando.

## 1. Os sete passos

Se algo sair diferente, pare ali. Não precisa terminar a lista.

1. **Tela inicial, encostar um crachá.** Mostra que foi lido. A chamada **não**
   abre.
2. **Abrir a chamada pelo botão e encostar o crachá.** Conta presença. Depois:
   "Não presente" (volta a 0) e encostar de novo (volta a 1). Crachá sem
   vínculo abre a busca "de quem é?".
3. **Encerrar e reabrir a mesma turma.** Um clique encerra. Os presentes
   continuam lá.
4. **Fechar a janela e reabrir o app.** Abre na tela inicial, com a chamada
   fechada. Reabrir a turma continua de onde parou.
5. **Marcar alguém presente à mão.** A linha aparece em
   `registros/<turma>.csv`, com matrícula.
6. **A busca com três crachás desconhecidos**, pelo emulador C3. O primeiro
   abre a busca; o segundo e o terceiro são recusados com aviso dentro dela;
   o campo fica sem dígitos; o nome escolhido fica com o primeiro crachá.

   O cenário "Rodar chamada com histórico (22/09)" do Diagnóstico precisa do
   rig S3, que o autor não tem mais, e não roda com o C3: o PN532 mascara o
   primeiro byte do UID emulado. Enquanto não houver outro rig, o que cobre
   esse caminho é a suíte (`ChamadaComHistorico.test.tsx`,
   `AulaReal2209.test.tsx`), sobre o cofre anonimizado.
7. **`diagnostico/<dia>.log`.** Cada `cracha` com `decisao=`, `evento=` e os
   tempos; um `encerrar` por encerramento; nenhum `erro_`; a conferência nas
   linhas de base (`repetidos=19` em CIN0144, `repetidos=8` em CIN0114, na
   cópia do cofre do Prof. Paulo).

## 2. Casos de borda

Os que não têm teste automático, ou que dependem do mundo real:

| Caso | O esperado |
|---|---|
| F5 com a chamada aberta | Continua aberta |
| Segunda janela ou aba do Adsum com a chamada aberta | **Em aberto** — anotar o que acontece nas duas |
| Tampa fechada 1 min, abrir, encostar | Lê. Pode pedir a pasta de novo |
| Dongle tirado e recolocado | Lê, sem fazer nada |
| Sem internet: fechar, reabrir, chamada curta | Tudo funciona |
| Crachá do professor na chamada, depois de 10 s | Encerra a chamada |
| Aluno de outra turma encosta | **Em aberto** — anotar tela e planilha |
| "Remover crachá" e encostar outro cartão | Busca com a turma inteira, e conta |

## 3. A máquina do professor atualiza

O caminho que só ele percorre: uma base feita pela versão que ele tem,
aberta pela versão nova.

**Automático desde 30/09/2026:** `npm run test:atualizacao` (Playwright,
`e2e/atualizacao.spec.ts`), com o zip da pasta dele em `ADSUM_COFRE` (padrão
`~/Downloads/Chamadas 3.zip`). Monta a versão do ar (`origin/main`) e a nova
(o commit, `HEAD`) como o deploy monta, serve as duas no mesmo endereço, e
no Google Chrome instalado:

1. a versão do ar abre o cofre e chega ao repouso, com o service worker dela
   no controle;
2. abre a chamada e encosta, como o dongle, cada crachá do
   `auditoria/uids.csv` do cofre;
3. publica a nova e recarrega no meio da chamada: a nova espera, a chamada
   continua, a fila conta;
4. encerra: a nova entra sozinha, sem gesto;
5. confere: nada sumiu da base, o log só cresceu, a planilha de faltas de
   cada turma tem a coluna `matricula`, o diário de hoje não tem erro;
6. a mesma chamada na nova: cada crachá é a mesma pessoa que era na do ar;
7. e o caso de fora de aula: abrir o app no dia seguinte já traz a nova.

Com `-- --headed`, dá para assistir. **Com o rig S3** (`ferramentas/rig-de-cracha`,
um cabo só, na porta USB nativa): `npm run test:atualizacao:rig`. Os
crachás deixam de ser digitados pelo Playwright e passam pela placa, como
teclado USB de verdade, no ritmo medido do dongle: do conector para cima, o
caminho é o do dongle. O teclado do rig digita onde estiver o foco, então o
teste traz a janela dele para a frente e confere o foco antes de cada
crachá, e para se não estiver nela. Não mexer no computador enquanto roda
(uns 3 minutos). Primeira vez, 01/10/2026: passou, 84 crachás do cofre real. Leva uns 2 minutos; a primeira vez
monta as duas versões (`node_modules/.cache/adsum-versoes`, por commit).
Provado que pega: com a versão nova sem o conserto de 30/09 (a pasta
regravada ao abrir), falha apontando a planilha sem a matrícula.

O que ele **não** prova, e continua à mão com o dongle:

- **A permissão da pasta de disco.** O teste usa a pasta interna do navegador
  (OPFS), que tem a mesma interface e não pede permissão. Na máquina dele, o
  Chrome pode pedir "Liberar" depois de fechar e abrir: é o comportamento de
  hoje, e a versão nova não muda isso.
- **O endereço `github.io` em si**, e a leitura de rádio do dongle (o rig
  entra depois dela, no USB; o emulador C3 cobre o rádio, mas não reproduz o
  primeiro byte do UID).

Na mão, quando preciso: servir a versão antiga num endereço local novo,
ligar a cópia da pasta descompactada de novo, fazer uma chamada curta, trocar
o servidor para a nova no mesmo endereço, fechar e reabrir.

## 4. O professor

- **Atualiza na véspera, não no dia**: fecha e reabre o app, encosta o
  crachá de um aluno na tela inicial, e confere o carimbo no Diagnóstico.
- **Sabe o plano B**: se algo falhar, marca presença pela lista, à mão, e
  manda o zip da pasta depois da aula. Uma aula registrada à mão se
  recupera; uma aula perdida em silêncio, não.
- **Manda o zip toda sexta**, nas quatro primeiras semanas depois de cada
  mudança.

## 5. O zip de sexta

O professor manda o zip da pasta toda sexta. É a régua da semana estável que
antecede cada publicação (`CLAUDE.md`, desde 01/10/2026): uma semana só conta
como limpa depois de lida.

No `diagnostico/*.log` da semana:

- nenhuma `recusa` de crachá de verdade (digitação num campo não aparece);
- nenhum `desconhecido_durante_busca` fora do esperado, e nenhuma busca
  interrompida;
- nenhum `id_ocupado` e nenhum `erro_`;
- `conferencia_divergiu` só com os números da linha de base. Outro número é
  problema novo;
- os tempos por crachá na mesma ordem de 24/09 (13 ms identificar, 7 gravar,
  48 tela, no pior caso).

Em `registros/`, a contagem de presentes de cada dia contra o registro à mão
do professor, quando ele tiver. O zip fica fora do repositório: tem nome,
matrícula e UID de verdade. Se uma aula tiver falha, vira cofre anonimizado
(`scripts/anonimizar_cofre.py`) antes de qualquer conserto.
