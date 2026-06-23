import type { CartReminderSetting } from "@prisma/client";

type EmailLineItem = {
  title?: string | null;
  variantTitle?: string | null;
  sku?: string | null;
  quantity?: number | string | null;
  price?: number | string | null;
  url?: string | null;
};

type RenderInput = {
  setting: CartReminderSetting;
  shop: string;
  email: string;
  cartUrl: string;
  itemCount: number;
  total?: string | null;
  currencyCode?: string | null;
  sourceLabel: string;
  lineItems?: EmailLineItem[] | null;
};

function escapeHtml(value: unknown) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatItemPrice(value: unknown, currencyCode?: string | null) {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return `${n.toFixed(2)}${currencyCode ? ` ${currencyCode}` : ""}`;
}

function renderLineItems(items: EmailLineItem[] | null | undefined, currencyCode?: string | null) {
  const rows = Array.isArray(items) ? items.slice(0, 12) : [];
  if (!rows.length) return "";

  const itemRows = rows.map((item) => {
    const title = escapeHtml(item.title || "Product");
    const variant = item.variantTitle ? `<div style="margin-top:3px;color:#6b7280;font-size:12px;line-height:1.35;">${escapeHtml(item.variantTitle)}</div>` : "";
    const sku = item.sku ? `<div style="margin-top:3px;color:#6b7280;font-size:12px;line-height:1.35;">SKU: ${escapeHtml(item.sku)}</div>` : "";
    const qty = Number(item.quantity || 0) || 0;
    const price = formatItemPrice(item.price, currencyCode);

    return `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #edf0f3;vertical-align:top;">
          <div style="font-size:14px;font-weight:700;color:#111827;line-height:1.4;">${title}</div>
          ${variant}
          ${sku}
        </td>
        <td style="padding:12px 0;border-bottom:1px solid #edf0f3;vertical-align:top;text-align:center;color:#374151;font-size:14px;white-space:nowrap;">${qty}</td>
        <td style="padding:12px 0;border-bottom:1px solid #edf0f3;vertical-align:top;text-align:right;color:#374151;font-size:14px;white-space:nowrap;">${escapeHtml(price)}</td>
      </tr>`;
  }).join("");

  const hiddenCount = Array.isArray(items) && items.length > rows.length ? items.length - rows.length : 0;
  const moreLine = hiddenCount > 0
    ? `<p style="margin:10px 0 0;color:#6b7280;font-size:12px;">+ ${hiddenCount} more item(s) in cart</p>`
    : "";

  return `
    <div style="margin:22px 0 22px;">
      <h2 style="margin:0 0 10px;color:#111827;font-size:17px;line-height:1.3;">Items in your cart</h2>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
        <thead>
          <tr>
            <th align="left" style="padding:0 0 8px;color:#6b7280;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid #dfe3e8;">Product</th>
            <th align="center" style="padding:0 0 8px;color:#6b7280;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid #dfe3e8;width:52px;">Qty</th>
            <th align="right" style="padding:0 0 8px;color:#6b7280;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid #dfe3e8;width:104px;">Price</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
      ${moreLine}
    </div>`;
}

export function renderReminderEmail(input: RenderInput) {
  const { setting } = input;
  const totalLine = input.total
    ? `<p style="margin:0 0 18px;color:#4a5568;font-size:14px;">Cart total: <strong>${escapeHtml(input.total)} ${escapeHtml(input.currencyCode || "")}</strong></p>`
    : "";
  const lineItemsHtml = renderLineItems(input.lineItems, input.currencyCode);

  return `
  <div style="background:#f6f7f9;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:660px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e6e8ec;">
      <div style="padding:28px 30px;border-bottom:1px solid #edf0f3;">
        <div style="font-size:13px;color:#718096;text-transform:uppercase;letter-spacing:.08em;">${escapeHtml(input.shop)}</div>
        <h1 style="margin:8px 0 0;font-size:26px;line-height:1.25;color:#1a202c;">${escapeHtml(setting.headline)}</h1>
      </div>
      <div style="padding:28px 30px;">
        <p style="margin:0 0 18px;color:#2d3748;font-size:16px;line-height:1.6;">${escapeHtml(setting.bodyText)}</p>
        <p style="margin:0 0 18px;color:#4a5568;font-size:14px;">Items: <strong>${input.itemCount}</strong> · Source: ${escapeHtml(input.sourceLabel)}</p>
        ${lineItemsHtml}
        ${totalLine}
        <a href="${escapeHtml(input.cartUrl)}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;border-radius:8px;padding:13px 20px;font-weight:700;font-size:15px;">${escapeHtml(setting.buttonText)}</a>
      </div>
      <div style="padding:18px 30px;background:#fafafa;color:#718096;font-size:12px;line-height:1.5;">
        ${escapeHtml(setting.footerText)}
      </div>
    </div>
  </div>`;
}
