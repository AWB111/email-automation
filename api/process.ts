import type { VercelRequest, VercelResponse } from "@vercel/node";
import { processNewEmails } from "../src/processor/processor.js";
import { env } from "../src/config/env.js";
import { log } from "../src/utils/logger.js";

export const config = {
  maxDuration: 300,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (env.cronSecret) {
    const auth = req.headers.authorization || "";
    const expected = `Bearer ${env.cronSecret}`;
    if (auth !== expected) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }

  try {
    const result = await processNewEmails();
    res.status(200).json(result);
  } catch (err) {
    log.error("Process trigger failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({
      error: err instanceof Error ? err.message : "Processing failed",
    });
  }
}
