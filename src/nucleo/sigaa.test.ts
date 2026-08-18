import { describe, expect, it } from 'vitest'
import { interpretarParticipantes } from './sigaa.ts'

// Dados inventados, na forma exata da página real. A turma de verdade tem nome,
// matrícula, login e e-mail de 49 pessoas — isso não entra em repositório
// público, nem para servir de teste.
const DOCENTE = (nome: string, login: string) =>
  [
    `\tUsuário Off-Line no SIGAA ${nome}`,
    'Departamento: CENTRO DE INFORMÁTICA - CIN',
    'Formação: DOUTORADO',
    `Usuário: ${login}`,
    'E-Mail: fulano@ufpe.br',
    'Enviar Mensagem',
  ].join('\n')

const DISCENTE = (nome: string, matricula: string, login: string) =>
  [
    `\tUsuário Off-Line no SIGAA ${nome}  (Perfil)`,
    'Curso: CIÊNCIA DA COMPUTAÇÃO/CIN',
    `Matrícula: ${matricula}`,
    `Usuário: ${login}`,
    'E-mail: fulano@gmail.com\tEnviar Mensagem',
  ].join('\n')

const ASSISTIDA = (nome: string, login: string) =>
  [
    `\tUsuário Off-Line no SIGAA ${nome}`,
    'Departamento: PROGRAMA DE PÓS-GRADUAÇÃO - CIN',
    `Usuário: ${login}`,
    'E-Mail: fulano@gmail.com',
    'Enviar Mensagem',
  ].join('\n')

const PAGINA = [
  'Docentes (1)',
  DOCENTE('ANA PAULA MENDES DE SOUZA', 'ana.mendes'),
  '',
  'Discentes (2)',
  // Na página real vêm duas por linha, coladas por tabulação.
  DISCENTE('BRENO OLIVEIRA FILHO', '20250000001', 'breno.of') +
    '\t\t' +
    DISCENTE('CARLA REGINA DO NASCIMENTO', '20250000002', 'carla.rn').trimStart(),
  '',
  'SIGAA | Superintendência de Tecnologia da Informação (STI-UFPE)',
].join('\n')

describe('participantes do SIGAA', () => {
  it('lê nome completo e login de docentes e discentes', () => {
    const { pessoas, problemas } = interpretarParticipantes(PAGINA)
    expect(problemas).toEqual([])
    expect(pessoas).toEqual([
      { nomeCompleto: 'ANA PAULA MENDES DE SOUZA', matricula: '', docenteNoSigaa: true },
      { nomeCompleto: 'BRENO OLIVEIRA FILHO', matricula: '20250000001', docenteNoSigaa: false },
      { nomeCompleto: 'CARLA REGINA DO NASCIMENTO', matricula: '20250000002', docenteNoSigaa: false },
    ])
  })

  it('quem decide o papel é a seção, não os campos da pessoa', () => {
    const { pessoas } = interpretarParticipantes(PAGINA)
    expect(pessoas.filter((p) => p.docenteNoSigaa).map((p) => p.nomeCompleto)).toEqual([
      'ANA PAULA MENDES DE SOUZA',
    ])
  })

  // A turma real tem `Docência Assistida (1)`, que traz `Departamento:` como
  // qualquer docente. Inferir pelos campos fazia ela virar a terceira docente,
  // e a conferência acusava um erro que não existia.
  it('reconhece Docência Assistida sem estragar a contagem de Docentes', () => {
    const pagina = [
      'Docentes (1)',
      DOCENTE('ANA PAULA MENDES DE SOUZA', 'ana.mendes'),
      '',
      'Docência Assistida (1)',
      ASSISTIDA('PATRICIA DRAPAL DA SILVA', 'pdrapal'),
      '',
      'Discentes (1)',
      DISCENTE('BRENO OLIVEIRA FILHO', '1', 'breno.of'),
    ].join('\n')

    const { pessoas, secoes, problemas } = interpretarParticipantes(pagina)
    expect(problemas).toEqual([])
    expect(secoes.map((s) => `${s.nome}:${s.declarados}/${s.lidos}`)).toEqual([
      'Docentes:1/1',
      'Docência Assistida:1/1',
      'Discentes:1/1',
    ])
    // A docência assistida também dá aula: entra como dica de docente.
    expect(pessoas.filter((p) => p.docenteNoSigaa).map((p) => p.nomeCompleto)).toEqual([
      'ANA PAULA MENDES DE SOUZA',
      'PATRICIA DRAPAL DA SILVA',
    ])
  })

  it('uma seção nova não quebra a leitura', () => {
    const pagina = ['Monitores (1)', DOCENTE('CARLOS MONITOR', 'carlos.m')].join('\n')
    const { secoes, problemas } = interpretarParticipantes(pagina)
    expect(problemas).toEqual([])
    expect(secoes).toEqual([{ nome: 'Monitores', declarados: 1, lidos: 1 }])
  })

  // A checagem que pega perda silenciosa. Sem ela, colar metade da página dá
  // uma lista plausível — e o aluno que faltou só descobre na hora da chamada.
  it('confere o total contra o que o cabeçalho declara', () => {
    const metade = PAGINA.replace(DISCENTE('CARLA REGINA DO NASCIMENTO', '20250000002', 'carla.rn').trimStart(), '')
    const { problemas } = interpretarParticipantes(metade)
    expect(problemas).toHaveLength(1)
    expect(problemas[0]).toMatch(/Discentes \(2\).*lidos 1/)
  })

  // O campo `Usuário:` é o login do SIGAA — credencial de acesso de outra
  // pessoa. Não tem por que existir numa base de frequência, e por isso não é
  // lido: o que identifica é a matrícula.
  it('não guarda o login do SIGAA em lugar nenhum', () => {
    const { pessoas } = interpretarParticipantes(PAGINA)
    expect(JSON.stringify(pessoas)).not.toContain('ana.mendes')
    expect(JSON.stringify(pessoas)).not.toContain('breno.of')
  })

  it('a mesma pessoa duas vezes entra uma vez só', () => {
    const pagina = [
      'Discentes (2)',
      DISCENTE('EVA MARIA COSTA', '1', 'eva.costa'),
      DISCENTE('EVA MARIA COSTA', '1', 'eva.costa'),
    ].join('\n')
    const { pessoas, problemas } = interpretarParticipantes(pagina)
    expect(pessoas).toHaveLength(1)
    expect(problemas.some((p) => /duas vezes/.test(p))).toBe(true)
  })

  it('aceita um nome por linha como reserva, avisando que não tem matrícula', () => {
    const { pessoas, problemas } = interpretarParticipantes('Gabriela Ramos\nHelena Dias')
    expect(pessoas.map((p) => p.nomeCompleto)).toEqual(['Gabriela Ramos', 'Helena Dias'])
    expect(pessoas.every((p) => p.matricula === '')).toBe(true)
    expect(problemas[0]).toMatch(/sem matrícula/)
  })

  it('devolve vazio para colagem vazia, sem inventar problema', () => {
    expect(interpretarParticipantes('   ')).toEqual({ pessoas: [], secoes: [], problemas: [] })
  })
})
