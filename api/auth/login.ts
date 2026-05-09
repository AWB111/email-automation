import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAuthUrl } from "../../src/auth/msal.js";
import { log } from "../../src/utils/logger.js";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const url = await getAuthUrl();
    res.redirect(302, url);
  } catch (err) {
    log.error("Failed to generate auth URL", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: "Failed to start sign-in flow" });
  }
}
