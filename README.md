# Adsum

Frequência em sala de aula sem que ninguém precise pensar nela.

Do latim *adsum* — "estou presente". A primeira pessoa é deliberada: quem
declara presença é o aluno, não o sistema.

## O problema

Chamada oral custa dez minutos de uma aula de cinquenta. Lista que circula é
assinada por quem não veio. Aplicativo de presença exige que sessenta pessoas
instalem algo, criem conta e lembrem a senha.

## A decisão

O crachá que o aluno já carrega, encostado num leitor que já está na mesa.

O professor abre a aula encostando o dele; os alunos encostam o seu; o professor
fecha encostando de novo. **Zero toques na tela numa aula normal** — e esse
número é critério, não slogan: se uma aula comum exigir um clique, o desenho
falhou.

| Situação | Toques |
|---|---|
| Aula normal, começo ao fim | **0** |
| Cadastrar um aluno | 1 — o crachá dele |
| Primeira configuração | 2 — escolher a pasta, colar a turma |

## Como se sustenta

**Sem servidor, sem conta, sem rede.** É um PWA que roda no navegador do
professor e guarda tudo numa pasta do computador dele. Não há o que manter no ar
nem o que quebrar sozinho quando ninguém olha — para um projeto voluntário, essa
é a única parte que exigiria manutenção perpétua.

**Só o UID público do crachá é lido.** Nunca se autentica setor, nunca se toca
em chave. Essa fronteira é o que mantém o projeto legítimo dentro da
universidade.

**O nome não trafega.** O que identifica é `SHA-256(sal ‖ uid)`, oito bytes. Sem
o sal, um UID de quatro bytes cai por força bruta em segundos — hash sem sal
seria o UID com outra roupa.

**Nada é reescrito, só acrescentado.** Registro de presença que pode ser
corrigido em silêncio não é registro.

## Estado

Em desenvolvimento, e em reavaliação de rumo. Funcionam hoje: leitura da página
`Turma › Participantes` do SIGAA com nome e login do CIn, a cerimônia de vínculo
crachá → aluno, a base local e o diagnóstico do navegador.

O desenho de interface e a persistência em pasta estão especificados e não
implementados — ver `docs/00_roadmap.md` e `docs/01_cofre.md`. O leitor é um
dongle USB; ler pelo celular Android com NFC funciona e é experimental.

```bash
npm install && npm run dev
```

```bash
npm test
```

## Origem

Antes disto houve um aparelho dedicado, com ESP32 e tela — `~/Projetos/Adsum`,
hoje descontinuado. Ele deixou herança boa (só o UID público, hash com sal, um
só nome armado por vez) e herança que não se sustenta sem o hardware. O
inventário dessa separação está em `CLAUDE.md`, e é a primeira coisa a resolver.

---

Willian Neves Rupert Jones · CIn/UFPE · `wnrj@cin.ufpe.br`
Parceria com o Prof. Paulo Freitas de Araújo Filho.
