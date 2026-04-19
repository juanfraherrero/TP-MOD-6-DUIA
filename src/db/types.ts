export type ConversationRole = "customer" | "admin";

export type MessageRole = "user" | "assistant" | "tool";

export type Device = "mobile" | "tablet" | "desktop";

export const EVENT_TYPES = {
  PAGE_VIEW: "page_view",
  MESSAGE_SENT: "message_sent",
  MESSAGE_RECEIVED: "message_received",
  PROPOSAL_SHOWN: "proposal_shown",
  PROPOSAL_CLICKED: "proposal_clicked",
  PROPOSAL_REJECTED: "proposal_rejected",
  CONVERSION: "conversion",
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];
