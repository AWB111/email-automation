import Anthropic from "@anthropic-ai/sdk";
import { env } from "../config/env.js"
import type { Classification } from "../db/emails.js";
import { log } from "../utils/logger.js";

const anthropic = new Anthropic({ apiKey: env.anthropicApiKey });

const SYSTEM_PROMPT = `You are an email classifier. Given an email's sender, subject, and body snippet, classify it into exactly one category:

- respond: The sender is asking a question, making a request, or expecting a reply. This includes scheduling, follow-ups, direct asks, and anything where silence would be rude.
- marketing: Promotional content, newsletters, product announcements, sales pitches, discount offers.
- invitation: Event invitations, meeting requests, webinar invites, party invites, RSVPs. Anything asking the recipient to attend something.
- notification: Automated alerts, system notifications, security alerts, account updates, shipping updates, password resets.
- fyi: Informational emails, confirmations, receipts, status updates, FYI messages — no reply expected.

Respond with ONLY a JSON object: {"classification": "<category>", "reason": "<one sentence>"}`;

export async function classifyEmail(
  sender: string,
  subject: string,
  bodySnippet: string
): Promise<{ classification: Classification; reason: string }> {
  const userPrompt = `Sender: ${sender}
Subject: ${subject}
Body: ${bodySnippet.slice(0, 1500)}`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 150,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    let text =
      response.content[0].type === "text" ? response.content[0].text : "";
    text = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
    const parsed = JSON.parse(text);

    const valid: Classification[] = [
      "respond",
      "marketing",
      "invitation",
      "notification",
      "fyi",
    ];
    if (!valid.includes(parsed.classification)) {
      log.warn("Unexpected classification, defaulting to fyi", {
        raw: text,
      });
      return { classification: "fyi", reason: "Unparseable classification" };
    }

    return {
      classification: parsed.classification,
      reason: parsed.reason || "",
    };
  } catch (err) {
    log.error("AI classification failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
