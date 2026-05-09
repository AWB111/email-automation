import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getToneProfile } from "../../src/db/tone.js";
import { env } from "../../src/config/env.js";
import { log } from "../../src/utils/logger.js";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const profile = await getToneProfile(env.userEmail);
    if (!profile) {
      res.status(404).json({
        error: "No tone profile found. Run POST /api/tone/build first.",
      });
      return;
    }
    res.status(200).json(profile);
  } catch (err) {
    log.error("Tone view failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: "Failed to retrieve tone profile" });
  }
}
