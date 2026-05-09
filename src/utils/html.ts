/**
 * Converts plain text from AI output into clean HTML for Outlook drafts.
 * Handles paragraphs and line breaks.
 */
export function textToHtml(text: string): string {
  const paragraphs = text.split(/\n\n+/);

  const htmlParagraphs = paragraphs.map((p) => {
    const escaped = p
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const withBreaks = escaped.replace(/\n/g, "<br>");
    return `<p>${withBreaks}</p>`;
  });

  return htmlParagraphs.join("");
}

/**
 * Wraps the draft body with the auto-drafted review note.
 */
export function wrapWithReviewNote(htmlBody: string): string {
  const note = `<p style="color: #888; font-size: 11px; font-style: italic; margin-top: 16px; border-top: 1px solid #eee; padding-top: 8px;">Auto-drafted by Email Assistant — please review before sending.</p>`;
  return `${htmlBody}${note}`;
}
