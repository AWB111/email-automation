import { Router, Request, Response } from "express";
import { buildToneProfile } from "./analyzer.js";
import { getToneProfile } from "../db/tone.js";
import { env } from "../config/env.js";
import { log } from "../utils/logger.js";

export const toneRouter = Router();

toneRouter.post("/build", async (_req: Request, res: Response) => {
  try {
    const profile = await buildToneProfile();
    res.json({ success: true, profile });
  } catch (err) {
    log.error("Tone build failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({
      error: err instanceof Error ? err.message : "Tone build failed",
    });
  }
});

toneRouter.get("/view", async (_req: Request, res: Response) => {
  try {
    const profile = await getToneProfile(env.userEmail);
    if (!profile) {
      res.status(404).json({
        error: "No tone profile found. Run POST /api/tone/build first.",
      });
      return;
    }
    res.json(profile);
  } catch (err) {
    log.error("Tone view failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: "Failed to retrieve tone profile" });
  }
});
