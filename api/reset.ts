import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../src/db/client.js";
import { getInboxMessages } from "../src/graph/mail.js";
import { getGraphClient } from "../src/graph/client.js";
import { env } from "../src/config/env.js";
import { log } from "../src/utils/logger.js";

export const config = {
  maxDuration: 300,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (env.cronSecret) {
    const auth = req.headers.authorization || "";
    if (auth !== `Bearer ${env.cronSecret}`) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }

  try {
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
      } catch {
        /* ignore individual failures */
      }
    }

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
        } catch {
          /* draft may already be sent/deleted */
        }
      }
    }

    await supabase.from("app_state").delete().eq("key", "last_checked_at");
    await supabase.from("processed_emails").delete().neq("email_id", "");

    res.status(200).json({
      success: true,
      emailsCleaned: cleaned,
      draftsDeleted,
      message: "All badges removed, drafts deleted, state reset.",
    });
  } catch (err) {
    log.error("Reset failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: err instanceof Error ? err.message : "Reset failed" });
  }
}
