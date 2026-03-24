import { resend } from "../config/email";

const FROM_EMAIL = "APlusMedDepot <noreply@aplusmeddepot.com>";

export class SupplierEmailService {
  static async sendApplicationReceived(email: string, businessName: string): Promise<void> {
    try {
      if (!resend) {
        console.warn("RESEND_API_KEY not configured. Skipping email.");
        return;
      }

      const subject = "APlusMedDepot — Supplier Application Received";
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
              <h1 style="color: #0066cc; margin-top: 0;">Application Received</h1>
              <p>Dear Supplier,</p>
              <p>Thank you for submitting your supplier application for <strong>${businessName}</strong> to APlusMedDepot.</p>
              <p>Your application is now under review by our team. We will carefully evaluate your business details and documentation.</p>
              <p>You can expect to hear from us within <strong>2-3 business days</strong> regarding the status of your application.</p>
              <p>If you have any questions in the meantime, please don't hesitate to contact our support team.</p>
              <p style="margin-top: 30px;">Best regards,<br><strong>APlusMedDepot Team</strong></p>
            </div>
          </body>
        </html>
      `;

      await resend.emails.send({
        from: FROM_EMAIL,
        to: email,
        subject,
        html,
      });
    } catch (error) {
      console.error("Failed to send application received email:", error);
    }
  }

  static async sendApplicationUnderReview(email: string, businessName: string): Promise<void> {
    try {
      if (!resend) {
        console.warn("RESEND_API_KEY not configured. Skipping email.");
        return;
      }

      const subject = "APlusMedDepot — Application Under Review";
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
              <h1 style="color: #0066cc; margin-top: 0;">Application Under Review</h1>
              <p>Dear Supplier,</p>
              <p>Your supplier application for <strong>${businessName}</strong> is now being actively reviewed by our team.</p>
              <p>We are carefully evaluating your business information and documentation to ensure compliance with our marketplace standards.</p>
              <p>We'll notify you as soon as we've completed our review.</p>
              <p style="margin-top: 30px;">Best regards,<br><strong>APlusMedDepot Team</strong></p>
            </div>
          </body>
        </html>
      `;

      await resend.emails.send({
        from: FROM_EMAIL,
        to: email,
        subject,
        html,
      });
    } catch (error) {
      console.error("Failed to send application under review email:", error);
    }
  }

  static async sendApplicationApproved(
    email: string,
    businessName: string,
    commissionRate: number,
  ): Promise<void> {
    try {
      if (!resend) {
        console.warn("RESEND_API_KEY not configured. Skipping email.");
        return;
      }

      const subject = "APlusMedDepot — Supplier Application Approved!";
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: #d4edda; padding: 20px; border-radius: 8px; border: 2px solid #28a745;">
              <h1 style="color: #155724; margin-top: 0;">🎉 Congratulations!</h1>
              <p>Dear Supplier,</p>
              <p>We are pleased to inform you that your supplier application for <strong>${businessName}</strong> has been approved!</p>
              <div style="background-color: #fff; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <p style="margin: 0;"><strong>Your Commission Rate:</strong> ${commissionRate}%</p>
              </div>
              <p>You can now log in to your account and start adding products to the APlusMedDepot marketplace.</p>
              <p>Next steps:</p>
              <ul>
                <li>Log in to your supplier dashboard</li>
                <li>Add your product catalog</li>
                <li>Set up your inventory</li>
                <li>Start receiving orders!</li>
              </ul>
              <p>Welcome to the APlusMedDepot supplier community!</p>
              <p style="margin-top: 30px;">Best regards,<br><strong>APlusMedDepot Team</strong></p>
            </div>
          </body>
        </html>
      `;

      await resend.emails.send({
        from: FROM_EMAIL,
        to: email,
        subject,
        html,
      });
    } catch (error) {
      console.error("Failed to send application approved email:", error);
    }
  }

  static async sendApplicationRejected(
    email: string,
    businessName: string,
    reason: string,
  ): Promise<void> {
    try {
      if (!resend) {
        console.warn("RESEND_API_KEY not configured. Skipping email.");
        return;
      }

      const subject = "APlusMedDepot — Supplier Application Update";
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
              <h1 style="color: #856404; margin-top: 0;">Application Update</h1>
              <p>Dear Supplier,</p>
              <p>Thank you for your interest in becoming a supplier on APlusMedDepot.</p>
              <p>After careful review of your application for <strong>${businessName}</strong>, we are unable to approve it at this time.</p>
              <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #ffc107;">
                <p style="margin: 0;"><strong>Reason:</strong></p>
                <p style="margin: 10px 0 0 0;">${reason}</p>
              </div>
              <p>If you have any questions about this decision or would like to discuss your application further, please contact our support team.</p>
              <p style="margin-top: 30px;">Best regards,<br><strong>APlusMedDepot Team</strong></p>
            </div>
          </body>
        </html>
      `;

      await resend.emails.send({
        from: FROM_EMAIL,
        to: email,
        subject,
        html,
      });
    } catch (error) {
      console.error("Failed to send application rejected email:", error);
    }
  }

