# Adsum Web — contexto do projeto

Leia antes de qualquer tarefa. Leia também `../Adsum/CLAUDE.md`: as regras do
aparelho valem aqui, e este arquivo só registra o que é específico do app.

## O que é

PWA que roda no navegador do professor e guarda tudo localmente. Companheiro do
Adsum A1 e sucessor de `Adsum/computador/vincular.html`. Sem servidor, sem
conta, sem login.

Pilha: React + Vite + TypeScript + Dexie, publicado no GitHub Pages.

## Regras que não devem ser quebradas

Herdadas do aparelho (justificativa em `../Adsum/CLAUDE.md`):

- **Só o UID público.** Nunca autenticar setores, nunca tocar em Crypto1.
- **UID é campo de tamanho variável** — 4, 7 ou 10 bytes. Código que assume 4
  quebra na frente da turma, não no teste.
- **Nada é reescrito — apenas append.** Vale para eventos.
- **`uid_hash` = 8 primeiros bytes de SHA-256(sal ‖ uid).**
- **Sem hora confiável, a sessão não abre.**
- **O nome não trafega.** Sai `uid_hash`; a planilha resolve.

Específicas do app:

- **Nenhum dado sai do aparelho sem gesto explícito do professor.** Não existe
  telemetria, analytics, fonte remota nem CDN. O `runtimeCaching` do service
  worker é vazio de propósito.
- **A porta `Repositorio` não ganha `atualizarEvento` nem `removerEvento`.** Se
  a assinatura não existe, o bug não se escreve.
- **`src/ui/adsum.ts` é o único lugar que escolhe adaptadores.** Tela que
  importa `LeitorSimulado` ou `RepositorioDexie` diretamente é bug de camada.
- **O firmware é a fonte da verdade dos formatos e do protocolo CDC.** Divergiu,
  o firmware está certo — é ele que grava o CSV que a planilha consome. Os
  testes de `nucleo/csv.ts` usam as linhas literais dos documentos do firmware:
  se o app deixar de conversar com o aparelho, `npm test` quebra.
- **Leitura de CSV nunca descarta linha em silêncio.** Toda função devolve
  `{ itens, problemas }`, e a tela mostra linha, conteúdo e motivo. É a mesma
  regra da recusa muda: 46 alunos onde deveria haver 48, sem explicação, é bug.

## Convenções

- Documentação, comentários **e identificadores de domínio** em português. É
  divergência deliberada do `../Adsum/CLAUDE.md`, que pede identificadores em
  inglês: aqui as duas portas se chamam `LeitorDeCracha` e `Repositorio`, e
  metade em cada idioma seria pior que qualquer das duas escolhas inteiras.
- Comentário explica **por que**, não o quê. Preferência por registrar a
  decisão e o que ela custou.
- Um documento por assunto em `docs/`, numerado.

## Arquitetura

Portas e adaptadores, porque **o leitor vai mudar**:

```
nucleo/       domínio puro — UID, hash, tipos, CSV. Sem React, sem Dexie.
portas/       LeitorDeCracha, Repositorio
adaptadores/  LeitorSimulado, LeitorWebNfc, RepositorioDexie  (falta WebSerial)
ambiente/     capacidades do navegador, entrada e saída de arquivo
ui/           telas
```

`src/ui/adsum.ts` guarda a lista `LEITORES`. Adaptador novo entra ali e aparece
sozinho na escolha do diagnóstico — nenhuma tela precisa saber que ele existe.

`LeitorSimulavel` e `RepositorioApagavel` estendem as portas e ficam **fora**
delas de propósito: são ferramentas de diagnóstico, e o acesso passa por um
`ehSimulavel()` / `podeApagar()`. Leitor de verdade não implementa `SIMULAR`.

## Estado atual

Atualizado em 18/08/2026. **Passos 1 e 2 de 6 feitos**, mais o `LeitorWebNfc`
adiantado do passo 5 (ver `docs/00_roadmap.md`). `npm test`: 41 testes.

Verificado no navegador:

- as nove capacidades detectadas, com service worker controlando a página;
- leitura simulada percorrendo UID → `uid_hash` → vínculo, inclusive UID de
  7 bytes;
- a volta do baralho reencontrando UID já visto — é assim que se exercita
  duplicata sem ter dois crachás na mão;
- `semear` duas vezes sem duplicar evento. A idempotência por `evento_id` sai
  da chave primária do IndexedDB, não da intenção de quem chama;
- **offline de verdade**: com o servidor derrubado, o app recarrega inteiro do
  precache sob `/adsum/`, a base local sobrevive e o leitor continua
  respondendo;
- vínculo renomeado na tela sobrevive ao recarregamento — gravou no banco, não
  só no React;
- trocar para o `LeitorWebNfc` no desktop falha **dizendo o motivo** ("só o
  Chrome no Android tem"), e voltar para o simulado recupera o estado `lendo`;
- `semear` duas vezes não cria aula duplicada nem evento duplicado.

Pendente de verificação visual: o layout abaixo da primeira dobra — foi
conferido pelo texto do DOM, não a olho.

## Pendências abertas

- **Sal de frota.** O campo de importar já existe no Repositório, mas ninguém
  copiou o sal de um A1 real ainda — o comando `SAL` do protocolo CDC é do
  passo 5.
- **`LeitorWebNfc` não foi medido com crachá.** Web NFC cobre NFC Forum tipo
  1–5; o crachá é Mifare Classic. Se o Chrome no Android entregar o
  `serialNumber` mesmo assim, um professor registra presença sem aparelho — e
  isso resolve a etapa 3 do roteiro (demo sem hardware). Se não entregar, o
  contador `tags sem UID legível` sobe e a resposta é não. Precisa de: publicar,
  abrir no Android, encostar o crachá.
- **A coluna `login` de `registros.csv` sai vazia.** O vínculo guarda só
  `hash → nome`. Confirmar com o firmware o que ele põe ali.
- **Armazenamento persistente costuma ser recusado** enquanto o app não é
  instalado. Sem ele o navegador pode apagar a base sob pressão de espaço — por
  isso o diagnóstico mostra o estado e oferece o botão de pedir.
- **`base` do Vite é `/adsum/`**, para `github.com/willianrupert/adsum`. A pasta
  local continua `Adsum_web` — nome de pasta e nome de repositório não precisam
  bater, e o do site é o que aparece na URL. Renomear o repositório sem ajustar
  `vite.config.ts` publica um site que não carrega nada.
- **O firmware ainda não é repositório.** Se um dia for, `adsum` já estará
  ocupado por este — o nome natural para ele é `adsum-a1`, que é a nomenclatura
  do próprio projeto: Adsum é o sistema, Adsum A1 é o aparelho.
