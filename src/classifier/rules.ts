import { env } from "../config/env.js";
import {
  noReplyPatterns,
  allSkipDomains,
} from "../config/skip-senders.js";
import type { GraphMessage } from "../graph/mail.js";
import type { Classification } from "../db/emails.js";

export interface RuleResult {
  matched: boolean;
  classification: Classification;
  reason: string;
}

/**
 * Checks an email against rules-based criteria.
 * Returns a classification if matched, or matched=false if AI should decide.
 */
export function classifyByRules(
  message: GraphMessage,
  headers?: { name: string; value: string }[]
): RuleResult {
  const senderEmail =
    message.from?.emailAddress?.address?.toLowerCase() || "";

  // Rule 1: Self-sent — FYI
  if (senderEmail === env.userEmail.toLowerCase()) {
    return { matched: true, classification: "fyi", reason: "self_sent" };
  }

  // Rule 2: No-reply sender — Notification
  const localPart = senderEmail.split("@")[0] || "";
  if (noReplyPatterns.some((p) => localPart.includes(p))) {
    return { matched: true, classification: "notification", reason: "no_reply_sender" };
  }

  // Rule 3: Blocked domain (social media, payments, SaaS) — Notification
  const senderDomain = senderEmail.split("@")[1] || "";
  if (
    allSkipDomains.some(
      (d) => senderDomain === d || senderDomain.endsWith(`.${d}`)
    )
  ) {
    return { matched: true, classification: "notification", reason: "blocked_domain" };
  }

  // Rule 4: Marketing headers — Marketing
  if (headers) {
    const hasUnsubscribe = headers.some(
      (h) => h.name.toLowerCase() === "list-unsubscribe"
    );
    const precedence = headers
      .find((h) => h.name.toLowerCase() === "precedence")
      ?.value?.toLowerCase();
    if (hasUnsubscribe || precedence === "bulk" || precedence === "list") {
      return { matched: true, classification: "marketing", reason: "marketing_headers" };
    }
  }

  // Rule 5: Calendar invite — Invitation
  const bodyContent = message.body?.content?.toLowerCase() || "";
  if (
    bodyContent.includes("text/calendar") ||
    bodyContent.includes("begin:vcalendar") ||
    bodyContent.includes(".ics")
  ) {
    return { matched: true, classification: "invitation", reason: "calendar_invite" };
  }

  return { matched: false, classification: "fyi", reason: "" };
}
