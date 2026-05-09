import Anthropic from "@anthropic-ai/sdk";
import { env } from "../config/env.js";
import { getToneProfile } from "../db/tone.js";
import { getThreadMessages, createReplyDraft } from "../graph/mail.js";
import type { GraphMessage } from "../graph/mail.js";
import { textToHtml, wrapWithReviewNote } from "../utils/html.js";
import { log } from "../utils/logger.js";

const anthropic = new Anthropic({ apiKey: env.anthropicApiKey });

function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? text.slice(0, maxLength) + "..." : text;
}

function formatThreadForPrompt(messages: GraphMessage[]): string {
  // Oldest first for natural reading order
  return [...messages]
    .reverse()
    .map((msg) => {
      const from = msg.from?.emailAddress?.address || "unknown";
      const body = truncate(msg.body?.content || "", 2000);
      return `From: ${from}\nSubject: ${msg.subject || "(no subject)"}\nDate: ${msg.receivedDateTime}\n\n${body}`;
    })
    .join("\n\n---\n\n");
}

/**
 * Draft a reply to an email using the user's tone profile and thread context.
 * Returns the draft ID and the generated text.
 */
export async function draftReply(
  message: GraphMessage
): Promise<{ draftId: string; draftText: string }> {
  // Get tone profile
  const toneData = await getToneProfile(env.userEmail);
  if (!toneData) {
    throw new Error(
      "No tone profile found. Run POST /api/tone/build first."
    );
  }

  // Get thread context
  let threadContext = "";
  if (message.conversationId) {
    const threadMessages = await getThreadMessages(
      message.conversationId,
      5
    );
    if (threadMessages.length > 1) {
      threadContext = formatThreadForPrompt(threadMessages);
    }
  }

  const systemPrompt = `You are ghostwriting an email reply on behalf of the user. Write as if you ARE the user — first person, their voice, their style.

## The user's writing style:
${toneData.profile_text}

## Rules:
- Write ONLY the reply body. No subject line, no headers.
- Match the user's greeting style, sign-off, formality, and sentence structure exactly.
- Address the actual content of the email. Be specific, not generic.
- Keep it concise — match the typical length of the user's emails.
- If the email asks a question, answer it directly (or propose a time, suggest next steps, etc.).
- Do not include phrases like "I hope this email finds you well" or other AI-sounding filler.
- Do not mention that you are an AI or that this is auto-generated.
- If you're unsure about specific details (dates, times, numbers), use reasonable placeholders like [date] or [time] that the user can fill in.`;

  let userPrompt = `Write a reply to this email:\n\nFrom: ${message.from?.emailAddress?.address || "unknown"}\nSubject: ${message.subject || "(no subject)"}\nDate: ${message.receivedDateTime}\n\n${truncate(message.body?.content || "", 2000)}`;

  if (threadContext) {
    userPrompt = `Here is the conversation thread for context:\n\n${threadContext}\n\n---\n\nWrite a reply to the most recent email in this thread.`;
  }

  log.info("Generating draft reply", {
    subject: message.subject,
    sender: message.from?.emailAddress?.address,
  });

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1000,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const draftText =
    response.content[0].type === "text" ? response.content[0].text : "";

  if (!draftText) {
    throw new Error("Claude returned empty draft");
  }

  // Convert to HTML and add review note
  const htmlBody = wrapWithReviewNote(textToHtml(draftText));

  // Save draft to Outlook
  const { id: draftId } = await createReplyDraft(message.id, htmlBody);

  log.info("Draft saved to Outlook", {
    draftId,
    subject: message.subject,
  });

  return { draftId, draftText };
}
