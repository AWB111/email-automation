import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleCallback } from "../../src/auth/msal.js";
import { env } from "../../src/config/env.js";
import { log } from "../../src/utils/logger.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const code = typeof req.query.code === "string" ? req.query.code : undefined;
  const state = typeof req.query.state === "string" ? req.query.state : undefined;
  const errorMsg =
    typeof req.query.error_description === "string" ? req.query.error_description : undefined;

  if (errorMsg) {
    log.error("Auth callback error from Microsoft", { error: errorMsg });
    res.status(400).json({ error: errorMsg });
    return;
  }

  if (!code || !state) {
    res.status(400).json({ error: "Missing code or state in callback" });
    return;
  }

  try {
    await handleCallback(code, state);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(`
      <html>
        <body style="font-family: sans-serif; padding: 40px; text-align: center;">
          <h2>Connected successfully</h2>
          <p>Account <strong>${env.userEmail}</strong> is now linked.</p>
          <p>You can close this tab.</p>
        </body>
      </html>
    `);
  } catch (err) {
    log.error("Failed to handle auth callback", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: "Failed to complete sign-in" });
  }
}
