export type BaseLayoutOptions = {
  title: string;
  body: string;
  preheader?: string;
};

export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const baseLayout = ({ title, body, preheader }: BaseLayoutOptions): string => {
  const safeTitle = escapeHtml(title);
  const safePreheader = preheader ? escapeHtml(preheader) : "";

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${safeTitle}</title>
    <style>
      body {
        margin: 0;
        padding: 0;
        background-color: #f5f7fb;
        font-family: Arial, sans-serif;
        color: #111827;
      }
      .wrapper {
        width: 100%;
        background-color: #f5f7fb;
        padding: 24px 12px;
      }
      .container {
        max-width: 600px;
        margin: 0 auto;
        background-color: #ffffff;
        border-radius: 10px;
        overflow: hidden;
        box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
      }
      .header {
        background-color: #0f3d66;
        color: #ffffff;
        padding: 20px 24px;
        font-size: 20px;
        font-weight: 700;
        letter-spacing: 0.2px;
      }
      .body {
        padding: 24px;
        font-size: 14px;
        line-height: 1.6;
      }
      .footer {
        padding: 16px 24px 24px;
        font-size: 12px;
        color: #6b7280;
        text-align: center;
      }
      .muted {
        color: #6b7280;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th, td {
        padding: 10px 8px;
        border-bottom: 1px solid #e5e7eb;
        text-align: left;
        vertical-align: top;
      }
      th {
        background-color: #f3f4f6;
        font-weight: 600;
      }
      @media only screen and (max-width: 600px) {
        .wrapper {
          padding: 12px 8px;
        }
        .header {
          font-size: 18px;
          padding: 18px 16px;
        }
        .body {
          padding: 18px 16px;
        }
        th, td {
          padding: 8px 6px;
        }
      }
    </style>
  </head>
  <body>
    <span style="display:none; visibility:hidden; opacity:0; height:0; width:0;">${safePreheader}</span>
    <div class="wrapper">
      <div class="container">
        <div class="header">APlusMedDepot</div>
        <div class="body">
          <h1 style="margin: 0 0 16px; font-size: 22px;">${safeTitle}</h1>
          ${body}
        </div>
        <div class="footer">
          <div>APlusMedDepot Medical Supplies Marketplace</div>
          <div class="muted">This is an automated message. Please do not reply.</div>
        </div>
      </div>
    </div>
  </body>
</html>`;
};
