import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  getTradingAdminAuthState,
  loginTradingAdmin,
  logoutTradingAdmin,
} from "./trading-admin.server";

export const getTradingAdminSession = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ authenticated: boolean; configured: boolean }> => {
    return getTradingAdminAuthState();
  },
);

const loginSchema = z.object({
  password: z.string().min(1).max(256),
});

export const loginTradingAdminDesk = createServerFn({ method: "POST" })
  .validator((input: unknown) => loginSchema.parse(input))
  .handler(async ({ data }) => {
    return loginTradingAdmin(data.password);
  });

export const logoutTradingAdminDesk = createServerFn({ method: "POST" }).handler(
  async () => {
    return logoutTradingAdmin();
  },
);
