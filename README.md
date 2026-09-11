<div align="center">

<img src="public/icone-512.png" alt="" width="104">

# Adsum

**Chamada por crachá, sem servidor, sem conta, sem login.**
Os dados ficam numa pasta do computador do professor — e é dela que tudo volta.

[**Abrir o app**](https://willianrupert.github.io/adsum/) ·
[**Ver todas as telas**](https://willianrupert.github.io/adsum/#/vitrine) ·
[**Manual e LGPD**](docs/Adsum-manual-e-LGPD.docx)

[![publicar](https://github.com/willianrupert/adsum/actions/workflows/publicar.yml/badge.svg)](https://github.com/willianrupert/adsum/actions/workflows/publicar.yml)
![vitest + jsdom](https://img.shields.io/badge/testes-vitest%20%C2%B7%20jsdom-0071e3)
![sem dependências de runtime](https://img.shields.io/badge/rede-nenhuma-1d1d1f)

</div>

---

O aluno encosta o crachá, a presença é registrada, e no fim da aula existe uma
planilha. Feito para o Centro de Informática da UFPE, em parceria com o
**Prof. Paulo Freitas de Araújo Filho**.

O que torna o problema interessante não é ler um crachá — é que **a promessa de
"dados 100% locais" é a mesma coisa que a promessa de perder tudo**. Boa parte
das decisões abaixo nasce dessa tensão.

## O que se resolveu, e como

**A base não pode se perder.** Se tudo vive no IndexedDB de um navegador, trocar
de computador ou limpar os dados do site apaga o cadastro da turma inteira —
recadastrar 49 alunos é inaceitável. A saída foi inverter a posse: o professor
escolhe uma **pasta de verdade** ([File System Access][fsa]), e é ela que manda.
O IndexedDB vira cache. Limpar dados do site apaga o handle, **não a pasta** — o
professor a reescolhe e a base inteira é reconstruída. Se a pasta estiver no
iCloud ou no Drive que ele já usa, a cópia fora da máquina vem de graça, sem
servidor nenhum.

Há um teste que **apaga o cache e prova a reconstrução**. É o que separa "cofre"
de "mais um backup".

**O crachá não pode virar identificador.** Só o número de série público é lido —
nunca autenticando setores, nunca tocando em Crypto1. E ele não é guardado:

<div align="center"><img src="docs/cracha-para-hash.png" alt="crachá → sal → SHA-256 → uid_hash" width="700"></div>

O sal existe por uma razão precisa: sem ele, o espaço de números de série é
pequeno o bastante para se testar inteiro em segundos, e o resumo seria o crachá
com outra roupa — quem obtivesse a planilha poderia **clonar crachá**. Com ele,
não.

**O registro não pode ser reescrito.** O log é somente-acréscimo, com
`evento_id` como chave de idempotência: reimportar o mesmo arquivo não duplica
linha. A porta `Repositorio` **não tem** `atualizarEvento` nem `removerEvento` —
se a assinatura não existe, o bug não se escreve.

**Mas o crachá pode errar, e isso precisa de conserto sem mentira.** Confirmar
um crachá desconhecido para a pessoa errada, ou passar duas vezes na pressa —
nenhum dos dois se apaga, os dois ganham um evento nascido pra desfazer o
efeito do outro sem tocar no que já foi escrito: `'Remover crachá'` na
chamada, `resultado: 'removido'` na planilha, e `rapido_demais` para o par que
chega a menos de 400 ms um do outro. Só-acréscimo não significa sem correção —
significa que a correção também vira linha.

**A tela não pode pedir decisão — nem fingir que decide sozinha.** Não há
menu: a rota é função pura do estado ([`nucleo/rota.ts`](src/nucleo/rota.ts)),
uma cascata de perguntas feitas na ordem em que importam. `'problema'` é
checada **duas vezes** — navegador quebrado no topo, leitor parado só depois
de turma e cronograma, porque digitar um horário não pede hardware nenhum. E a
cascata se resolve **sozinha**, duas vezes: a grade confere o relógio a cada
30 s e abre a próxima aula sem clique nem crachá, e um leitor que cai no meio
de uma chamada devolve a tela a `'problema'` sem perder a sessão — ela espera
no banco e reaparece assim que ele volta. `'cerimônia'`, a rota que sintetiza
o crachá do professor pro primeiro dia, nunca chega a virar tela: ela mesma se
resolve no instante seguinte.

<div align="center"><img src="docs/mapa-estados.png" alt="A cascata de decidirRota: problema → pasta → navegador → turma → cronograma → problema outra vez → cerimônia/chamada/pronto, com a grade e o leitor fechando os dois laços sozinhos" width="880"></div>

## Arquitetura

<div align="center"><img src="docs/arquitetura.png" alt="ui → portas → nucleo, com adaptadores trocáveis" width="820"></div>

Portas e adaptadores não é cerimônia aqui: **o leitor já mudou duas vezes.**
Começou num aparelho ESP32 que morreu, hoje é um dongle USB que se apresenta
como teclado, e o Web NFC no Android já está adiantado. Trocar o mundo inteiro
embaixo do domínio não custou uma regra.

```
src/
  nucleo/       domínio puro — UID, hash, sessão, grade, rota, CSV. Sem React, sem Dexie.
  portas/       LeitorDeCracha, Repositorio
  adaptadores/  LeitorTeclado (dongle USB), LeitorWebNfc, LeitorSimulado, RepositorioDexie
  ambiente/     capacidades do navegador, pasta, sincronia, som, preferências
  ui/           telas
```

[`src/ui/adsum.ts`](src/ui/adsum.ts) é o **único** lugar que escolhe adaptadores.
Tela que importa `RepositorioDexie` direto é bug de camada.

## Rodar

```bash
npm install && npm run dev
```

Sem hardware, ligue o **modo de ensaio** nos Ajustes: aparecem o leitor
simulado e as teclas <kbd>espaço</kbd> (próximo crachá) e <kbd>P</kbd> (crachá do
professor), que percorrem o fluxo inteiro. Ele vem desligado, e a fronteira é
essa: *se existe para provar que o programa funciona, é ensaio; se existe para
descobrir por que não funcionou, é diagnóstico — e diagnóstico é de produção.*

```bash
npm test     # o núcleo e as telas
npm run build
```

**As telas se testam em jsdom contra o `RepositorioDexie` de verdade**, sem
dublê. Dublê que concorda com tudo é como se descobre tarde que a tela e o
adaptador discordavam — botão morto, `<td>` com `display:flex`, corrida de
presença: todos os defeitos achados até aqui eram desse tipo.

## Documentação

| | |
|---|---|
| [**Manual e LGPD**](docs/Adsum-manual-e-LGPD.docx) | Para o professor e para a instituição. Uso, e a descrição do tratamento de dados campo por campo |
| [`CLAUDE.md`](CLAUDE.md) | O contrato do projeto: regras que não se quebram, decisões e o que elas custaram |
| [`docs/00_roadmap.md`](docs/00_roadmap.md) | Os passos do projeto, cada um terminando em algo que já roda no navegador |
| [`docs/01_cofre.md`](docs/01_cofre.md) | O cofre em pasta, o prazo do Safari, e o bug do sal que perdia as pessoas |
| [`docs/02_formato.md`](docs/02_formato.md) | O formato dos arquivos, decidido do zero |
| [`docs/03_visual.md`](docs/03_visual.md) | Os valores medidos da linguagem visual da Apple |
| [`docs/04_historico.md`](docs/04_historico.md) | Histórico de decisões datado — o porquê de cada mudança, na ordem em que aconteceu |

Comentário aqui explica **por quê**, não o quê — e registra o que a decisão
custou. Boa parte do raciocínio mora no código, não em documento à parte.

## Privacidade, em uma linha cada

- Nenhum dado sai do computador sem gesto explícito do professor
- Sem telemetria, sem analytics, sem fonte remota, sem CDN — o `runtimeCaching`
  do service worker é vazio de propósito
- O login do SIGAA **não é lido**: é credencial de acesso, e credencial não entra
  em arquivo de frequência. A matrícula identifica sem destravar nada
- Dado real de turma nunca entra no repositório. Os testes usam gente inventada
  na forma exata da página real, e as ilustrações são **desenhadas** por script —
  versiona-se o desenho, nunca a captura

## Estado

Funciona de ponta a ponta e está publicado. O dongle já foi conferido com
hardware de verdade — decimal de 10 dígitos, big-endian, com o ritmo real
medido entre caracteres — e há teste automatizado provando isso do teclado até
o UID. Falta comparar o UID que o celular entrega, pelo Web NFC, com o que o
dongle lê no mesmo crachá: pilhas NFC divergem nisso, e o problema apareceria
na frente da turma.

<div align="center">

**·**

<sub><i>Adsum</i> — o que se responde na chamada.</sub>

</div>

[fsa]: https://developer.mozilla.org/en-US/docs/Web/API/File_System_API
