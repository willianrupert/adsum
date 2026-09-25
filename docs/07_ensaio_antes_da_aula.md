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
aberta pela versão nova. Com a pasta descompactada de novo:

1. Servir a versão antiga (a mais antiga que ele pode ter) num endereço
   local novo — endereço novo é base vazia.
2. Ligar a pasta nela e fazer uma chamada curta.
3. Trocar o servidor para a versão nova, **no mesmo endereço**, fechar e
   reabrir.
4. Continua tudo lá: turmas, vínculos, presenças, numeração. Nada pergunta
   de sal. O crachá encostado é reconhecido.

## 4. O professor

- **Atualiza na véspera, não no dia**: fecha e reabre o app, encosta o
  crachá de um aluno na tela inicial, e confere o carimbo no Diagnóstico.
- **Sabe o plano B**: se algo falhar, marca presença pela lista, à mão, e
  manda o zip da pasta depois da aula. Uma aula registrada à mão se
  recupera; uma aula perdida em silêncio, não.
- **Manda o zip toda sexta**, nas quatro primeiras semanas depois de cada
  mudança.

## 5. O zip de sexta

Nas quatro semanas depois de cada mudança, o professor manda o zip da pasta
toda sexta. É a régua do congelamento: uma semana só conta como limpa depois
de lida.

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
