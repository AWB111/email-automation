import { Router, Request, Response } from "express";
import { processNewEmails } from "./processor.js";
import { getProcessedEmails } from "../db/emails.js";
import { supabase } from "../db/client.js";
import { getInboxMessages } from "../graph/mail.js";
import { log } from "../utils/logger.js";

export const processorRouter = Router();

processorRouter.post("/process", async (_req: Request, res: Response) => {
  try {
    const result = await processNewEmails();
    res.json(result);
  } catch (err) {
    log.error("Process trigger failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({
      error: err instanceof Error ? err.message : "Processing failed",
    });
  }
});

/**
 * Full clean reset: removes all badges from inbox emails,
 * clears DB state, and deletes draft replies.
 * Hit this before recording a demo.
 */
processorRouter.post("/reset", async (_req: Request, res: Response) => {
  try {
    // Step 1: Remove badges, flags, importance from all inbox emails
    const { getGraphClient } = await import("../graph/client.js");
    const client = getGraphClient();
    const messages = await getInboxMessages(undefined, 50);

    let cleaned = 0;
    for (const msg of messages) {
      try {
        await client.api(`/me/messages/${msg.id}`).patch({
          categories: [],
          importance: "normal",
          flag: { flagStatus: "notFlagged" },
        });
        cleaned++;
      } catch { /* ignore individual failures */ }
    }

    // Step 2: Delete draft replies we created
    const { data: processed } = await supabase
      .from("processed_emails")
      .select("draft_id")
      .eq("draft_created", true)
      .not("draft_id", "is", null);

    let draftsDeleted = 0;
    if (processed) {
      for (const row of processed) {
        try {
          await client.api(`/me/messages/${row.draft_id}`).delete();
          draftsDeleted++;
        } catch { /* draft may already be sent/deleted */ }
      }
    }

    // Step 3: Clear DB state
    await supabase.from("app_state").delete().eq("key", "last_checked_at");
    await supabase.from("processed_emails").delete().neq("email_id", "");

    res.json({
      success: true,
      emailsCleaned: cleaned,
      draftsDeleted,
      message: "All badges removed, drafts deleted, state reset. Ready for demo.",
    });
  } catch (err) {
    log.error("Reset failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: err instanceof Error ? err.message : "Reset failed" });
  }
});

processorRouter.get("/history", async (req: Request, res: Response) => {
  try {
    const limit = parseInt((req.query.limit as string) || "50", 10);
    const emails = await getProcessedEmails(limit);
    res.json({ count: emails.length, emails });
  } catch (err) {
    log.error("History fetch failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: "Failed to fetch history" });
  }
});
