import { Router, Request, Response } from "express";
import { getAuthUrl, handleCallback, isAuthenticated } from "./msal.js";
import { log } from "../utils/logger.js";
import { env } from "../config/env.js";

export const authRouter = Router();

authRouter.get("/login", async (_req: Request, res: Response) => {
  try {
    const url = await getAuthUrl();
    res.redirect(url);
  } catch (err) {
    log.error("Failed to generate auth URL", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: "Failed to start sign-in flow" });
  }
});

authRouter.get("/callback", async (req: Request, res: Response) => {
  const code = req.query.code as string | undefined;
  const state = req.query.state as string | undefined;
  const errorMsg = req.query.error_description as string | undefined;

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
    res.send(`
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
});

authRouter.get("/status", async (_req: Request, res: Response) => {
  try {
    const connected = await isAuthenticated();
    res.json({
      connected,
      email: connected ? env.userEmail : null,
    });
  } catch (err) {
    log.error("Failed to check auth status", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: "Failed to check status" });
  }
});
