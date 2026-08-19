// Escolher onde guardar.
//
// É a primeira tela por um motivo: enquanto a base viver só no IndexedDB,
// limpar dados do site apaga o cadastro da turma inteira, e recadastrar
// quarenta e nove alunos não é uma opção aceitável. Com a pasta, os arquivos
// são arquivos — limpar dados do site apaga o handle, não a pasta.

export function TelaPasta({
  precisaDePermissao,
  aoEscolher,
  aoLiberar,
}: {
  precisaDePermissao: boolean
  aoEscolher: () => void
  aoLiberar: () => void
}) {
  return (
    <section className="repouso">
      <p className="repouso__turma">
        {precisaDePermissao ? 'Sua pasta continua lá' : 'Antes de começar'}
      </p>
      <p className="repouso__acao">
        {precisaDePermissao ? 'Libere o acesso' : 'Escolha onde guardar'}
      </p>
      <p className="pasta__nota">
        {precisaDePermissao
          ? 'O navegador pede confirmação a cada vez que o Adsum volta. Um clique e a base é reencontrada.'
          : 'Os dados ficam numa pasta do seu computador, em arquivos que você pode abrir. Se ela estiver no iCloud ou no Drive, a cópia fora da máquina vem de graça.'}
      </p>
      <button className="botao--acento pasta__botao" onClick={precisaDePermissao ? aoLiberar : aoEscolher}>
        {precisaDePermissao ? 'Liberar' : 'Escolher pasta'}
      </button>
    </section>
  )
}
