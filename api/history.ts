import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getProcessedEmails } from "../src/db/emails.js";
import { log } from "../src/utils/logger.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const limitParam = typeof req.query.limit === "string" ? req.query.limit : "50";
    const limit = parseInt(limitParam, 10);
    const emails = await getProcessedEmails(Number.isFinite(limit) ? limit : 50);
    res.status(200).json({ count: emails.length, emails });
  } catch (err) {
    log.error("History fetch failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: "Failed to fetch history" });
  }
}
