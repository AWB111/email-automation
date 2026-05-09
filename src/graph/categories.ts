import { getGraphClient } from "./client.js";
import { log } from "../utils/logger.js";

// Outlook category color presets
// preset0=Red, preset1=Orange, preset2=Peach, preset3=Yellow,
// preset4=Green, preset5=Teal, preset6=Olive, preset7=Blue,
// preset8=Purple, preset9=Cranberry, preset10=Steel, preset11=DarkSteel

const CATEGORY_MAP = {
  respond:      { displayName: "Respond",      color: "preset0" }, // Red
  marketing:    { displayName: "Marketing",     color: "preset1" }, // Orange
  invitation:   { displayName: "Invitation",    color: "preset7" }, // Blue
  notification: { displayName: "Notification",  color: "preset8" }, // Purple
  fyi:          { displayName: "FYI",           color: "preset4" }, // Green
} as const;

type CategoryKey = keyof typeof CATEGORY_MAP;

// All old category names to purge
const OLD_CATEGORIES = [
  "✉️ Respond", "ℹ️ No Reply Needed", "📢 Marketing", "⏭️ Skipped",
  "🔴 Respond", "🔵 No Reply Needed", "🟠 Marketing", "⚪ Skipped",
  "Respond", "No Reply Needed", "Marketing", "Skipped",
  "Notification", "Invitation", "FYI",
];

let categoriesInitialized = false;

async function ensureCategories() {
  if (categoriesInitialized) return;

  const client = getGraphClient();

  let existingNames: Set<string>;
  try {
    const existing = await client.api("/me/outlook/masterCategories").get();
    existingNames = new Set(
      (existing.value || []).map((c: { displayName: string }) => c.displayName)
    );
  } catch (err) {
    log.warn("Cannot read master categories", {
      error: err instanceof Error ? err.message : String(err),
    });
    categoriesInitialized = true;
    return;
  }

  // Delete all old versions
  for (const oldName of OLD_CATEGORIES) {
    if (existingNames.has(oldName)) {
      try {
        await client
          .api(`/me/outlook/masterCategories/${encodeURIComponent(oldName)}`)
          .delete();
      } catch { /* ignore */ }
    }
  }

  // Create fresh categories
  for (const cat of Object.values(CATEGORY_MAP)) {
    try {
      await client.api("/me/outlook/masterCategories").post({
        displayName: cat.displayName,
        color: cat.color,
      });
      log.info(`Created category: ${cat.displayName} (${cat.color})`);
    } catch {
      try {
        await client
          .api(`/me/outlook/masterCategories/${encodeURIComponent(cat.displayName)}`)
          .patch({ color: cat.color });
      } catch { /* ignore */ }
    }
  }

  categoriesInitialized = true;
}

/**
 * Tags an email with a colored category badge.
 * Also removes any flags/importance from previous runs.
 */
export async function tagEmail(messageId: string, classification: string) {
  const cat = CATEGORY_MAP[classification as CategoryKey];
  if (!cat) return;

  try {
    await ensureCategories();

    const client = getGraphClient();
    await client.api(`/me/messages/${messageId}`).patch({
      categories: [cat.displayName],
      importance: "normal",
      flag: { flagStatus: "notFlagged" },
    });
    log.info(`Tagged: "${cat.displayName}"`, { messageId });
  } catch (err) {
    log.warn("Failed to tag email (non-blocking)", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
