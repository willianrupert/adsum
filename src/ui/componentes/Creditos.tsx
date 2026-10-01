// "Criado por": no repouso, e nas telas de quem está conhecendo o Adsum
// (escolher a pasta, o conselho do navegador, a primeira turma). Abre "Sobre o
// Adsum"; sem `aoAbrir` (vitrine), aparece sem abrir.

export function Creditos({ aoAbrir }: { aoAbrir?: () => void }) {
  return (
    // O chevron é o sinal de "abre mais", como nos Ajustes do iOS.
    <button className="repouso__creditos" onClick={aoAbrir} disabled={!aoAbrir}>
      <span className="repouso__creditos-rotulo">Criado por</span>
      <span>
        Prof. Paulo Freitas <span className="repouso__creditos-e">e</span> Willian Rupert
        <span className="repouso__creditos-seta" aria-hidden="true"> ›</span>
      </span>
    </button>
  )
}
