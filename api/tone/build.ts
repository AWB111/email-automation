import type { VercelRequest, VercelResponse } from "@vercel/node";
import { buildToneProfile } from "../../src/tone/analyzer.js";
import { log } from "../../src/utils/logger.js";

export const config = {
  maxDuration: 300,
};

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const profile = await buildToneProfile();
    res.status(200).json({ success: true, profile });
  } catch (err) {
    log.error("Tone build failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({
      error: err instanceof Error ? err.message : "Tone build failed",
    });
  }
}
