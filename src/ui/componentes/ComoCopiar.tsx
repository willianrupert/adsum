// Manual de como copiar a lista do SIGAA.
//
// A ilustração é desenhada, não fotografada. Um print da tela real levaria nome
// completo, matrícula, login, e-mail e foto de quarenta e nove pessoas para um
// repositório público — e o manual não precisa disso para ensinar. Os dados
// aqui são inventados; o layout é o da página de verdade. A linha destacada é a
// que o Adsum lê — `Matrícula:`, e não `Usuário:`, que é login de acesso.
//
// Mesma disciplina do `gerar_mockups.py`: versiona-se o desenho, não a captura.

const MENU = ['Principal', 'Gerenciar Perfil', 'Plano de Curso', 'Participantes', 'Fóruns']

const DOCENTES = [
  ['ANA PAULA MENDES DE SOUZA', 'docente-1'],
  ['CARLOS EDUARDO RAMOS LIMA', 'docente-2'],
]

const DISCENTES = [
  ['BRENO OLIVEIRA FILHO', '20250000001'],
  ['CARLA REGINA NASCIMENTO', '20250000002'],
  ['DANIEL SOUZA LIMA', '20250000003'],
  ['EVA MARIA COSTA', '20250000004'],
]

function Pessoa({
  x,
  y,
  nome,
  apoio,
  rotuloDoId,
}: {
  x: number
  y: number
  nome: string
  apoio: string
  /** A linha destacada: é dela que o Adsum tira o identificador. */
  rotuloDoId: string
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width="26" height="30" rx="2" className="ilu-foto" />
      <text x="34" y="9" className="ilu-nome">
        {nome}
      </text>
      <text x="34" y="20" className="ilu-campo">
        {apoio}
      </text>
      <text x="34" y="30" className="ilu-usuario">
        {rotuloDoId}
      </text>
    </g>
  )
}

export function ComoCopiar() {
  return (
    <details className="manual">
      <summary>Como copiar a lista do SIGAA</summary>

      <ol className="manual__passos">
        <li>
          No SIGAA, entre na <strong>Turma Virtual</strong> da turma e vá em{' '}
          <strong>Turma › Participantes</strong>.
        </li>
        <li>
          Clique logo antes de <strong>Docentes</strong> e arraste até depois do último
          discente — o bloco inteiro, com as linhas de <code>Matrícula:</code>. É delas
          que sai a matrícula.
        </li>
        <li>
          Copie (<kbd>⌘C</kbd> ou <kbd>Ctrl+C</kbd>) e cole no campo abaixo. Pegar a página
          toda também funciona: o rodapé e o menu são ignorados.
        </li>
        <li>
          Confira o número. A página diz <code>Docentes (2)</code> e{' '}
          <code>Discentes (47)</code>, e o Adsum compara com o que leu — se faltar gente,
          ele avisa em vez de seguir com a lista curta.
        </li>
      </ol>

      <svg viewBox="0 0 700 330" className="ilustracao" role="img" aria-label="Página de participantes do SIGAA com a área a ser copiada destacada">
        <rect width="700" height="330" rx="4" className="ilu-fundo" />

        {/* menu da turma virtual */}
        <rect x="8" y="8" width="122" height="314" rx="3" className="ilu-menu" />
        <text x="20" y="26" className="ilu-titulo-menu">Menu Turma Virtual</text>
        {MENU.map((item, i) => (
          <text
            key={item}
            x="24"
            y={48 + i * 20}
            className={item === 'Participantes' ? 'ilu-menu-ativo' : 'ilu-menu-item'}
          >
            {item}
          </text>
        ))}

        {/* área a copiar */}
        <rect x="140" y="20" width="548" height="286" rx="4" className="ilu-selecao" />

        <text x="152" y="40" className="ilu-secao">DOCENTES (2)</text>
        <line x1="152" y1="46" x2="676" y2="46" className="ilu-regua" />
        {DOCENTES.map(([nome, chave], i) => (
          <Pessoa
            key={chave}
            x={152}
            y={56 + i * 40}
            nome={nome}
            apoio="Formação: DOUTORADO"
            rotuloDoId="Departamento: CENTRO DE INFORMÁTICA - CIN"
          />
        ))}

        <text x="152" y="156" className="ilu-secao">DISCENTES (47)</text>
        <line x1="152" y1="162" x2="676" y2="162" className="ilu-regua" />
        {DISCENTES.map(([nome, chave], i) => (
          <Pessoa
            key={chave}
            x={i % 2 === 0 ? 152 : 420}
            y={172 + Math.floor(i / 2) * 40}
            nome={nome}
            apoio="Curso: CIÊNCIA DA COMPUTAÇÃO/CIN"
            rotuloDoId={`Matrícula: ${chave}`}
          />
        ))}
        <text x="152" y="264" className="ilu-campo">… e mais 43</text>

        {/* marcação da seleção */}
        <text x="152" y="296" className="ilu-marca">
          ↑ selecione daqui até o fim da lista, incluindo as linhas “Matrícula:”
        </text>
      </svg>

      <p className="manual__nota">
        Nada disso sai do seu navegador. O Adsum lê o nome completo e a matrícula; a linha{' '}
        <code>Usuário:</code> é o login do SIGAA e não é lida.
      </p>
    </details>
  )
}
