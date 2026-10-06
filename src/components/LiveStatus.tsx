// Static status panel rendered at build time. The HTML never knows the current
// time, so the badge is always "verificando" and the line shows only the
// absolute time of the last success (UI-SPEC pre-hydration rule, D-07).
// Plan 01-05 turns this into the client island with the SAME props.
import { formatAbsolute } from "@/lib/format-date";

export function LiveStatus({ initialLastSuccessAt }: { initialLastSuccessAt: string | null }) {
  return (
    <section
      aria-label="Status da atualização"
      className="flex flex-col gap-2 rounded-panel border border-border bg-surface p-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4"
    >
      <span
        title="Verificando o status da atualização."
        className="inline-flex min-w-24 items-center justify-center gap-1 self-start rounded-pill bg-fg-muted/12 px-2 py-1 text-sm font-semibold tracking-wide text-fg-muted uppercase sm:self-auto"
      >
        <span aria-hidden="true" className="size-2 rounded-full border border-fg-muted" />
        <span aria-hidden="true">verificando</span>
        <span className="sr-only">Verificando o status da atualização.</span>
      </span>
      <p className="text-sm text-fg-muted tabular-nums">
        {initialLastSuccessAt !== null
          ? `Última atualização: ${formatAbsolute(initialLastSuccessAt)} (Brasília)`
          : "Última atualização: ainda nenhuma coleta concluída."}
      </p>
    </section>
  );
}
