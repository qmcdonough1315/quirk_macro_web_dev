import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Lock, LockOpen, Loader2 } from "lucide-react";
import { useState } from "react";

import {
  getTradingAdminSession,
  loginTradingAdminDesk,
  logoutTradingAdminDesk,
} from "@/lib/trading-admin.functions";

export const TRADING_ADMIN_SESSION_QUERY_KEY = ["trading-admin-session"] as const;

export function useTradingAdminSession() {
  const sessionFn = useServerFn(getTradingAdminSession);
  return useQuery({
    queryKey: TRADING_ADMIN_SESSION_QUERY_KEY,
    queryFn: () => sessionFn(),
    staleTime: 30_000,
    retry: 1,
  });
}

/** Shared unlock UI for options + ETF place desks. */
export function TradingAdminGate() {
  const queryClient = useQueryClient();
  const session = useTradingAdminSession();
  const loginFn = useServerFn(loginTradingAdminDesk);
  const logoutFn = useServerFn(logoutTradingAdminDesk);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const login = useMutation({
    mutationFn: () => loginFn({ data: { password } }),
    onSuccess: async (result) => {
      if (result.ok) {
        setPassword("");
        setError(null);
        await queryClient.invalidateQueries({ queryKey: TRADING_ADMIN_SESSION_QUERY_KEY });
      } else {
        setError(result.error ?? "Unlock failed");
      }
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Unlock failed");
    },
  });

  const logout = useMutation({
    mutationFn: () => logoutFn(),
    onSuccess: async () => {
      setPassword("");
      setError(null);
      await queryClient.invalidateQueries({ queryKey: TRADING_ADMIN_SESSION_QUERY_KEY });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Lock failed");
    },
  });

  const authenticated = Boolean(session.data?.authenticated);
  const configured = session.data?.configured !== false;
  const busy = login.isPending || logout.isPending || session.isPending;

  return (
    <div className="mb-4 rounded-lg border border-border/70 bg-secondary/20 px-3 py-3">
      <div className="flex flex-wrap items-center gap-2.5">
        {authenticated ? (
          <LockOpen className="size-3.5 text-accent" />
        ) : (
          <Lock className="size-3.5 text-muted-foreground" />
        )}
        <p className="text-sm font-medium">
          {authenticated ? "Trading desk unlocked" : "Admin unlock required to place"}
        </p>
        <span className="label-caps ml-auto">
          {session.isPending ? "Checking…" : authenticated ? "Admin session" : "Locked"}
        </span>
      </div>

      {!configured && !session.isPending ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Set <span className="font-mono">TRADING_ADMIN_PASSWORD</span> in Vercel / Cursor secrets
          and redeploy before place can be unlocked.
        </p>
      ) : null}

      {authenticated ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border border-border/80 px-2.5 py-1.5 text-xs font-medium hover:bg-secondary/40 disabled:opacity-50"
            disabled={busy}
            onClick={() => logout.mutate()}
          >
            {logout.isPending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Lock className="size-3" />
            )}
            Lock desk
          </button>
          <p className="text-xs text-muted-foreground">
            HttpOnly admin session · place RPCs stay gated server-side
          </p>
        </div>
      ) : (
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!password || busy) return;
            login.mutate();
          }}
        >
          <label className="flex min-w-[12rem] flex-1 flex-col gap-1">
            <span className="label-caps">Admin password</span>
            <input
              type="password"
              name="trading-admin-password"
              autoComplete="current-password"
              value={password}
              disabled={busy || !configured}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-md border border-border/80 bg-background px-2.5 py-1.5 text-sm outline-none focus:border-foreground/40 disabled:opacity-50"
              placeholder="Required to place orders"
            />
          </label>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-2 text-xs font-medium text-background disabled:opacity-50"
            disabled={busy || !configured || password.length === 0}
          >
            {login.isPending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <LockOpen className="size-3" />
            )}
            Unlock
          </button>
        </form>
      )}

      {error ? <p className="mt-2 text-xs text-muted-foreground">{error}</p> : null}
    </div>
  );
}
