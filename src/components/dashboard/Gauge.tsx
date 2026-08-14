interface GaugeProps {
  value: number; // 0 - 100
  leftLabel: string;
  rightLabel: string;
  verdict: string;
  caption?: string;
}

export function Gauge({ value, leftLabel, rightLabel, verdict, caption }: GaugeProps) {
  const clamped = Math.min(100, Math.max(0, value));

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <p className="font-display text-2xl tracking-tight text-foreground">{verdict}</p>
          {caption ? <p className="mt-1 text-sm text-muted-foreground">{caption}</p> : null}
        </div>
        <span className="font-mono text-3xl tabular-nums text-accent">{clamped}</span>
      </div>

      <div className="relative pt-6">
        <div
          className="absolute top-0 -translate-x-1/2 transition-all duration-700"
          style={{ left: `${clamped}%` }}
        >
          <div className="mx-auto h-3 w-3 rotate-45 rounded-[2px] bg-accent shadow-[0_0_14px_var(--accent)]" />
        </div>
        <div className="h-2 w-full rounded-full bg-[linear-gradient(90deg,var(--positive),var(--warning),var(--negative))] opacity-90" />
        <div className="pointer-events-none absolute inset-x-0 top-6 flex justify-between px-[1px]">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className="h-2 w-px bg-border" />
          ))}
        </div>
      </div>

      <div className="flex justify-between text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
    </div>
  );
}
