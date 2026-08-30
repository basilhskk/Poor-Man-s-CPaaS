import { createHmac } from "crypto";

export interface WebhookPayload {
  event: string;
  data: Record<string, unknown>;
}

export function fireWebhook(
  url: string,
  payload: WebhookPayload,
  secret?: string | null,
): void {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (secret) {
    const sig = createHmac("sha256", secret).update(body).digest("hex");
    headers["X-Webhook-Signature"] = `sha256=${sig}`;
  }
  fetch(url, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(10_000),
  }).catch(() => {});
}
