import Anthropic from "@anthropic-ai/sdk";
import { env } from "../config/env.js";
import { getSentMessages } from "../graph/mail.js";
import { saveToneProfile } from "../db/tone.js";
import { log } from "../utils/logger.js";

const anthropic = new Anthropic({ apiKey: env.anthropicApiKey });

/**
 * Strips quoted replies and signatures from email body text.
 */
function stripQuotedText(body: string): string {
  const lines = body.split("\n");
  const cleaned: string[] = [];

  for (const line of lines) {
    // Stop at common reply markers
    if (
      line.startsWith(">") ||
      line.startsWith("On ") && line.includes("wrote:") ||
      line.startsWith("From:") ||
      line.startsWith("Sent:") ||
      line.startsWith("---") ||
      line.startsWith("___")
    ) {
      break;
    }
    // Stop at common signature markers
    if (
      line.trim() === "--" ||
      line.toLowerCase().includes("sent from my iphone") ||
      line.toLowerCase().includes("sent from my android")
    ) {
      break;
    }
    cleaned.push(line);
  }

  return cleaned.join("\n").trim();
}

const TONE_ANALYSIS_PROMPT = `You are analyzing a person's email writing style. Below are excerpts from their sent emails. Produce a detailed tone profile that could be used to ghostwrite emails in their voice.

Your analysis should be a structured document with these sections:

## Greeting Style
How they open emails (e.g., "Hi [Name],", "Hey,", "Dear [Name],", no greeting, etc.)

## Sign-off Style
How they close emails (e.g., "Best,", "Thanks,", "Cheers,", their name, nothing, etc.)

## Formality Level
Casual, professional, somewhere in between? Does it vary by context?

## Sentence Structure
Short and punchy? Long and detailed? Mix? Average complexity?

## Tone Descriptors
3-5 adjectives that describe their voice (e.g., warm, direct, concise, friendly, formal)

## Common Phrases
Specific phrases or expressions they tend to use

## Example Excerpts
Quote 3-5 short representative snippets (1-2 sentences each) from their emails that best capture their voice

Be specific and concrete. Use actual examples from the emails.`;

export async function buildToneProfile(): Promise<string> {
  log.info("Fetching sent emails for tone analysis...");

  const sentMessages = await getSentMessages(50);

  if (sentMessages.length === 0) {
    throw new Error(
      "No sent emails found. Send a few emails first so the system can learn your style."
    );
  }

  log.info(`Fetched ${sentMessages.length} sent emails`);

  // Extract and clean body text
  const emailExcerpts = sentMessages
    .map((msg) => {
      const body = stripQuotedText(msg.body?.content || "");
      if (body.length < 20) return null; // skip very short emails
      return `--- Email to: ${msg.toRecipients?.[0]?.emailAddress?.address || "unknown"} | Subject: ${msg.subject || "(no subject)"} ---\n${body.slice(0, 500)}`;
    })
    .filter(Boolean)
    .join("\n\n");

  if (emailExcerpts.length < 100) {
    throw new Error(
      "Not enough email content to analyze. Send more emails with substantive content."
    );
  }

  log.info("Sending to Claude for tone analysis...");

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    system: TONE_ANALYSIS_PROMPT,
    messages: [
      {
        role: "user",
        content: `Here are the sent emails to analyze:\n\n${emailExcerpts}`,
      },
    ],
  });

  const profileText =
    response.content[0].type === "text" ? response.content[0].text : "";

  if (!profileText) {
    throw new Error("Claude returned empty tone analysis");
  }

  await saveToneProfile(env.userEmail, profileText, sentMessages.length);

  log.info("Tone profile saved", { emailsAnalyzed: sentMessages.length });

  return profileText;
}
