import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isAuthenticated } from "../../src/auth/msal.js";
import { env } from "../../src/config/env.js";
import { log } from "../../src/utils/logger.js";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const connected = await isAuthenticated();
    res.status(200).json({
      connected,
      email: connected ? env.userEmail : null,
    });
  } catch (err) {
    log.error("Failed to check auth status", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: "Failed to check status" });
  }
}
