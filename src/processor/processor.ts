import { getInboxMessages, getMessageHeaders, hasUserReplied } from "../graph/mail.js";
import { classifyByRules } from "../classifier/rules.js";
import { classifyEmail } from "../classifier/ai-classifier.js";
import { draftReply } from "../drafter/drafter.js";
import { isEmailProcessed, logProcessedEmail } from "../db/emails.js";
import { getState, setState } from "../db/state.js";
import { tagEmail } from "../graph/categories.js";
import { env } from "../config/env.js";
import { log } from "../utils/logger.js";

const LAST_CHECKED_KEY = "last_checked_at";

export interface ProcessResult {
  total: number;
  skippedByRule: number;
  classifiedByAi: number;
  draftsCreated: number;
  errors: number;
  details: {
    emailId: string;
    sender: string;
    subject: string;
    classification: string;
    draftCreated: boolean;
    skippedByRule: boolean;
    error?: string;
  }[];
}

export async function processNewEmails(): Promise<ProcessResult> {
  const result: ProcessResult = {
    total: 0,
    skippedByRule: 0,
    classifiedByAi: 0,
    draftsCreated: 0,
    errors: 0,
    details: [],
  };

  const lastChecked = await getState(LAST_CHECKED_KEY);
  const since = lastChecked || undefined;

  log.info("Processing new emails", { since: since || "all time" });

  const messages = await getInboxMessages(since, 50);
  result.total = messages.length;

  if (messages.length === 0) {
    log.info("No new emails to process");
    return result;
  }

  log.info(`Found ${messages.length} emails to process`);

  for (const message of messages) {
    const sender = message.from?.emailAddress?.address || "unknown";
    const subject = message.subject || "(no subject)";
    const detail: ProcessResult["details"][number] = {
      emailId: message.id,
      sender,
      subject,
      classification: "",
      draftCreated: false,
      skippedByRule: false,
    };

    try {
      if (await isEmailProcessed(message.id)) {
        continue;
      }

      // Step 1: Rules-based classification
      const headers = await getMessageHeaders(message.id).catch(() => []);
      const ruleResult = classifyByRules(message, headers);

      if (ruleResult.matched) {
        detail.classification = ruleResult.classification;
        detail.skippedByRule = true;
        result.skippedByRule++;

        await tagEmail(message.id, ruleResult.classification);

        await logProcessedEmail({
          email_id: message.id,
          user_email: env.userEmail,
          sender,
          subject,
          classification: ruleResult.classification,
          skipped_by_rule: true,
          draft_created: false,
          draft_id: null,
          error: null,
        });

        log.info(`Rule matched: ${ruleResult.classification} (${ruleResult.reason})`, { sender, subject });
        result.details.push(detail);
        continue;
      }

      // Step 2: AI classification
      const bodySnippet = message.body?.content || "";
      const { classification, reason } = await classifyEmail(sender, subject, bodySnippet);

      detail.classification = classification;
      result.classifiedByAi++;

      log.info(`Classified: ${classification}`, { sender, subject, reason });

      await tagEmail(message.id, classification);

      // Step 3: Draft reply only for "respond"
      if (classification === "respond") {
        const alreadyReplied = await hasUserReplied(
          message.conversationId,
          message.receivedDateTime
        );

        if (alreadyReplied) {
          log.info("User already replied, skipping draft", { sender, subject });
          detail.classification = "respond (already replied)";
        } else {
          const { draftId } = await draftReply(message);
          detail.draftCreated = true;
          result.draftsCreated++;

          await logProcessedEmail({
            email_id: message.id,
            user_email: env.userEmail,
            sender,
            subject,
            classification,
            skipped_by_rule: false,
            draft_created: true,
            draft_id: draftId,
            error: null,
          });

          result.details.push(detail);
          continue;
        }
      }

      await logProcessedEmail({
        email_id: message.id,
        user_email: env.userEmail,
        sender,
        subject,
        classification,
        skipped_by_rule: false,
        draft_created: false,
        draft_id: null,
        error: null,
      });
    } catch (err) {
      result.errors++;
      const errorMsg = err instanceof Error ? err.message : String(err);
      detail.error = errorMsg;

      log.error("Error processing email", { sender, subject, error: errorMsg });

      await logProcessedEmail({
        email_id: message.id,
        user_email: env.userEmail,
        sender,
        subject,
        classification: "fyi",
        skipped_by_rule: false,
        draft_created: false,
        draft_id: null,
        error: errorMsg,
      }).catch(() => {});
    }

    result.details.push(detail);
  }

  if (messages.length > 0) {
    const newest = messages[0].receivedDateTime;
    await setState(LAST_CHECKED_KEY, newest);
  }

  log.info("Processing complete", {
    total: result.total,
    skippedByRule: result.skippedByRule,
    classifiedByAi: result.classifiedByAi,
    draftsCreated: result.draftsCreated,
    errors: result.errors,
  });

  return result;
}
