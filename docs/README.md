# docs/

Um documento por assunto, numerado. O `CLAUDE.md` da raiz guarda só as regras
que valem agora; aqui mora o raciocínio, o estado de cada frente e o que ainda
não foi decidido.

Cada documento diz no topo **o que ele é**: referência viva (descreve o que
está no ar e muda junto com o código), registro (conta o que aconteceu, e não
se reescreve) ou especificação (o que ainda não existe). Um documento que
deixou de descrever a realidade ganha uma nota no topo dizendo o que mudou e
onde está a versão atual, em vez de ser apagado: a data em que uma ideia
envelheceu também é informação.

## Por onde começar

| Pergunta | Documento |
|---|---|
| Onde o projeto está e o que vem depois | [`00_roadmap.md`](00_roadmap.md) |
| Onde os dados moram, e por que a pasta é a dona | [`01_cofre.md`](01_cofre.md) |
| O que tem em cada arquivo da pasta | [`02_formato.md`](02_formato.md) |
| Por que a tela é como é | [`03_visual.md`](03_visual.md) |
| Por que tal coisa é assim (na ordem em que aconteceu) | [`04_historico.md`](04_historico.md) |
| Como o código está organizado, e o que ele garante sob carga | [`10_codigo.md`](10_codigo.md) |
| Isso já foi resolvido? | [`06_falhas_em_sala.md`](06_falhas_em_sala.md) |
| Vai publicar uma versão | [`07_ensaio_antes_da_aula.md`](07_ensaio_antes_da_aula.md) |
| A v2, lançar no SIGAA | [`08_lancar_no_sigaa.md`](08_lancar_no_sigaa.md) e [`09_esboco_da_janela.md`](09_esboco_da_janela.md) |
| Em quantos por cento está a v2 | [`11_roteiro_v2.md`](11_roteiro_v2.md) |
| Como a planilha do SIGAA funciona por dentro | [`12_planilha_sigaa.md`](12_planilha_sigaa.md) |
| Dois professores na mesma aula do SIGAA | [`13_dia_compartilhado.md`](13_dia_compartilhado.md) |

## Todos

| Doc | Tipo | O que é |
|---|---|---|
| [`00_roadmap.md`](00_roadmap.md) | vivo | Os passos do projeto, o que está feito, o que está congelado e o que vem |
| [`01_cofre.md`](01_cofre.md) | vivo | A pasta como dona dos dados, o chaveiro de sais, o prazo do Safari, os caminhos de ida e volta |
| [`02_formato.md`](02_formato.md) | vivo | O formato de cada arquivo do cofre, coluna por coluna |
| [`03_visual.md`](03_visual.md) | vivo | Valores medidos, som, movimento e as regras de tela |
| [`04_historico.md`](04_historico.md) | registro | Decisões datadas, de 18/08/2026 em diante. Só cresce |
| [`05_plano_execucao.md`](05_plano_execucao.md) | registro | A triagem de 15/09/2026 e as quatro fases que saíram dela. Todas encerradas; o que sobrou está no roteiro |
| [`06_falhas_em_sala.md`](06_falhas_em_sala.md) | vivo | Cada falha com aluno na frente: sintoma, causa, conserto e o teste que segura |
| [`07_ensaio_antes_da_aula.md`](07_ensaio_antes_da_aula.md) | vivo | O roteiro que roda depois de todo deploy |
| [`08_lancar_no_sigaa.md`](08_lancar_no_sigaa.md) | especificação | A v2, do micro ao macro. Em construção na branch (`11`), nada publicado |
| [`09_esboco_da_janela.md`](09_esboco_da_janela.md) | especificação | As telas da v2, desenhadas, e as perguntas que ainda são do autor |
| [`10_codigo.md`](10_codigo.md) | vivo | As camadas, o caminho de um crachá, as garantias sob carga, o porquê de cada módulo e a convenção de comentários |
| [`11_roteiro_v2.md`](11_roteiro_v2.md) | vivo | O passo a passo da v2 que não depende do HTML do SIGAA, com peso e andamento |
| [`12_planilha_sigaa.md`](12_planilha_sigaa.md) | vivo | A planilha e o calendário do SIGAA da UFPE, por dentro: modelo de dados, clique, coleta, salvamento automático |
| [`13_dia_compartilhado.md`](13_dia_compartilhado.md) | especificação | Aula com mais de um professor: o professor escolhe quanto vale a falta. E, guardadas, a soma sobre o número do outro, o livro-razão e o que a concorrência esconde |
| [`Adsum-manual-e-LGPD.docx`](Adsum-manual-e-LGPD.docx) | vivo | Manual do professor e descrição do tratamento de dados. Gerado por `scripts/gerar_manual.cjs`; o app baixa este arquivo da `main` |

As imagens (`arquitetura.png`, `cracha-para-hash.png`, `mapa-estados.png`,
`esboco_sigaa/*.png`) saem de scripts em `scripts/`. Versiona-se o desenho,
nunca a captura.

## Regras para quem escreve aqui

- **Um assunto, um número.** O próximo é o `13_`. Um assunto novo que cabe num
  documento existente vai para ele.
- **Data absoluta, sempre.** "Ontem" e "semana passada" perdem o sentido no
  dia seguinte.
- **O histórico só cresce.** Correção a uma entrada antiga é uma entrada nova
  que aponta para ela.
- **O código não é diário.** Comentário diz o que garante e por quê, curto;
  a história vai para o `04_historico.md`, e o porquê longo para o
  `10_codigo.md`.
- **Documento vivo muda no mesmo commit que o código.** Se um conserto torna
  uma frase daqui falsa, a frase muda junto — é a mesma regra do `LEIA-ME.txt`
  da pasta, que tem teste amarrando o texto aos nomes reais dos arquivos.
- **Nenhum dado real de turma.** O repositório é público. Nomes, matrículas,
  hashes e sais de verdade só entram por `scripts/anonimizar_cofre.py`.
- **Documento que o app baixa não muda de lugar.** `MANUAL_URL`
  (`nucleo/cofre.ts`) aponta para `docs/Adsum-manual-e-LGPD.docx` na `main`.
