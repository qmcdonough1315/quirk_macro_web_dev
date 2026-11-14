/**
 * Trading-desk admin auth for Alpaca place RPCs.
 *
 * Env (server-only — never VITE_*):
 *   TRADING_ADMIN_PASSWORD        — password an admin types to unlock place
 *   TRADING_ADMIN_SESSION_SECRET  — optional ≥32-char seal key; if unset,
 *                                   derived from TRADING_ADMIN_PASSWORD
 *
 * Sessions are encrypted HttpOnly cookies via TanStack Start useSession.
 * Place handlers must call requireTradingAdmin() before submitting orders.
 */
import { createHash, timingSafeEqual } from "node:crypto";

import {
  getRequestIP,
  useSession,
  type SessionConfig,
} from "@tanstack/react-start/server";

export type TradingAdminSessionData = {
  role?: "admin";
  authenticatedAt?: number;
};

export type TradingAdminGateResult =
  | { ok: true }
  | { ok: false; error: string; code: "not_configured" | "unauthorized" };

const SESSION_NAME = "qm_trading_admin";
const SESSION_MAX_AGE_SEC = 60 * 60 * 8; // 8 hours
const LOGIN_WINDOW_MS = 60_000;
const LOGIN_MAX_ATTEMPTS = 8;

/** Best-effort in-memory login throttle (per instance). */
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function readAdminPassword(): string {
  return (process.env["TRADING_ADMIN_PASSWORD"] || "").trim();
}

function readSessionSealPassword(): string {
  const explicit = (process.env["TRADING_ADMIN_SESSION_SECRET"] || "").trim();
  if (explicit.length >= 32) return explicit;
  const adminPassword = readAdminPassword();
  if (!adminPassword) return "";
  // Stable ≥32-char seal key when only TRADING_ADMIN_PASSWORD is configured.
  return createHash("sha256")
    .update(`quirk-macro:trading-admin-session:${adminPassword}`)
    .digest("hex");
}

export function isTradingAdminConfigured(): boolean {
  return readAdminPassword().length > 0 && readSessionSealPassword().length >= 32;
}

function sessionConfig(): SessionConfig {
  const password = readSessionSealPassword();
  if (password.length < 32) {
    throw new Error("Trading admin session secret is not configured.");
  }
  const secure =
    process.env["NODE_ENV"] === "production" ||
    (process.env["VERCEL"] != null && process.env["VERCEL"] !== "");

  return {
    name: SESSION_NAME,
    password,
    maxAge: SESSION_MAX_AGE_SEC,
    cookie: {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
    },
  };
}

function secretsEqual(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return a.length === b.length && timingSafeEqual(a, b);
}

function clientKey(): string {
  try {
    return getRequestIP({ xForwardedFor: true }) || "unknown";
  } catch {
    return "unknown";
  }
}

function consumeLoginAttempt(key: string): boolean {
  const now = Date.now();
  const row = loginAttempts.get(key);
  if (!row || now >= row.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return true;
  }
  if (row.count >= LOGIN_MAX_ATTEMPTS) return false;
  row.count += 1;
  return true;
}

export async function requireTradingAdmin(): Promise<TradingAdminGateResult> {
  if (!isTradingAdminConfigured()) {
    return {
      ok: false,
      code: "not_configured",
      error:
        "Trading admin password is not configured. Set TRADING_ADMIN_PASSWORD (and optionally TRADING_ADMIN_SESSION_SECRET) in Vercel / Cursor secrets, then redeploy.",
    };
  }
  try {
    const session = await useSession<TradingAdminSessionData>(sessionConfig());
    if (session.data.role === "admin" && typeof session.data.authenticatedAt === "number") {
      return { ok: true };
    }
  } catch {
    // Missing/invalid seal falls through as unauthorized.
  }
  return {
    ok: false,
    code: "unauthorized",
    error: "Admin authentication required. Unlock the trading desk before placing orders.",
  };
}

export async function getTradingAdminAuthState(): Promise<{
  authenticated: boolean;
  configured: boolean;
}> {
  const configured = isTradingAdminConfigured();
  if (!configured) return { authenticated: false, configured: false };
  try {
    const session = await useSession<TradingAdminSessionData>(sessionConfig());
    const authenticated =
      session.data.role === "admin" && typeof session.data.authenticatedAt === "number";
    return { authenticated, configured: true };
  } catch {
    return { authenticated: false, configured: true };
  }
}

export async function loginTradingAdmin(password: string): Promise<{
  ok: boolean;
  authenticated: boolean;
  configured: boolean;
  error: string | null;
}> {
  const configured = isTradingAdminConfigured();
  if (!configured) {
    return {
      ok: false,
      authenticated: false,
      configured: false,
      error:
        "Trading admin password is not configured on the server. Set TRADING_ADMIN_PASSWORD and redeploy.",
    };
  }
  if (!consumeLoginAttempt(clientKey())) {
    return {
      ok: false,
      authenticated: false,
      configured: true,
      error: "Too many login attempts. Wait a minute and try again.",
    };
  }
  const expected = readAdminPassword();
  if (!password || !secretsEqual(password, expected)) {
    return {
      ok: false,
      authenticated: false,
      configured: true,
      error: "Invalid admin password.",
    };
  }
  const session = await useSession<TradingAdminSessionData>(sessionConfig());
  await session.clear();
  await session.update({
    role: "admin",
    authenticatedAt: Date.now(),
  });
  return { ok: true, authenticated: true, configured: true, error: null };
}

export async function logoutTradingAdmin(): Promise<{
  ok: boolean;
  authenticated: boolean;
  configured: boolean;
}> {
  const configured = isTradingAdminConfigured();
  if (!configured) {
    return { ok: true, authenticated: false, configured: false };
  }
  try {
    const session = await useSession<TradingAdminSessionData>(sessionConfig());
    await session.clear();
  } catch {
    // Ignore clear failures (already logged out / bad seal).
  }
  return { ok: true, authenticated: false, configured };
}
