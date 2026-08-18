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
      { nomeCompleto: 'ANA PAULA MENDES DE SOUZA', login: 'ana.mendes', docenteNoSigaa: true, loginProvisorio: false },
      { nomeCompleto: 'BRENO OLIVEIRA FILHO', login: 'breno.of', docenteNoSigaa: false, loginProvisorio: false },
      { nomeCompleto: 'CARLA REGINA DO NASCIMENTO', login: 'carla.rn', docenteNoSigaa: false, loginProvisorio: false },
    ])
  })

  it('separa docente de discente por Matrícula, não por (Perfil)', () => {
    const { pessoas } = interpretarParticipantes(PAGINA)
    expect(pessoas.filter((p) => p.docenteNoSigaa).map((p) => p.login)).toEqual(['ana.mendes'])
  })

  // A checagem que pega perda silenciosa. Sem ela, colar metade da página dá
  // uma lista plausível — e o aluno que faltou só descobre na hora da chamada.
  it('confere o total contra o que o cabeçalho declara', () => {
    const metade = PAGINA.replace(DISCENTE('CARLA REGINA DO NASCIMENTO', '20250000002', 'carla.rn').trimStart(), '')
    const { problemas } = interpretarParticipantes(metade)
    expect(problemas).toHaveLength(1)
    expect(problemas[0]).toMatch(/Discentes \(2\).*lidos 1/)
  })

  it('marca login que é só dígitos — matrícula ou CPF no lugar de login', () => {
    const pagina = ['Discentes (1)', DISCENTE('DANIEL SOUZA LIMA', '20250000003', '70783995440')].join('\n')
    const { pessoas } = interpretarParticipantes(pagina)
    expect(pessoas[0].loginProvisorio).toBe(true)
  })

  it('não confunde "Usuário Off-Line" com a linha "Usuário:"', () => {
    const { pessoas } = interpretarParticipantes(PAGINA)
    expect(pessoas.every((p) => !p.login.includes('Off'))).toBe(true)
  })

  it('reclama de login repetido em vez de gravar duas vezes', () => {
    const pagina = [
      'Discentes (2)',
      DISCENTE('EVA MARIA COSTA', '1', 'eva.costa'),
      DISCENTE('EVA MARIA COSTA', '1', 'eva.costa'),
    ].join('\n')
    const { pessoas, problemas } = interpretarParticipantes(pagina)
    expect(pessoas).toHaveLength(1)
    expect(problemas.some((p) => /repetido/.test(p))).toBe(true)
  })

  it('descarta bloco sem linha de usuário, dizendo quem foi', () => {
    const pagina = ['Discentes (1)', '\tUsuário Off-Line no SIGAA FABIO LEAL  (Perfil)', 'Curso: X'].join('\n')
    const { pessoas, problemas } = interpretarParticipantes(pagina)
    expect(pessoas).toEqual([])
    expect(problemas[0]).toMatch(/FABIO LEAL/)
  })

  it('aceita um nome por linha como reserva, avisando que não tem login', () => {
    const { pessoas, problemas } = interpretarParticipantes('Gabriela Ramos\nHelena Dias')
    expect(pessoas.map((p) => p.nomeCompleto)).toEqual(['Gabriela Ramos', 'Helena Dias'])
    expect(pessoas.every((p) => p.login === '')).toBe(true)
    expect(problemas[0]).toMatch(/sem login/)
  })

  it('devolve vazio para colagem vazia, sem inventar problema', () => {
    expect(interpretarParticipantes('   ')).toEqual({
      pessoas: [],
      docentesDeclarados: undefined,
      discentesDeclarados: undefined,
      problemas: [],
    })
  })
})
