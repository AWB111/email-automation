import Anthropic from "@anthropic-ai/sdk";
import { env } from "../config/env.js";
import { getThreadMessages, createReplyDraft } from "../graph/mail.js";
import type { GraphMessage } from "../graph/mail.js";
import { textToHtml, wrapWithReviewNote } from "../utils/html.js";
import { log } from "../utils/logger.js";

const anthropic = new Anthropic({ apiKey: env.anthropicApiKey });

const TONE_GUIDE = `Warm, professional Australian-English voice. Friendly but not casual.
- Greeting: "Hi [first name]," when the sender's first name is clear; otherwise "Hi there,".
- Body: concise — typically 2-4 short sentences. Direct and clear, no waffle.
- Voice: first person ("I"). Acknowledge briefly, then answer or propose next step.
- Avoid filler: no "I hope this email finds you well", no "Thank you for reaching out", no AI-sounding phrasing.
- Sign-off: "Thanks," on a new line followed by the user's first name. Use "Best," for more formal threads.`;

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

  const systemPrompt = `You are ghostwriting an email reply on behalf of ${env.userEmail}. Write in first person as the user.

## Tone:
${TONE_GUIDE}

## Rules:
- Write ONLY the reply body. No subject line, no email headers.
- Address the actual content of the email. Be specific, not generic.
- Never commit to a time, date, availability, price, or commitment on the user's behalf. Use a bracketed placeholder like [time], [date], [amount].
- Never make a policy or judgment call on the user's behalf (e.g., refusing a request, agreeing to terms). Instead leave a bracketed prompt for the user, e.g. "[Confirm with user: can we action this internally?]".
- For any factual detail you don't have (a name, a number, a status), use a bracketed placeholder. Do not guess.
- Do not mention that you are an AI or that this is auto-generated.
- Keep it concise. Default to 2-4 sentences unless the situation clearly needs more.`;

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
