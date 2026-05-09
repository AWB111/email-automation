// Domains and patterns for auto-skip rules.
// Emails from these senders bypass AI classification entirely.

export const noReplyPatterns = [
  "noreply",
  "no-reply",
  "no_reply",
  "donotreply",
  "do-not-reply",
  "mailer-daemon",
];

export const socialMediaDomains = [
  "linkedin.com",
  "facebookmail.com",
  "facebook.com",
  "twitter.com",
  "x.com",
  "instagram.com",
  "tiktok.com",
  "pinterest.com",
  "reddit.com",
  "youtube.com",
];

export const paymentDomains = [
  "paypal.com",
  "stripe.com",
  "square.com",
  "venmo.com",
  "wise.com",
  "revolut.com",
  "cash.app",
  "braintreepayments.com",
  "intuit.com",
  "quickbooks.com",
];

export const saasNotificationDomains = [
  "slack.com",
  "atlassian.com",
  "atlassian.net",
  "jira.com",
  "trello.com",
  "notion.so",
  "asana.com",
  "monday.com",
  "clickup.com",
  "github.com",
  "gitlab.com",
  "bitbucket.org",
  "figma.com",
  "canva.com",
  "dropbox.com",
  "google.com",
  "zoom.us",
  "calendly.com",
  "docusign.com",
  "hubspot.com",
  "mailchimp.com",
  "sendgrid.net",
  "intercom.io",
  "zendesk.com",
  "freshdesk.com",
];

export const allSkipDomains = [
  ...socialMediaDomains,
  ...paymentDomains,
  ...saasNotificationDomains,
];
