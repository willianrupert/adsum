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
`(Perfil)` e docente de `Departamento:`; professor primeiro na ordem, para que
cerimônia interrompida no meio já tenha o essencial feito.

Feito: `nucleo/nomes.ts` é porte direto do `vincular.html`, **com as tabelas de
avanço das fontes do firmware**, e tem teste para cada regra — sufixo de
linhagem preservado, partícula descartada, colisão desempatada, e os dois
limites (210 px na coluna, 31 bytes no buffer). A tela arma um nome por vez,
recusa crachá já vinculado dizendo de quem é, e permite armar de novo um nome
já feito, porque segunda via existe.

Medida que ficou registrada no teste: **"Amanda Nascimento" ocupa 209 dos 210
pixels da coluna.** Nome comum já raspa o limite — é o número que explica por
que 47 dos 48 nomes reais não cabiam, e por que contar letras nunca resolveria.

## 4 · Sessão e coleta

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
