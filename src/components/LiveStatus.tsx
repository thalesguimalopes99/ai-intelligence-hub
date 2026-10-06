"use client";
// LIVE badge island (FEED-06, CONTEXT D-06/D-07, UI-SPEC "Selo LIVE").
// The static HTML never knows the current time: the server snapshot of the
// clock is null, so the server/hydration render is "verificando" + absolute
// time only (no hydration mismatch). After hydration the clock store ticks
// every CLOCK_TICK_MS and the island polls same-origin /data/meta.json every
// POLL_INTERVAL_MS (paused while the tab is hidden).
import { AlertTriangle } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { formatStatusLine, liveStatus, parseLastSuccessAt, type LiveState } from "@/lib/live-status";
import { CLOCK_TICK_MS, POLL_INTERVAL_MS } from "@/shared/constants";

// ---- Module-level clock store (one interval shared by all subscribers) ----
let clockNow = 0;
const clockListeners = new Set<() => void>();
let clockTimer: ReturnType<typeof setInterval> | undefined;

function subscribeClock(onChange: () => void): () => void {
  clockListeners.add(onChange);
  if (clockTimer === undefined) {
    clockNow = Date.now();
    clockTimer = setInterval(() => {
      clockNow = Date.now();
      clockListeners.forEach((listener) => listener());
    }, CLOCK_TICK_MS);
  }
  return () => {
    clockListeners.delete(onChange);
    if (clockListeners.size === 0 && clockTimer !== undefined) {
      clearInterval(clockTimer);
      clockTimer = undefined;
    }
  };
}

const getClock = (): number => clockNow || (clockNow = Date.now());
const getServerClock = (): null => null; // server + hydration → "verificando"

// ---- Badge presentation (UI-SPEC "Cor status" + Copywriting) ----
type BadgeState = LiveState | "verificando";

const BADGE: Record<BadgeState, { label: string; description: string; pill: string; dot: string }> = {
  live: {
    label: "LIVE",
    description: "Ao vivo: a última coleta terminou há menos de 90 minutos.",
    pill: "bg-live/12 text-live",
    dot: "bg-live animate-live-pulse motion-reduce:animate-none",
  },
  atrasado: {
    label: "atrasado",
    description: "Atrasado: a última coleta concluída foi entre 90 minutos e 3 horas atrás.",
    pill: "bg-warn/12 text-warn",
    dot: "bg-warn",
  },
  parado: {
    label: "parado",
    description: "Parado: nenhuma coleta concluída nas últimas 3 horas.",
    pill: "bg-danger/12 text-danger",
    dot: "bg-danger",
  },
  verificando: {
    label: "verificando",
    description: "Verificando o status da atualização.",
    pill: "bg-fg-muted/12 text-fg-muted",
    dot: "border border-fg-muted",
  },
};

export function LiveStatus({ initialLastSuccessAt }: { initialLastSuccessAt: string | null }) {
  const now = useSyncExternalStore(subscribeClock, getClock, getServerClock);
  const [lastSuccessAt, setLastSuccessAt] = useState(initialLastSuccessAt);
  const [pollFailed, setPollFailed] = useState(false);
  const liveRegionRef = useRef<HTMLSpanElement>(null);

  // Same-origin polling only (D-06, T-01-19). setState happens inside the async
  // callback, never synchronously in the effect body (react-hooks v7).
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const response = await fetch("/data/meta.json", { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const value = parseLastSuccessAt(await response.json());
        if (value === undefined) throw new Error("invalid meta.json payload");
        if (alive) {
          setLastSuccessAt(value);
          setPollFailed(false);
        }
      } catch {
        if (alive) setPollFailed(true); // keep the last known value
      }
    };
    void poll();
    const intervalId = setInterval(() => {
      if (document.visibilityState === "visible") void poll();
    }, POLL_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      alive = false;
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const state: BadgeState = now === null ? "verificando" : liveStatus(lastSuccessAt, now);
  const evaluated = state !== "verificando";

  // The live region only starts announcing AFTER the first real evaluation is
  // committed, so "verificando" → first state is silent (UI-SPEC Acessibilidade).
  // aria-live is set imperatively (not a render prop) to avoid reading refs in render.
  useEffect(() => {
    if (evaluated) liveRegionRef.current?.setAttribute("aria-live", "polite");
  }, [evaluated]);

  const badge = BADGE[state];

  return (
    <section
      aria-label="Status da atualização"
      className="flex flex-col gap-2 rounded-panel border border-border bg-surface p-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4"
    >
      <span
        title={badge.description}
        className={`inline-flex min-w-24 items-center justify-center gap-1 self-start rounded-pill px-2 py-1 text-sm font-semibold tracking-wide uppercase transition-colors motion-reduce:transition-none sm:self-auto ${badge.pill}`}
      >
        <span aria-hidden="true" className={`size-2 rounded-full ${badge.dot}`} />
        <span ref={liveRegionRef} aria-atomic="true">
          <span aria-hidden="true">{badge.label}</span>
          <span className="sr-only">{badge.description}</span>
        </span>
      </span>
      <p className="text-sm text-fg-muted tabular-nums">{formatStatusLine(lastSuccessAt, now)}</p>
      {pollFailed && (
        <p role="status" className="mt-2 flex items-center gap-1 text-sm text-fg-muted">
          <AlertTriangle size={16} aria-hidden="true" className="shrink-0 text-danger" />
          Não foi possível verificar a atualização agora. Tentaremos de novo em 1 minuto.
        </p>
      )}
    </section>
  );
}
