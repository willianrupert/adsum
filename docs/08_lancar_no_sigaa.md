# 08 — Lançar no SIGAA

Não implementado. Desenho registrado em 24/09/2026, no dia da primeira aula
limpa, a partir do pedido do Prof. Paulo ("agora é fazer a v2 para migrar
direto para o SIGAA"). Funcionalidade nova: espera as quatro semanas limpas
do `CLAUDE.md` antes de ir ao ar. Nada aqui foi conferido contra o HTML real
do SIGAA — o que depende disso está marcado em "O que o HTML precisa
responder", no fim.

## O que se quer

O professor passa as presenças do Adsum para o SIGAA **quando quiser** — toda
aula, a cada três, ou uma vez no fim do semestre — **com o mesmo gesto**, e
consegue **conferir** que o SIGAA ficou igual ao Adsum. Com a menor
manutenção possível e sem nenhum atrito com as regras de segurança da UFPE.

## O que o SIGAA oferece

Fontes: manual da UFPE, [Lançar Frequência][m1] e [Lançar Frequência em
Planilha][m2]. O SIGAA é o da UFRN, usado em dezenas de instituições; o
visual não muda há anos, e as capturas do manual (2011–2019) batem entre si.

**Não existe importação oficial de frequência.** "Importação de Dados", no
menu Configurações da Turma Virtual, copia plano de curso e conteúdo de outra
turma — não presença. Conferido em mais de um manual.

Duas telas escrevem frequência (Turma Virtual › Alunos):

- **Lançar Frequência** — um dia por vez. Calendário do semestre à esquerda
  (azul: dia de aula; verde: já lançado; amarelo: cancelada; vermelho:
  feriado). Clicado o dia: título `Lista de Frequência - DD/MM/AAAA` e tabela
  `# | Matrícula | Nome | seletor | presença | ausência`. O seletor é um
  `<select>` com `Presente`, `1 Falta`, `2 Faltas`… — as opções seguem as
  aulas do dia. Botões: Gravar Frequências, Remover Frequências deste dia,
  Cancelar Aula, Cancelar.
- **Lançar Freq. em Planilha** — o semestre inteiro. Linhas são alunos, com
  **coluna Matrícula**; colunas são os dias. Cada célula guarda o número de
  faltas: "digite quantas faltas corresponde àquela aula", ou clique para
  decrescer até zero. Clicar no cabeçalho do dia marca todos presentes.
  Marcas próprias do SIGAA: `T` (trancado), célula bloqueada (matriculado
  depois da data), feriado, cancelada, dia já lançado. Um só **Gravar
  Frequências** para tudo.

E uma trava que baixa o risco: **a falta só vira definitiva quando o docente
a ratifica no lançamento de conceitos**, no fim do semestre. Um erro de
frequência é corrigível até lá.

## O que já se tentou

- **[auto-sigaa][fc]** (Prof. Filipe Calegario, UFPE, 2023). Notas, não
  frequência. Selenium: o professor faz o login e navega, o script preenche,
  **não salva**. Acha o aluno por `contains(text(), nome)` e segue em frente
  quando não acha — só um `print`.
- **[notinhas][nt]** (SIGEduc da Bahia, família SIG). Playwright, frequência
  e notas, várias datas por vez. Aprendeu na marra o que o JSF faz com robô:
  `page.goto` desloga ou tira da turma, "voltar" quebra o estado, tudo espera
  `networkidle`. Casa aluno por nome com normalização fonética. **Digita a
  senha do professor** no modal de confirmação do SIGEduc.
- **[SIGAAutils][su]** (IFC) e **[sigaa-horarios-extension][sh]** (UFBA):
  extensões. A primeira faz login automático; a segunda traduz o código de
  horário (`23T56`), o que prova que ele é legível por máquina.

O que se aproveita: o professor loga e navega; a ferramenta preenche; **quem
grava é o professor**. O que não se repete: casar por nome, seguir calado
quando não acha, tocar na senha, navegar pelo SIGAA com robô.

## As regras de segurança que o desenho segue

[PoSIC da UFPE][ps] (2016/2017, vigente):

- **Art. 22** — "a conta de acesso e a senha de cada pessoa são únicas,
  individuais e intransferíveis, sendo reconhecidas como equivalentes à sua
  assinatura". **A ferramenta nunca vê, digita, guarda nem pede senha.** Não
  faz login e não mantém sessão; usa a página que o professor já abriu.
- **Art. 54, II** — o usuário responde "por todo e qualquer acesso (…) bem
  como pelos efeitos desse acesso". **O Gravar é sempre um clique do
  professor**, depois de ver o que mudou. A ferramenta nunca clica em botão
  do SIGAA.
- **Art. 10** — uso compatível com "ética, confidencialidade, legalidade e
  finalidade". A ferramenta faz só o que o professor faria à mão, na tela que
  o SIGAA oferece para isso.

A PoSIC não fala de scripts nem de automação. Por isso a ferramenta se limita
ao que é indistinguível de digitar: **nenhuma requisição própria ao SIGAA**,
nenhuma navegação, nenhum envio de formulário. Ela lê a página já carregada e
preenche campos. Para o servidor, é o professor digitando rápido.

O resto vem do próprio Adsum: nada sai do computador (as duas janelas
conversam na mesma máquina), nada de código remoto dentro da sessão do SIGAA,
e o código é aberto para quem quiser auditar.

**Antes de ir ao ar para outros professores:** mostrar o desenho ao NTI
(CSTIC) e pedir um de acordo por escrito. Custa um e-mail, e é o que
transforma "segue as regras, na nossa leitura" em "a UFPE sabe e concorda".

## O desenho

### Uma tela só: a planilha

A ferramenta trabalha **só na "Lançar Freq. em Planilha"**. É ela que dá
liberdade de ritmo — um dia ou o semestre, a mesma página — e ela já traz
matrícula, todos os dias e as marcas do SIGAA. Suportar uma página só é
metade da manutenção. A tela de um dia fica como caminho manual do professor,
que continua existindo.

O risco da planilha é o alcance: um Gravar grava o semestre. O desenho
contém isso com as regras de "O que a ferramenta nunca faz", abaixo.

### Favorito burro, Adsum inteligente

```
Planilha do SIGAA (o professor chegou nela sozinho)
   │ 1. clique no favorito "Adsum"
   ▼
Favorito (pequeno, sem lógica de domínio, nunca muda)
   │ 2. lê a página crua: turma, matrículas, dias, valor e estado de cada célula
   │ 3. abre a janela do Adsum e manda a leitura (postMessage)
   ▼
Adsum (tem a base e os testes)
   │ 4. acha a turma, casa por matrícula, compara dia a dia
   │ 5. mostra o resumo e pede o gesto: [Preencher]
   │ 6. devolve só "célula tal = n"
   ▼
Favorito
   │ 7. escreve, pinta cada célula mexida, mostra o resumo na página
   ▼
Professor confere e clica em Gravar Frequências
   │ 8. a página recarrega; favorito de novo → "O SIGAA confere com o Adsum"
```

- **O favorito não entende nada.** Lê, aplica e pinta. Se o SIGAA mudar um
  detalhe, o conserto vai no Adsum, num deploy normal, e ninguém reinstala
  nada.
- **Capacidade limitada de propósito.** O favorito só aceita mensagens da
  origem do Adsum, só escreve inteiros de 0 ao máximo do dia em células que
  existem, e nunca clica, navega, envia ou executa o que recebe. Nem um Adsum
  comprometido conseguiria gravar no SIGAA: faltaria o clique do professor.
- **O Adsum só responde para `https://sigaa.ufpe.br`.**
- **Sem código remoto.** O favorito é autossuficiente, não carrega script de
  lugar nenhum dentro da sessão do SIGAA.

### O que é o favorito, concretamente

Um favorito do navegador cujo endereço, em vez de `https://…`, começa com
`javascript:` e traz o código. Clicado, o navegador roda esse código **na
página que está aberta** — a planilha do SIGAA. Não é site, não é
subdomínio, não tem servidor: o código mora no próprio favorito, na máquina
do professor. Não precisa de loja, permissão nem instalação.

- **Como entra:** nos Ajustes do Adsum, um botão "Adsum → SIGAA" que se
  **arrasta** para a barra de favoritos (Chrome: Cmd/Ctrl+Shift+B mostra a
  barra). Clicar nele no Adsum não faz nada além de dizer "arraste para a
  barra". Arrastar é o único jeito que o Chrome aceita, de propósito: página
  nenhuma consegue instalar código em favorito sozinha.
- **Por que janela e não painel dentro do SIGAA:** um `iframe` do Adsum
  dentro do SIGAA teria o armazenamento particionado pelo Chrome e veria uma
  base vazia. A janela própria abre o Adsum de verdade, com a base e a pasta.
- **Versão:** o favorito manda a própria versão na primeira mensagem. Se um
  dia o Adsum precisar de um favorito novo, a folha diz "arraste o favorito
  novo" e recusa o antigo — nunca roda com um favorito que não conhece.
- **Ponte do lado do Adsum:** além do cartão de instalação, só um link
  "Abrir o SIGAA". Não dá para ir direto à planilha de uma turma: o SIGAA é
  JSF, com sessão, e essa navegação é do professor.

### A janela do Adsum

Uma janela de verdade do sistema, aberta por `window.open` em modo *popup*:
sem abas nem barra de favoritos, com a barra de endereço mínima mostrando
`willianrupert.github.io` — que é, de passagem, o selo de que aquilo é o
Adsum e não algo desenhado dentro do SIGAA.

- **Arrasta, redimensiona, minimiza e fecha** como qualquer janela; o
  sistema operacional garante, e a página não consegue impedir. Abre
  encostada à direita da tela (~420 × 640), onde a planilha, que cresce para
  a esquerda, menos perde. Tem Fechar próprio, além do X da janela.
- **Não fica sempre por cima.** Página nenhuma consegue isso. Por isso ela
  não precisa ficar aberta: **Preencher fecha a janela**, e o resumo passa
  para a barra do Adsum no pé da planilha. A janela vive o tempo de uma
  decisão, não da conferência inteira.
- **Escondida atrás do Chrome:** clicar no favorito de novo reabre a mesma
  janela (mesmo nome de alvo) e a traz para a frente, com o estado em que
  estava. A barra na planilha também tem "Mostrar a janela do Adsum"
  enquanto ela existir.
- **Fechada sem Preencher:** nada acontece na planilha, e a barra diz
  "Nada foi preenchido".
- **A planilha mudou com a janela aberta** (recarregou, navegou): a janela
  percebe que a página que a abriu não responde e diz "A planilha do SIGAA
  mudou. Clique no favorito de novo." Nunca aplica leitura velha em página
  nova — cada leitura tem um identificador, e a instrução só vale para ele.

A barra do Adsum no pé da planilha ocupa uma linha, reserva o próprio espaço
no fim da página (não cobre a última linha da tabela) e recolhe para uma
pílula com um toque.

### Qualquer ritmo, o mesmo gesto

Cada uso é uma **conciliação** — "o que o SIGAA tem" contra "o que o Adsum
diz" —, não um envio. Por isso o ritmo é do professor: toda aula, a cada três
ou no fim do semestre, o gesto é o mesmo e o resultado também. Rodar duas
vezes seguidas não muda nada na segunda.

Cliques do professor, além de chegar à planilha: **favorito, Preencher,
Gravar** — os mesmos para um dia ou sessenta. E, se quiser a prova, mais um
favorito depois de gravar.

### Checar se está válido

O mesmo favorito, numa planilha já gravada, só compara: **conferência só de
leitura**, que nunca escreve. Serve depois de cada Gravar, e serve sozinha:
pega também o que foi lançado à mão, fora do Adsum. Uma frase por
categoria, e a lista por aluno e dia ao abrir:

- **Confere** — SIGAA e Adsum iguais.
- **A lançar** — o Adsum tem chamada, a célula do SIGAA está vazia.
- **Diverge** — as duas têm valor, e diferem.
- **Só no SIGAA** — dia lançado sem chamada no Adsum (papel, esquecimento).
- **Sem onde lançar** — chamada no Adsum num dia que o SIGAA não tem como
  aula, ou tem como cancelada ou feriado.
- **Sem par** — matrícula de um lado que não existe do outro.

### O que a ferramenta nunca faz

- **Nunca muda um dia que o SIGAA já tem lançado.** Divergência se mostra;
  quem corrige é o professor, na célula, com a própria mão. É isso que
  garante a autonomia: **o que o professor decidiu no SIGAA ganha sempre**, e
  a próxima conferência mostra a diferença sem desfazê-la.
- **Nunca preenche dia sem chamada no Adsum.** Célula vazia continua vazia.
- **Nunca adivinha quantas faltas vale o dia.** O máximo vem da página do
  SIGAA; sem ele, o dia é recusado com o motivo. Ausente é o máximo; presente
  é `0`, escrito explicitamente, sem contar com o padrão da tela.
- **Nunca casa por nome.** Matrícula ou nada.
- **Nunca age em silêncio.** Tudo o que não foi preenchido aparece no
  resumo com o motivo — mesma regra do "46 onde deveria haver 48".

### Autonomia: o que o professor decide no SIGAA

O Adsum sabe "veio" ou "não veio". O professor sabe mais: quem chegou na
segunda aula, quem saiu cedo. Ele ajusta direto no SIGAA, antes ou depois de
gravar, e isso vale pela regra acima.

**Decidido pelo autor, 24/09/2026:** a diferença não fica aparecendo para
sempre. Na folha, cada diferença tem **Aceitar o SIGAA**; o toque acrescenta
um registro de ajuste no Adsum (append-only, com dia, matrícula e valor), e a
partir daí a conferência conta aquela célula como *Confere (ajustada)*. O
evento de presença original não muda — o ajuste é uma linha nova que diz
"o professor decidiu diferente", nunca uma reescrita.

### Qual turma

O Adsum identifica a turma pelas matrículas da página, não por
configuração. Se mais de uma turma do Adsum casa, ou nenhuma casa o
bastante, recusa e diz por quê.

### A ponte é um adaptador

O que se garante é o núcleo (camadas 1–4 abaixo), não a casca. Favorito e
janela são **uma** forma de ligar o Adsum à planilha, e podem não ser a
última — o mesmo raciocínio do "o leitor vai mudar". Por isso a ligação é
uma porta, `PonteSigaa`, com adaptadores trocáveis sobre o mesmo núcleo:

1. **Lista para lançar à mão** — sempre existe, não depende de nada do
   SIGAA: "14/10: todos presentes, exceto" e as matrículas e nomes de quem
   faltou. Com o "marcar todos presentes" da tela de um dia, são poucos
   cliques por aula. É o chão: se o favorito quebrar num dia de SIGAA
   diferente, o professor lança igual, sem esperar conserto.
2. **Favorito + janela** — o desenho desta seção. Zero dependência externa.

**Decidido pelo autor, 24/09/2026: a ponte é o favorito.** Extensão não
entra — nem agora, nem como plano B. A porta continua existindo pelo que ela
separa (núcleo de casca, testável sem navegador), não para abrir espaço a
uma extensão.

### Rotas avaliadas

| Rota | Ganha em | Perde em |
|---|---|---|
| Favorito + janela | nada a instalar além de arrastar; nenhuma loja; código fixo e pequeno do lado do SIGAA | janela pode ficar atrás do Chrome; depende de o SIGAA não cortar a ligação entre janelas (COOP) |
| Extensão, painel lateral do Chrome | painel acoplado à direita, que não se esconde nem cobre a planilha; atualiza sozinha; com `activeTab` só age quando clicada | loja, revisão, conta de desenvolvedor; máquina institucional pode bloquear extensões; o painel mora em outra origem e não enxerga a base do Adsum sem uma segunda ponte |
| Colar o texto da planilha no Adsum | nada do lado do SIGAA; é o padrão que o Adsum já usa para a página de participantes | só confere, não preenche; e só funciona se o texto copiado trouxer os valores (célula `<input>` não copia) |
| Favorito que carrega código do Adsum | favorito nunca precisa mudar | código remoto dentro de uma sessão autenticada do SIGAA: um Adsum comprometido leria tudo o que o professor vê. Descartada |
| Robô (Selenium/Playwright), POST direto, agente de IA | — | ver "O que já se tentou" e "As regras de segurança". Descartadas |

A extensão foi avaliada e recusada pelo autor em 24/09/2026. Se a janela
incomodar em uso real, o conserto é na janela e na barra do favorito, não
trocar de rota.

### Falhas que ficam baratas por construção

- **Sessão do SIGAA expira antes do Gravar.** O professor entra de novo,
  volta à planilha, favorito, Preencher. A conciliação é idempotente:
  refazer é o mesmo gesto, sem risco de duplicar.
- **Duas abas do SIGAA abertas.** O JSF se confunde com isso. A folha avisa
  quando a leitura não bate com a última conferência daquela turma, e o
  Gravar continua sendo do professor.
- **Pasta do cofre sem permissão na janela.** A janela não pede permissão
  de pasta: a linha de auditoria fica no IndexedDB e o Adsum principal leva
  para `sigaa/<turma>.csv` na próxima vez que abrir — o que pode esperar,
  espera.

## 50 ou 60 minutos

O manual da UFPE diz "bloco de aula (60 minutos)"; a captura herdada da UFRN
diz 50. **Para o SIGAA tanto faz: aula é aula**, e dez aulas de 50 minutos
são dez faltas (autor, 24/09/2026). O único lugar onde a duração entra é
`periodosDoBloco` (`nucleo/faltas.ts`), que *deduz* a quantidade de aulas
dividindo a duração do bloco por 50 — um bloco cadastrado como 13h–16h (três
aulas de 60) vira 4. Só importa se alguma grade tiver bloco assim, e a v2 não
depende disso: lê a quantidade da própria planilha.

## Navegador

O Adsum abre a janela no navegador em que o favorito foi clicado. No
Chrome/Edge, janela e app instalado dividem a mesma base. **No Safari, o app
instalado tem armazenamento próprio**: a janela aberta pelo favorito veria
uma base vazia. Tem que detectar e dizer, não mostrar "nada a lançar".

## A experiência

A regra da casa vale aqui: uma ação óbvia por tela, a navegação decorre do
estado, nada de configuração à vista.

**Uma vez só, nos Ajustes do Adsum:** um cartão "Lançar no SIGAA" com o
favorito para arrastar à barra e três desenhos do caminho. É a única
instalação.

**No Adsum, no dia a dia:** o cartão da turma ganha uma linha de apoio que
decorre do estado — "3 aulas ainda não conferidas no SIGAA", ou "Conferido
com o SIGAA até 21/10". Sem botão: o gesto está do outro lado, onde o Gravar
mora.

**Na planilha do SIGAA, favorito → janela do Adsum.** Uma folha (`Sheet`),
um título que diz o estado, cartões no molde Mushroom:

- *Tudo confere* — um visto e "SIGAA e Adsum iguais em 12 aulas". Um botão:
  Fechar.
- *Há o que lançar* — um cartão por aula (dia, presentes, faltas), todos
  marcados; desmarcar um dia é deixá-lo de fora. Diferenças num cartão
  amarelo acima, com nome, dia e os dois valores, e a frase que tira a
  dúvida: "o SIGAA fica como está". Detalhes informativos (sem par, sem onde
  lançar) recolhidos numa linha. Um botão de ação: **Preencher 3 aulas**; ao
  lado, Só conferir.
- *Recusa* — página que não é a planilha, turma que não casa, base vazia
  neste navegador. Uma frase do que houve e do que fazer; nunca uma tela de
  "nada a lançar" que mente.

**De volta ao SIGAA:** células preenchidas em azul, diferenças em amarelo e
intocadas, e uma barra discreta do Adsum no pé: "Adsum preencheu 3 aulas.
Azul é o que mudou. Confira e clique em Gravar Frequências." com
**Desfazer**, que devolve cada célula ao valor lido antes, idêntico. Passar
o mouse numa célula azul diz "Adsum: ausente, 2 faltas. Antes: vazia".

**Depois do Gravar:** favorito de novo, e a folha abre em *Tudo confere*.
É isso que atualiza a linha de apoio do cartão da turma.

**Auditoria** (decidido pelo autor, 24/09/2026: arquivo próprio,
`sigaa/<turma>.csv`, fora do diário técnico). Cada conferência, cada
preenchimento e cada "Aceitar o SIGAA" acrescenta uma linha — quando, turma, dia da aula, matrícula, valor lido, valor
proposto, se foi preenchido —, append-only como o resto. Sem nome. É o que
responde "quem pôs essa falta aqui?" semanas depois: o Adsum propôs, ou o
professor digitou.

## Camadas, do micro ao macro

Cada camada tem especificação escrita **antes** do código — com exemplos que
viram os testes — e só se apoia na de baixo, já provada. Nada de uma camada
de cima conserta defeito de uma de baixo.

1. **Tipos e invariantes.** `LeituraPlanilha`, `Celula` (vazia, lançada com
   n, bloqueada com motivo), `Relatorio`, `Instrucao`. Estado impossível não
   é representável: não existe célula "bloqueada com valor".
2. **Leitura da página.** HTML → `{ leitura, problemas }`, função pura,
   nunca lança exceção, nunca descarta linha em silêncio. Testada contra as
   fixtures anonimizadas.
3. **Conciliação.** `(leitura, eventos, vínculos) → Relatorio`, pura. Leis
   que valem para qualquer entrada, testadas em massa, não só por exemplo:
   - *partição* — toda célula cai em exatamente uma categoria, e as contas
     fecham com linhas × dias;
   - *nunca toca lançado* — nenhuma instrução para célula já lançada;
   - *nunca inventa dia* — nenhuma instrução para dia sem chamada;
   - *faixa* — todo valor em 0…máximo do dia; presente é 0, ausente é o
     máximo;
   - *idempotência* — aplicar as instruções e conciliar de novo dá zero a
     lançar.
4. **Instruções.** Relatório + escolhas do professor → lista de
   instruções, e um validador da lista. O mesmo validador roda dos dois
   lados da mensagem.
5. **Protocolo.** Mensagens com versão, origem conferida nos dois sentidos,
   um identificador por uso, prazo para responder. Testado com duas janelas
   em jsdom.
6. **Favorito.** Aplicar, pintar, desfazer. Lei: desfazer devolve a página
   ao valor lido, célula por célula. Recusa mensagem malformada.
7. **Folha do Adsum.** jsdom contra o `RepositorioDexie` de verdade, como
   toda tela.
8. **Jornada completa.** Fixture da planilha + base real + favorito:
   conferir → preencher → "gravar" (a fixture recarregada com os valores
   novos) → conferir dá *Tudo confere*. Sobre cofre com histórico, nunca
   base limpa.
9. **Ensaio real.** Roteiro novo no `07`: primeiro só conferência, numa
   turma real, com o professor ao lado.

## Ordem de chegada

1. **Capturar o HTML** da planilha (antes e depois de Gravar, com dia verde,
   trancado e cancelado se houver) e da tela de um dia. Fora do repositório.
2. **Anonimizador** (`scripts/anonimizar_sigaa.py`, irmão do
   `anonimizar_cofre.py`): troca nomes e matrículas por gente inventada e
   recusa gravar se sobrar dado original. Só o resultado vira fixture.
3. **Núcleo e testes** contra a fixture: leitura da página, conciliação,
   instruções. Função pura em `nucleo/`, como `sigaa.ts`.
4. **Conferência só de leitura no ar primeiro.** Risco zero de escrita, e
   semanas de páginas reais passando pelo parser antes de ele escrever uma
   célula. O professor continua lançando à mão.
5. **Preencher**, depois de o NTI saber, com ensaio numa turma real e o
   professor ao lado.

## O que o HTML precisa responder

1. Célula vazia e célula `0` são distinguíveis? (é o que separa "a lançar"
   de "presente")
2. As células são `<input>`? Com `name` ligado à matrícula, ou à linha?
3. Onde está o máximo de faltas de cada dia? (código de horário, atributo,
   script da página)
4. Como a página marca dia já lançado, cancelado, feriado, trancado,
   matriculado depois?
5. Mudar uma célula dispara evento (`onchange`, a4j) de que o SIGAA depende
   para gravar?
6. O Gravar envia só dias mexidos ou a planilha inteira? O que ele faz com
   célula vazia?
7. Qual a mensagem de sucesso, e qual a de erro?
8. O SIGAA manda cabeçalho `Cross-Origin-Opener-Policy`? Se mandar
   `same-origin`, a janela aberta pelo favorito perde a ligação com a
   página e o `postMessage` não tem para onde voltar. Plano B, se for o
   caso: a folha do Adsum copia as instruções e o favorito as lê num
   segundo clique.

[m1]: https://manuaisdesistemas.ufpe.br/index.php/Lan%C3%A7ar_Frequ%C3%AAncia
[m2]: https://manuaisdesistemas.ufpe.br/index.php/Lan%C3%A7ar_Frequencia_em_Planilha
[fc]: https://github.com/filipecalegario/auto-sigaa
[nt]: https://github.com/devmagary/notinhas
[su]: https://github.com/zebedelu/SIGAAutils
[sh]: https://github.com/ernestosrf/sigaa-horarios-extension
[ps]: https://www.ufpe.br/documents/38982/806616/PoSIC+-+Vers%C3%A3o+para+o+Portal.pdf/2cc2ed7b-0cfa-4c1e-9a59-59084c6ba691
