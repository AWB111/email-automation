import { getGraphClient } from "./client.js";
import { env } from "../config/env.js";

export interface GraphMessage {
  id: string;
  subject: string | null;
  from: { emailAddress: { name: string; address: string } } | null;
  toRecipients: { emailAddress: { name: string; address: string } }[];
  receivedDateTime: string;
  body: { contentType: string; content: string };
  internetMessageHeaders?: { name: string; value: string }[];
  hasAttachments: boolean;
  conversationId: string;
  isRead: boolean;
  isDraft: boolean;
}

/**
 * Fetch inbox messages received after a given timestamp.
 * Returns newest first.
 */
export async function getInboxMessages(
  since?: string,
  top = 50
): Promise<GraphMessage[]> {
  const client = getGraphClient();

  let url = `/me/mailFolders/inbox/messages?$top=${top}&$orderby=receivedDateTime desc&$select=id,subject,from,toRecipients,receivedDateTime,body,hasAttachments,conversationId,isRead`;

  if (since) {
    url += `&$filter=receivedDateTime ge ${since}`;
  }

  // Request internet message headers for marketing detection
  url += `&$expand=`;

  const response = await client.api(url).header("Prefer", 'outlook.body-type="text"').get();

  return response.value || [];
}

/**
 * Fetch inbox messages with internet headers (needed for List-Unsubscribe detection).
 * Uses a separate call since $select with internetMessageHeaders requires specific handling.
 */
export async function getMessageHeaders(
  messageId: string
): Promise<{ name: string; value: string }[]> {
  const client = getGraphClient();

  const response = await client
    .api(`/me/messages/${messageId}?$select=internetMessageHeaders`)
    .get();

  return response.internetMessageHeaders || [];
}

/**
 * Fetch sent mail for tone analysis.
 */
export async function getSentMessages(top = 50): Promise<GraphMessage[]> {
  const client = getGraphClient();

  const response = await client
    .api(
      `/me/mailFolders/sentitems/messages?$top=${top}&$orderby=sentDateTime desc&$select=id,subject,from,toRecipients,receivedDateTime,body,hasAttachments,conversationId,isRead`
    )
    .header("Prefer", 'outlook.body-type="text"')
    .get();

  return response.value || [];
}

/**
 * Fetch conversation thread messages for context when drafting a reply.
 * Returns up to `limit` messages from the same conversation, newest first.
 */
export async function getThreadMessages(
  conversationId: string,
  limit = 5
): Promise<GraphMessage[]> {
  const client = getGraphClient();

  try {
    const response = await client
      .api(
        `/me/messages?$filter=conversationId eq '${conversationId}'&$top=${limit}&$select=id,subject,from,toRecipients,receivedDateTime,body,hasAttachments,conversationId,isRead,isDraft`
      )
      .header("Prefer", 'outlook.body-type="text"')
      .get();

    const messages: GraphMessage[] = response.value || [];
    // Sort newest first in code since $orderby + $filter may not be supported
    messages.sort(
      (a, b) =>
        new Date(b.receivedDateTime).getTime() -
        new Date(a.receivedDateTime).getTime()
    );
    return messages;
  } catch {
    // Fallback: if conversationId filter isn't supported, return empty
    return [];
  }
}

/**
 * Check if the user has already SENT a reply in this conversation.
 * Only counts actually sent messages — ignores drafts.
 */
export async function hasUserReplied(
  conversationId: string,
  afterDateTime: string
): Promise<boolean> {
  const messages = await getThreadMessages(conversationId, 10);

  return messages.some((msg) => {
    const senderEmail = msg.from?.emailAddress?.address?.toLowerCase();
    const isFromUser = senderEmail === env.userEmail.toLowerCase();
    const isNewer = new Date(msg.receivedDateTime) > new Date(afterDateTime);
    const isSent = !msg.isDraft;
    return isFromUser && isNewer && isSent;
  });
}

/**
 * Create a reply draft for a message and save it to the Drafts folder.
 * Uses the Graph createReply endpoint so the draft is properly threaded.
 */
export async function createReplyDraft(
  messageId: string,
  htmlBody: string
): Promise<{ id: string; webLink: string }> {
  const client = getGraphClient();

  // createReply creates a draft reply in the Drafts folder
  const draft = await client.api(`/me/messages/${messageId}/createReply`).post({});

  // Update the draft body with our AI-generated content
  const updated = await client.api(`/me/messages/${draft.id}`).patch({
    body: {
      contentType: "html",
      content: htmlBody,
    },
  });

  return { id: updated.id, webLink: updated.webLink || "" };
}
