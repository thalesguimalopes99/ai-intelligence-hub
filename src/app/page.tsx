import { ExternalLink } from "lucide-react";
import { LiveStatus } from "@/components/LiveStatus";
import { loadItemsFile, loadMeta } from "@/lib/data";
import { formatItemDate } from "@/lib/format-date";
import { FEED_LIMIT } from "@/shared/constants";
import { sortItems } from "@/shared/serialize";

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
  // Build time only (the route is fully static): read the canonical data/.
  const meta = loadMeta();
  // User decision: at most the 50 most recent items, no pagination.
  const items = sortItems(loadItemsFile().items).slice(0, FEED_LIMIT);

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
      <main>
        <div className="mt-6">
          <LiveStatus initialLastSuccessAt={meta?.lastSuccessAt ?? null} />
        </div>
        <section aria-labelledby="ultimas" className="mt-8">
          <h2 id="ultimas" className="text-xl leading-6 font-semibold">
            Últimas da OpenAI
          </h2>
          {items.length > 0 ? (
            <ol className="mt-4 divide-y divide-border">
              {items.map((item) => (
                <li key={item.id}>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group block py-4"
                  >
                    <span
                      lang="en"
                      className="text-base break-words text-fg decoration-accent underline-offset-4 group-hover:underline group-focus-visible:underline"
                    >
                      {item.title}
                    </span>
                    <ExternalLink
                      size={16}
                      aria-hidden="true"
                      className="ml-1 inline align-[-2px] text-fg-muted group-hover:text-accent group-focus-visible:text-accent"
                    />
                    <time
                      dateTime={item.publishedAt ?? undefined}
                      className="mt-2 block text-sm text-fg-muted tabular-nums"
                    >
                      {formatItemDate(item)}
                    </time>
                    <span className="sr-only">(abre a fonte original em nova aba)</span>
                  </a>
                </li>
              ))}
            </ol>
          ) : (
            <>
              <h3 className="mt-4 text-xl leading-6 font-semibold">
                Nenhuma notícia por aqui ainda
              </h3>
              <p className="mt-2 text-base text-fg-muted">
                A coleta automática ainda não trouxe itens da OpenAI. O feed se atualiza sozinho a
                cada hora — volte daqui a pouco.
              </p>
            </>
          )}
        </section>
      </main>
      <footer className="mt-12 text-sm text-fg-muted">
        Atualizado automaticamente a cada hora. Nesta versão inicial, a única fonte é o blog
        oficial da OpenAI (RSS); mais fontes chegam em breve. Cada item leva direto ao texto
        original.
      </footer>
    </div>
  );
}
