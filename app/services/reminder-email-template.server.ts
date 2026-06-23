import type { CartReminderSetting } from "@prisma/client";

type RenderInput = {
  setting: CartReminderSetting;
  shop: string;
  email: string;
  cartUrl: string;
  itemCount: number;
  total?: string | null;
  currencyCode?: string | null;
  sourceLabel: string;
};

function escapeHtml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderReminderEmail(input: RenderInput) {
  const { setting } = input;
  const totalLine = input.total
    ? `<p style="margin:0 0 18px;color:#4a5568;font-size:14px;">Cart total: <strong>${escapeHtml(input.total)} ${escapeHtml(input.currencyCode || "")}</strong></p>`
    : "";

  return `
  <div style="background:#f6f7f9;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e6e8ec;">
      <div style="padding:28px 30px;border-bottom:1px solid #edf0f3;">
        <div style="font-size:13px;color:#718096;text-transform:uppercase;letter-spacing:.08em;">${escapeHtml(input.shop)}</div>
        <h1 style="margin:8px 0 0;font-size:26px;line-height:1.25;color:#1a202c;">${escapeHtml(setting.headline)}</h1>
      </div>
      <div style="padding:28px 30px;">
        <p style="margin:0 0 18px;color:#2d3748;font-size:16px;line-height:1.6;">${escapeHtml(setting.bodyText)}</p>
        <p style="margin:0 0 18px;color:#4a5568;font-size:14px;">Items: <strong>${input.itemCount}</strong> · Source: ${escapeHtml(input.sourceLabel)}</p>
        ${totalLine}
        <a href="${escapeHtml(input.cartUrl)}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;border-radius:8px;padding:13px 20px;font-weight:700;font-size:15px;">${escapeHtml(setting.buttonText)}</a>
      </div>
      <div style="padding:18px 30px;background:#fafafa;color:#718096;font-size:12px;line-height:1.5;">
        ${escapeHtml(setting.footerText)}
      </div>
    </div>
  </div>`;
}