  static async sendRevisionRequested(email: string, businessName: string): Promise<void> {
    try {
      if (!resend) {
        console.warn("RESEND_API_KEY not configured. Skipping email.");
        return;
      }

      const subject = "APlusMedDepot — Revisions Needed on Your Application";
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: #fff3cd; padding: 20px; border-radius: 8px; border: 2px solid #ffc107;">
              <h1 style="color: #856404; margin-top: 0;">Revisions Required</h1>
              <p>Dear Supplier,</p>
              <p>We've reviewed your supplier application for <strong>${businessName}</strong> and need some additional information or updates before we can proceed.</p>
              <p><strong>Action Required:</strong></p>
              <ul>
                <li>Log in to your supplier account</li>
                <li>Review the feedback provided</li>
                <li>Update your documents or information as needed</li>
                <li>Resubmit your application</li>
              </ul>
              <p>Once you've made the necessary updates, our team will review your application again promptly.</p>
              <p>If you have any questions about the required changes, please contact our support team.</p>
              <p style="margin-top: 30px;">Best regards,<br><strong>APlusMedDepot Team</strong></p>
            </div>
          </body>
        </html>
      `;

      await resend.emails.send({
        from: FROM_EMAIL,
        to: email,
        subject,
        html,
      });
    } catch (error) {
      console.error("Failed to send revision requested email:", error);
    }
  }

  static async sendAccountSuspended(email: string, businessName: string): Promise<void> {
    try {
      if (!resend) {
        console.warn("RESEND_API_KEY not configured. Skipping email.");
        return;
      }

      const subject = "APlusMedDepot — Supplier Account Suspended";
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: #f8d7da; padding: 20px; border-radius: 8px; border: 2px solid #dc3545;">
              <h1 style="color: #721c24; margin-top: 0;">Account Suspended</h1>
              <p>Dear Supplier,</p>
              <p>Your supplier account for <strong>${businessName}</strong> has been temporarily suspended.</p>
              <p>This means you will not be able to:</p>
              <ul>
                <li>Add or update products</li>
                <li>Receive new orders</li>
                <li>Access certain account features</li>
              </ul>
              <p><strong>Please contact our support team immediately</strong> to understand the reason for this suspension and discuss the steps needed to resolve this issue.</p>
              <p>We are committed to maintaining a high-quality marketplace and ensuring the best experience for all users.</p>
              <p style="margin-top: 30px;">Best regards,<br><strong>APlusMedDepot Team</strong></p>
            </div>
          </body>
        </html>
      `;

      await resend.emails.send({
        from: FROM_EMAIL,
        to: email,
        subject,
        html,
      });
    } catch (error) {
      console.error("Failed to send account suspended email:", error);
    }
  }
}
