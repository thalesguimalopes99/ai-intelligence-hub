function HubGlyph() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
      className="shrink-0 text-accent"
    >
      <line x1="10" y1="10" x2="10" y2="3.5" />
      <line x1="10" y1="10" x2="4.4" y2="13.2" />
      <line x1="10" y1="10" x2="15.6" y2="13.2" />
      <circle cx="10" cy="10" r="2.75" />
      <circle cx="10" cy="2.5" r="1.5" />
      <circle cx="3.5" cy="13.75" r="1.5" />
      <circle cx="16.5" cy="13.75" r="1.5" />
    </svg>
  );
}

export default function Home() {
  return (
    <div className="mx-auto max-w-[720px] px-4 pt-8 pb-12 sm:px-6">
      <header>
        <div className="flex items-center gap-2">
          <HubGlyph />
          <h1 className="text-display font-semibold">AI Intelligence Hub</h1>
        </div>
        <p className="mt-2 text-base text-fg-muted">
          Novidades de IA de fontes confiáveis, atualizadas sozinhas a cada hora.
        </p>
      </header>
      <main></main>
      <footer className="mt-12 text-sm text-fg-muted">
        Atualizado automaticamente a cada hora. Nesta versão inicial, a única fonte é o blog
        oficial da OpenAI (RSS); mais fontes chegam em breve. Cada item leva direto ao texto
        original.
      </footer>
    </div>
  );
}
