// Manual do Adsum, que é também a descrição do tratamento de dados.
//
// Um documento e não dois: o professor não lê dois, e a parte de LGPD fica mais
// convincente dentro do manual, porque as garantias não são promessas — são
// consequências de como o programa funciona, e ficam ditas no ponto em que
// acontecem.
//
// Versiona-se o gerador, e não só o .docx: os números e os nomes de arquivo aqui
// vêm do código, e quando o código mudar é aqui que se corrige. A ilustração sai
// de `gerar_diagrama.py` pelo mesmo motivo — desenho versionado, nunca captura,
// que é a regra que mantém dado real de turma fora de um repositório público.
//
//   node scripts/gerar_manual.cjs
//
// `.cjs` porque o package.json do app é `type: module` e a biblioteca `docx` é
// CommonJS. Renomear o arquivo é mais barato que converter o script inteiro.
//
// Precisa de `docx` (npm) e do PNG do diagrama ao lado do destino.

const fs = require('fs')
const path = require('path')

const RAIZ = path.join(__dirname, '..', 'docs')
const DIAGRAMA = path.join(RAIZ, 'cracha-para-hash.png')
const DESTINO = path.join(RAIZ, 'Adsum-manual-e-LGPD.docx')
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, PageBreak,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle, ImageRun,
  TableOfContents, LevelFormat, convertInchesToTwip,
} = require('docx')

const LARGURA = 9026 // A4 menos as margens padrão, em DXA
const AZUL = '0071E3'
const TINTA = '1D1D1F'
const FRACA = '6E6E73'
const CINZA = 'F5F5F7'

const p = (texto, o = {}) => new Paragraph({
  spacing: { after: 160, line: 276 },
  ...o,
  children: typeof texto === 'string' ? [new TextRun({ text: texto, size: 22 })] : texto,
})

const t = (texto, o = {}) => new TextRun({ text: texto, size: 22, ...o })

const h1 = (texto) => new Paragraph({
  text: texto, heading: HeadingLevel.HEADING_1,
  spacing: { before: 400, after: 200 },
})
const h2 = (texto) => new Paragraph({
  text: texto, heading: HeadingLevel.HEADING_2,
  spacing: { before: 320, after: 140 },
})

const item = (texto) => new Paragraph({
  numbering: { reference: 'pontos', level: 0 },
  spacing: { after: 100, line: 276 },
  children: typeof texto === 'string' ? [t(texto)] : texto,
})

/** Bloco de destaque: fundo cinza, sem borda. */
const destaque = (linhas) => new Table({
  columnWidths: [LARGURA],
  width: { size: LARGURA, type: WidthType.DXA },
  borders: ['top', 'bottom', 'left', 'right', 'insideHorizontal', 'insideVertical']
    .reduce((acc, k) => ({ ...acc, [k]: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } }), {}),
  rows: [new TableRow({
    children: [new TableCell({
      width: { size: LARGURA, type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, fill: CINZA, color: 'auto' },
      margins: { top: 200, bottom: 200, left: 240, right: 240 },
      children: linhas,
    })],
  })],
})

const tabela = (cabecalho, linhas, larguras) => new Table({
  columnWidths: larguras,
  width: { size: LARGURA, type: WidthType.DXA },
  rows: [
    new TableRow({
      tableHeader: true,
      children: cabecalho.map((c, i) => new TableCell({
        width: { size: larguras[i], type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, fill: CINZA, color: 'auto' },
        margins: { top: 120, bottom: 120, left: 160, right: 160 },
        children: [new Paragraph({ children: [t(c, { bold: true, size: 20 })], spacing: { after: 0 } })],
      })),
    }),
    ...linhas.map((linha) => new TableRow({
      children: linha.map((c, i) => new TableCell({
        width: { size: larguras[i], type: WidthType.DXA },
        margins: { top: 120, bottom: 120, left: 160, right: 160 },
        children: [new Paragraph({
          spacing: { after: 0, line: 260 },
          children: typeof c === 'string' ? [t(c, { size: 20 })] : c,
        })],
      })),
    })),
  ],
})

