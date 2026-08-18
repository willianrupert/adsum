# Adsum Web

Frequência em sala por leitura de crachá, no navegador. Companheiro do
**Adsum A1** (o aparelho) e sucessor de `Adsum/computador/vincular.html`.

Do latim *adsum* — "estou presente".

## O que ele é

Um PWA que roda no GitHub Pages e guarda **tudo no aparelho de quem abriu**:
IndexedDB para a base, File System Access para entrar e sair em CSV. Não há
servidor, conta, login nem envio. É o que dispensa termo de uso, banco de dados
para manter e conversa com a Gerinfra — e é a razão de ele poder existir sendo
projeto voluntário.

## Estado

**Passos 1, 2 e 3 de 6 — feitos**, e metade do 5 adiantada.
Ver `docs/00_roadmap.md`.

Três telas:

- **Diagnóstico** — o que este navegador oferece, o leitor (simulado ou WebNFC)
  e a base local com contagens, espaço e persistência.
- **Vínculo** — a cerimônia: cola a lista do SIGAA, arma um nome por vez, o
  aluno confere e encosta o crachá.
- **Repositório** — vínculos e grade horária com edição, importação e exportação
  em CSV **nos formatos do cartão**, registros e o sal.

**O crachá do CIn é lido pelo Chrome no Android** — medido em 18/08/2026 com
crachá de verdade. Ainda falta confirmar que esse UID bate byte a byte com o que
o PN532 entrega.

`npm test` cobre UID, hash, os três CSVs e o encurtamento de nomes — incluindo
as linhas literais que aparecem nos documentos do firmware.

Publicado em `willianrupert.github.io/adsum/`.

## Rodar

```bash
npm install
npm run dev
```

```bash
npm run build && npm run preview
```

```bash
npm test
```

## Como está montado

Portas e adaptadores, e não por gosto de arquitetura: o leitor vai mudar. Hoje
o UID vem de um baralho virtual, amanhã vem do Adsum A1 por WebSerial ou de
WebNFC no celular. Quem consome uma leitura não sabe a diferença.

```
src/
  nucleo/       domínio puro — UID, hash, tipos. Sem React, sem banco.
  portas/       LeitorDeCracha e Repositorio — os dois contratos
  adaptadores/  LeitorSimulado, RepositorioDexie
  ambiente/     o que este navegador sabe fazer
  ui/           telas; adsum.ts é o único lugar que escolhe adaptadores
```

Trocar de leitor é editar `src/ui/adsum.ts`, e só.

## Regras herdadas do aparelho

Valem aqui igual, e o código as reflete na forma, não em comentário:

- **Só o UID público é lido.** Nunca autenticar setores, nunca tocar em Crypto1.
- **UID é campo de tamanho variável** — 4, 7 ou 10 bytes.
- **Registros são append-only.** A porta `Repositorio` não tem `atualizarEvento`.
- **`uid_hash` = 8 primeiros bytes de SHA-256(sal ‖ uid).** Sem sal, hash de UID
  de 4 bytes cai por força bruta em segundos.
- **Sem hora confiável, a sessão não abre.**

## Relação com o repositório `Adsum`

O firmware é a fonte da verdade dos formatos (`alunos.csv`, `grade.csv`,
`registros.csv`) e do protocolo CDC. Divergiu? O firmware está certo — é ele que
grava o que a planilha consome.

---

Willian Neves Rupert Jones · CIn/UFPE · `wnrj@cin.ufpe.br`
