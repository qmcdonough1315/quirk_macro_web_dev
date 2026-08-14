import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { Indicator } from "@/lib/macro-data";

export function IndicatorList({ items }: { items: Indicator[] }) {
  return (
    <ul className="space-y-5">
      {items.map((item) => (
        <li key={item.label}>
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-sm text-foreground">{item.label}</span>
            <span className="flex items-center gap-1.5 font-mono text-sm tabular-nums text-foreground">
              {item.value}
              {item.trend === "up" ? (
                <ArrowUpRight className="size-3.5 text-positive" />
              ) : (
                <ArrowDownRight className="size-3.5 text-negative" />
              )}
            </span>
          </div>
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-accent/70 transition-all duration-700"
              style={{ width: `${item.strength}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">{item.detail}</p>
        </li>
      ))}
    </ul>
  );
}