const mono = (texto) => new TextRun({ text: texto, font: 'Courier New', size: 20 })

const doc = new Document({
  creator: 'Adsum',
  title: 'Adsum — manual e descrição do tratamento de dados',
  description: 'Manual de uso do Adsum e descrição do tratamento de dados pessoais para fins de LGPD.',
  styles: {
    default: {
      document: { run: { font: 'Calibri', size: 22, color: TINTA } },
      heading1: { run: { font: 'Calibri', size: 34, bold: true, color: TINTA } },
      heading2: { run: { font: 'Calibri', size: 26, bold: true, color: TINTA } },
    },
  },
  numbering: {
    config: [{
      reference: 'pontos',
      levels: [{
        level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 360, hanging: 200 } } },
      }],
    }],
  },
  sections: [{
    properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
    children: [
      // ── Capa ──────────────────────────────────────────────────────────
      new Paragraph({ spacing: { before: 2600, after: 0 }, children: [
        t('Adsum', { size: 72, bold: true }),
      ]}),
      new Paragraph({ spacing: { after: 600 }, children: [
        t('Registro de frequência por crachá', { size: 30, color: FRACA }),
      ]}),
      new Paragraph({ spacing: { after: 120 }, children: [
        t('Manual de uso e descrição do tratamento de dados pessoais', { size: 24 }),
      ]}),
      new Paragraph({ spacing: { after: 600 }, children: [
        t('Centro de Informática — UFPE', { size: 22, color: FRACA }),
      ]}),
      destaque([
        p([t('Este documento serve a dois leitores. ', { bold: true }),
           t('Ao professor, é o manual: como cadastrar a turma, como dar a aula, o que fazer quando algo falha. À instituição — coordenação, encarregado de dados, quem perguntar —, é a descrição do que o programa faz com dado pessoal, em detalhe suficiente para ser conferida contra o código.')]),
        p([t('As duas leituras são a mesma porque as garantias de privacidade aqui não são promessas: são consequências de como o programa funciona. Elas estão descritas no ponto do manual onde acontecem.')],
          { spacing: { after: 0 } }),
      ]),
      new Paragraph({ children: [new PageBreak()] }),

      // ── Sumário ───────────────────────────────────────────────────────
      h1('Sumário'),
      new TableOfContents('Sumário', { hyperlinks: true, headingStyleRange: '1-2' }),
      new Paragraph({ children: [new PageBreak()] }),

      // ── 1 ─────────────────────────────────────────────────────────────
      h1('1. O que é o Adsum'),
      p('O Adsum registra a presença dos alunos em sala por leitura do crachá. O professor abre um site no navegador do próprio computador, um leitor USB na mesa lê os crachás, e cada leitura vira uma linha num arquivo de planilha.'),
      p('Três decisões definem o programa, e tudo o mais decorre delas.'),
      item([t('Não há servidor, conta nem login. ', { bold: true }), t('O programa roda inteiro dentro do navegador do professor. Não existe cadastro, não existe senha, e não existe um banco de dados central com a frequência de ninguém.')]),
      item([t('Os dados ficam no computador do professor. ', { bold: true }), t('Numa pasta escolhida por ele, em arquivos que ele pode abrir, copiar e apagar. O programa não envia nada para lugar nenhum.')]),
      item([t('O crachá não é identificado, é reconhecido. ', { bold: true }), t('O número do crachá nunca é guardado. O que fica gravado é um resumo criptográfico dele, e a seção 4 explica por que essa diferença importa.')]),
      p('O nome vem do latim: adsum é o que se responde na chamada.'),

      h2('O que o Adsum não é'),
      p('Não é um sistema institucional de frequência, não substitui o SIGAA e não conversa com ele. É uma ferramenta de sala de aula que produz uma planilha, e o que se faz com essa planilha continua sendo o processo de sempre.'),

      // ── 2 ─────────────────────────────────────────────────────────────
      new Paragraph({ children: [new PageBreak()] }),
      h1('2. Como se usa'),
      p('Não há menus. A tela decorre do que existe na base: sem turma cadastrada, a tela é cadastrar a turma; na hora da aula, a tela é a chamada. O professor nunca escolhe onde está.'),

      destaque([
        p([t('Todas as telas, numa página só. ', { bold: true }),
           t('Antes de cadastrar qualquer turma, dá para conhecer o Adsum inteiro em '),
           mono('willianrupert.github.io/adsum/#/vitrine'),
           t('. Os nomes ali são inventados e nada é gravado — é a maneira de ver, de uma vez, telas que de outro modo só apareceriam no meio de uma aula. Se alguma delas parecer confusa, é o melhor momento para dizer.')],
          { spacing: { after: 0 } }),
      ]),
      p(''),

      h2('2.1 Antes do primeiro dia'),
      p([t('Escolher onde guardar. ', { bold: true }), t('Na primeira abertura, o programa pede uma pasta do computador. É onde tudo vai viver. Se essa pasta estiver dentro do iCloud Drive ou do Google Drive que o professor já usa, a cópia fora da máquina passa a existir sozinha, sem que o Adsum fale com servidor nenhum.')]),
      p([t('Colar a turma. ', { bold: true }), t('No SIGAA, abrir '), mono('Turma › Participantes'), t(' e copiar a página inteira (Ctrl+A, Ctrl+C). No Adsum, colar. Ele lê os nomes e as matrículas, separa docentes de discentes pelas seções da própria página, e confere o total contra os números que a página declara — se a página diz '), mono('Discentes (47)'), t(' e ele encontrou 46, ele avisa qual linha não entendeu, em vez de seguir calado.')]),
      p([t('Cadastrar a grade. ', { bold: true }), t('Dia da semana e horário de cada turma. É opcional, mas é o que faz a chamada abrir sozinha na hora da aula.')]),

      h2('2.2 O primeiro dia'),
      p('No primeiro dia ninguém tem crachá vinculado, e é a própria chamada que faz o vínculo. O professor encosta o crachá dele primeiro — é o que abre a aula. Depois, um por vez, os alunos encostam o deles: a tela mostra de quem é a vez, o crachá encostado passa a ser daquela pessoa, e a presença é contada no mesmo gesto. Cadastrar e fazer a chamada são a mesma coisa.'),
      p('Um aluno pode ter mais de um crachá — segunda via, crachá antigo — e todos valem. Um crachá já vinculado a outra pessoa é recusado dizendo de quem é, e não em silêncio.'),

      h2('2.3 Um dia comum'),
      p('Com a grade cadastrada e o Adsum aberto, a chamada abre sozinha no horário. Não há clique nem crachá do professor. Sem grade, há um botão.'),
      p('Cada crachá encostado conta presença e mostra o nome. Encostar duas vezes não conta duas — a tela diz que já estava registrado. Um crachá que o programa não conhece abre uma busca por nome ali na hora: quem faltou no primeiro dia se cadastra no dia em que aparece, com a pessoa na frente.'),
      p('A tela responde na hora, e o bipe vem depois de o registro estar salvo. Os dois sinais significam coisas diferentes de propósito: o olho precisa de resposta imediata para a fila não parecer travada, e o som significa está gravado — não eu ouvi.'),

      h2('2.4 O fim da aula'),
      p('O professor encerra a chamada pelo botão ou encostando o crachá. A tela mostra quantas presenças foram registradas, em quanto tempo, e onde o arquivo está.'),
      p('Com pasta escolhida, não há passo nenhum: cada presença já foi gravada no disco no momento em que aconteceu. Sem pasta, salvar é a ação da tela — e enquanto houver aula por salvar, o programa cobra, na tela de espera e ao fechar a aba.'),

      // ── 3 ─────────────────────────────────────────────────────────────
      new Paragraph({ children: [new PageBreak()] }),
      h1('3. Onde os dados ficam'),
      p('A pasta escolhida é a dona dos dados. O navegador guarda uma cópia para funcionar rápido, mas é na pasta que as coisas existem: se o navegador for limpo, trocado ou apagado, é dela que tudo volta — o professor reescolhe a pasta e a base inteira é reconstruída.'),
      p('Dentro dela:'),
      tabela(
        ['Arquivo', 'O que é'],
        [
          [[mono('LEIA-ME.txt')], 'Explica a própria pasta: o que é cada arquivo, como recuperar tudo, e o aviso de que ali há dado pessoal.'],
          [[mono('config.json')], 'O sal desta instalação. É o que liga cada crachá ao seu dono. Sem ele, os outros arquivos voltam pela metade: os nomes aparecem e nenhum crachá é reconhecido.'],
          [[mono('vinculos.json')], 'Qual crachá é de quem — pelo resumo do crachá, nunca pelo número dele.'],
          [[mono('grade.json')], 'Os horários de aula.'],
          [[mono('turmas/')], 'A lista de cada turma, como veio do SIGAA.'],
          [[mono('registros/')], 'A chamada, uma linha por presença, em CSV. Estes arquivos só crescem: nada é reescrito nem apagado.'],
        ],
        [2400, 6626],
      ),
      p(''),
      p([t('Só o Chrome e o Edge oferecem escolher uma pasta. ', { bold: true }), t('É uma limitação dos outros navegadores, não do programa. No Safari e no Firefox os dados ficam dentro do navegador e a cópia depende de o professor exportar — e o Adsum diz isso na tela, em vez de deixar entender que estão guardados.')]),
      p([t('No Safari há prazo. ', { bold: true }), t('O WebKit apaga os dados de um site depois de sete dias de uso do navegador sem visita a ele. Instalar o Adsum (Arquivo › Adicionar ao Dock) tira o programa do Safari e do alcance dessa contagem. O Adsum avisa e ensina o caminho.')]),

      // ── 4 ─────────────────────────────────────────────────────────────
      new Paragraph({ children: [new PageBreak()] }),
      h1('4. Que dados o Adsum trata — e quais não'),

      h2('4.1 O que é lido do crachá'),
      p('O crachá do CIn é um cartão sem contato. Cartões desse tipo anunciam um número de série público na aproximação, antes de qualquer chave: é assim que o leitor sabe que há um cartão ali. É só esse número que o Adsum lê.'),
      item([t('Ele nunca autentica setores do cartão, nunca usa chaves e nunca lê o conteúdo gravado nele. ', { bold: true }), t('O que está dentro do crachá permanece fechado, e o Adsum não tem como abrir.')]),
      item('O número lido tem tamanho variável — 4, 7 ou 10 bytes, conforme o cartão.'),
      p('Esse número não é guardado. Ele é combinado com um sal e passa por uma função de resumo; o que fica gravado são os oito primeiros bytes do resultado.'),
      new Paragraph({ spacing: { before: 200, after: 200 }, alignment: AlignmentType.CENTER, children: [
        new ImageRun({ type: 'png', data: fs.readFileSync(DIAGRAMA), transformation: { width: 560, height: 139 } }),
      ]}),
      p([t('O sal é a peça que torna isso irreversível na prática. ', { bold: true }), t('Sem ele, o conjunto de números de série possíveis é pequeno o bastante para se testar inteiro em segundos, e o resumo seria o número do crachá com outra roupa. Com ele, quem obtiver um arquivo de registros não consegue recuperar o crachá de ninguém — e portanto não consegue clonar crachá a partir da planilha.')]),
      p('O sal é sorteado uma vez, por instalação, e nunca aparece na interface: não é mostrado, não é editável e não é copiável de dentro do programa. Ele viaja apenas dentro do arquivo que um professor entrega deliberadamente a outro.'),

      h2('4.2 O que vem da lista do SIGAA'),
      p('Da página de participantes, o Adsum lê duas coisas por pessoa: nome completo e matrícula. Guarda também um nome curto, montado do primeiro e do segundo nome, que é o que aparece na tela durante a chamada.'),
      destaque([
        p([t('O login do SIGAA não é lido nem guardado. ', { bold: true }),
           t('Ele aparece na mesma página, ao lado da matrícula, e o programa passa por ele de propósito. É credencial de acesso, e credencial de acesso não entra em arquivo de frequência nem viaja em planilha. A matrícula identifica a pessoa sem destravar nada.')],
          { spacing: { after: 0 } }),
      ]),
      p(''),
      p('Também não são lidos: e-mail, foto, curso, período, situação da matrícula — nada além de nome e matrícula, ainda que a página os mostre.'),

      h2('4.3 O que fica gravado, campo por campo'),
      p([t('Cada presença é uma linha em '), mono('registros/<turma>.csv'), t(', com estas colunas e nenhuma outra:')]),
      tabela(
        ['Coluna', 'Conteúdo', 'Por quê'],
        [
          [[mono('evento_id')], 'Identificador da linha', 'Reimportar o mesmo arquivo não duplica registro.'],
          [[mono('quando')], 'Data e hora com fuso', 'Data em formato local é como se perde uma turma.'],
          [[mono('turma')], 'Nome da turma', 'O arquivo continua sabendo de onde veio se for movido.'],
          [[mono('matricula')], 'Matrícula do aluno', 'É por ela que a chamada fecha na planilha.'],
          [[mono('nome')], 'Nome curto', 'Só para quem abrir o arquivo entender o que vê. Nenhum cálculo depende dele.'],
          [[mono('origem')], [mono('cracha, professor, manual')], 'Distingue presença lida de ação do professor.'],
          [[mono('resultado')], [mono('ok, duplicado, desconhecido')], 'O que não foi aceito também é registrado, e por quê.'],
          [[mono('uid_hash')], 'O resumo do crachá', 'Único jeito de resolver depois um crachá desconhecido.'],
        ],
        [1900, 2900, 4226],
      ),
      p(''),
      p('O arquivo nunca é reescrito: cada presença acrescenta uma linha. Corrigir um nome ou uma matrícula na base corrige as exportações seguintes sem alterar uma linha do que já foi registrado.'),

      h2('4.4 O que o programa deliberadamente não faz'),
      item('Não envia dado nenhum pela rede. Não há telemetria, não há analytics, não há fonte remota e não há CDN. O programa funciona offline, do começo ao fim.'),
      item('Não usa cookies de terceiros nem identificadores de publicidade.'),
      item('Não guarda o número do crachá, o login do SIGAA, e-mail ou foto.'),
      item('Não tem administrador, e não existe visão central: cada professor tem a sua base, no seu computador.'),
      item('Não apaga nem reescreve registro de presença — nem o próprio programa consegue, porque a operação não existe no código.'),

      // ── 5 ─────────────────────────────────────────────────────────────
      new Paragraph({ children: [new PageBreak()] }),
      h1('5. O tratamento, para fins de LGPD'),
      destaque([
        p([t('Este capítulo descreve o tratamento; não faz qualificação jurídica. ', { bold: true }),
           t('A base legal, a definição de quem é controlador e as decisões de retenção competem à instituição. O que está aqui é o levantamento factual sobre o qual essa análise pode ser feita, conferível contra o código-fonte, que é público.')],
          { spacing: { after: 0 } }),
      ]),
      p(''),

      h2('5.1 Finalidade'),
      p('Registro de frequência acadêmica dos alunos matriculados numa turma, para uso do professor responsável por ela. Não há finalidade secundária: os dados não alimentam avaliação de desempenho, estatística institucional, pesquisa ou qualquer outro uso.'),

      h2('5.2 Dados tratados e minimização'),
      tabela(
        ['Categoria', 'Dados', 'Origem'],
        [
          ['Identificação do aluno', 'Nome completo, nome curto, matrícula', 'Lista de participantes do SIGAA, colada pelo professor'],
          ['Identificação do crachá', 'Resumo criptográfico do número de série (8 bytes)', 'Leitura por aproximação, no momento da presença'],
          ['Registro de presença', 'Data, hora, turma, resultado da leitura', 'Gerado pelo programa'],
          ['Dados do professor', 'Nome, matrícula, resumo do crachá, horários de aula', 'Mesma lista e mesma leitura'],
        ],
        [2200, 3600, 3226],
      ),
      p(''),
      p('Não são tratados: número do crachá, login de acesso, e-mail, telefone, endereço, imagem, dados biométricos, geolocalização, nem qualquer categoria de dado sensível na acepção do art. 5º, II da Lei 13.709/2018.'),

      h2('5.3 Quem faz o quê'),
      p('Do ponto de vista prático, e sem prejuízo da qualificação que a instituição fizer:'),
      item([t('A instituição ', { bold: true }), t('define a finalidade — registrar frequência é obrigação acadêmica dela — e é quem determina o tratamento.')]),
      item([t('O professor ', { bold: true }), t('opera: escolhe onde os dados ficam, faz o cadastro, conduz a chamada e é quem tem acesso físico aos arquivos.')]),
      item([t('O Adsum ', { bold: true }), t('é a ferramenta. Não é um serviço, não tem operador remoto, não recebe nem transmite dado, e seu autor não tem acesso a base nenhuma.')]),
      p('Uma consequência que precisa estar dita: como os dados ficam no computador do professor, a segurança deles é a segurança daquele computador. Senha de tela, disco criptografado e cuidado com quem tem acesso à máquina valem aqui como valeriam para um diário de classe em papel guardado na gaveta.'),

      h2('5.4 Retenção e eliminação'),
      p('Não há retenção automática nem prazo embutido: os arquivos permanecem enquanto o professor os mantiver. A eliminação é um gesto dele — apagar a pasta apaga os dados, e apagar os dados do site apaga a cópia do navegador.'),
      p('Vale registrar o outro lado dessa mesma característica: como não há eliminação automática, definir por quanto tempo a frequência de um semestre deve ser guardada é decisão da instituição, e o programa não a toma por ninguém.'),

      h2('5.5 Compartilhamento'),
      p('Não há compartilhamento automático com ninguém — nem com o autor do programa, nem com a instituição, nem com terceiros. Não há transferência internacional, porque não há transferência.'),
      p('Todo compartilhamento é gesto explícito do professor: exportar a planilha e entregá-la a quem de direito. Há também uma função de passar os crachás vinculados a outro professor; ela leva o sal junto, necessariamente, e a tela avisa que o arquivo liga crachás a pessoas e merece o mesmo cuidado que a lista da turma.'),

      h2('5.6 Segurança'),
      item('O número do crachá não é armazenado em momento algum — apenas seu resumo com sal, do qual não se volta.'),
      item('O sal é sorteado por instalação, não é exibido nem exportável pela interface, e sem ele os resumos são inúteis para reidentificar um crachá.'),
      item('Os dados não trafegam: não há conexão de rede depois que a página carrega.'),
      item('O registro é somente-acréscimo, o que torna a adulteração silenciosa de um histórico de presença mais difícil do que numa planilha comum.'),
      item('O programa é de código aberto: qualquer afirmação deste documento pode ser conferida na fonte.'),

      h2('5.7 Direitos dos titulares'),
      p('Os pedidos previstos nos arts. 18 e seguintes da LGPD são atendidos pelo professor, com os meios que o programa oferece:'),
      tabela(
        ['Direito', 'Como se atende'],
        [
          ['Confirmação e acesso', 'A planilha da turma é legível em qualquer editor de planilhas; o professor pode extrair as linhas de um aluno.'],
          ['Correção', 'Nome e matrícula são editáveis na base. A correção vale para as exportações seguintes.'],
          ['Eliminação', 'O vínculo de um crachá pode ser removido. Os registros de presença já feitos são somente-acréscimo — eliminá-los é apagar o arquivo, decisão que envolve a obrigação de guarda da instituição.'],
          ['Portabilidade', 'Os arquivos são CSV e JSON abertos, sem formato proprietário.'],
          ['Informação sobre compartilhamento', 'Não há compartilhamento automático. Este documento é a resposta.'],
        ],
        [2400, 6626],
      ),

      // ── 6 ─────────────────────────────────────────────────────────────
      new Paragraph({ children: [new PageBreak()] }),
      h1('6. Quando dá errado'),
      p('O programa foi escrito partindo de que falha calada é o pior defeito possível. O que ele faz quando algo não vai bem:'),
      tabela(
        ['Situação', 'O que acontece'],
        [
          ['A lista colada não foi entendida por inteiro', 'Ele diz qual linha, com o conteúdo e o motivo. Nunca descarta em silêncio: 46 alunos onde deveria haver 48, sem explicação, é defeito.'],
          ['A pasta não recebeu a gravação', 'Aviso permanente no canto e um caminho de conserto. O dado continua no navegador até a pasta voltar — nada se perde.'],
          ['Há aula por salvar', 'A tela de espera cobra, com turma e quantidade, e o navegador avisa se a aba for fechada.'],
          ['O leitor não está lendo', 'A tela diz, em vez de esperar um crachá que não vai chegar. O diagnóstico mostra a última leitura crua.'],
          ['Trocou de navegador ou limpou os dados', 'Reescolher a pasta reconstrói tudo, inclusive o sal — sem ele, os nomes voltariam e as pessoas não.'],
        ],
        [2600, 6426],
      ),
      p(''),
      p([t('O caminho de recuperação está escrito dentro da própria pasta, no '), mono('LEIA-ME.txt'), t('. Ele é gravado a cada mudança, para que quem abrir a pasta daqui a um ano — ou quem a receber de um colega — não precise deste documento à mão.')]),

      // ── 7 ─────────────────────────────────────────────────────────────
      h1('7. Limites conhecidos'),
      p('Ditos aqui porque um documento que só lista garantias não merece confiança.'),
      item([t('Um crachá clonado marca presença. ', { bold: true }), t('O número de série é público por definição do padrão, e clonar exige um cartão gravável e intenção deliberada. Para uma sala de aula a avaliação é que isso é aceitável: quem clona um crachá já podia pedir a um colega que assinasse por ele, e o professor está na sala.')]),
      item([t('A segurança dos arquivos é a do computador. ', { bold: true }), t('O programa não tem senha própria. Quem tem acesso à máquina e à pasta tem acesso aos dados.')]),
      item([t('Não há cópia fora da máquina por padrão. ', { bold: true }), t('Ela existe se — e só se — a pasta escolhida estiver dentro de um serviço de sincronização que o professor já use.')]),
      item([t('Fora do Chrome e do Edge, guardar depende de disciplina. ', { bold: true }), t('Nesses navegadores o programa não consegue gravar sozinho, e o professor precisa exportar. O programa cobra, mas não obriga.')]),

      new Paragraph({ spacing: { before: 500 }, children: [
        t('Código-fonte e histórico de decisões: ', { color: FRACA, size: 20 }),
        new TextRun({ text: 'github.com/willianrupert/adsum', font: 'Courier New', size: 20, color: FRACA }),
      ]}),
    ],
  }],
})

Packer.toBuffer(doc).then((b) => {
  fs.writeFileSync(DESTINO, b)
  console.log('manual em', DESTINO, '—', b.length, 'bytes')
})
