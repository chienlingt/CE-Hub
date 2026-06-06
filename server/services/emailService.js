// server/services/emailService.js
const nodemailer = require('nodemailer');

/**
 * Email Service for sending password reset emails
 *
 * Configuration:
 * Set these environment variables in your .env file:
 * - EMAIL_HOST (e.g., smtp.gmail.com)
 * - EMAIL_PORT (e.g., 587)
 * - EMAIL_USER (your email address)
 * - EMAIL_PASSWORD (your email password or app-specific password)
 * - EMAIL_FROM (sender name and email)
 * - CLIENT_URL (frontend URL, e.g., http://localhost:3000)
 */

// Create reusable transporter
let transporter = null;

function createTransporter() {
  if (transporter) return transporter;

  const config = {
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT || '587'),
    secure: process.env.EMAIL_PORT === '465', // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    }
  };

  // If email credentials are not configured, log warning and return null
  if (!config.auth.user || !config.auth.pass) {
    console.warn('Email service not configured. Set EMAIL_USER and EMAIL_PASSWORD in .env');
    console.warn('For Gmail: Use App Password from https://myaccount.google.com/apppasswords');
    return null;
  }

  transporter = nodemailer.createTransport(config);

  // Verify connection configuration
  transporter.verify((error, success) => {
    if (error) {
      console.error('Email service configuration error:', error.message);
    } else {
      console.log('Email service ready to send emails');
    }
  });

  return transporter;
}

/**
 * Send password reset email
 * @param {string} to - Recipient email address
 * @param {string} employeeName - Employee's name
 * @param {string} resetToken - JWT reset token
 * @returns {Promise<boolean>} Success status
 */
async function sendPasswordResetEmail(to, employeeName, resetToken) {
  const transport = createTransporter();

  if (!transport) {
    console.error('Cannot send email: Email service not configured');
    return false;
  }

  const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
  const resetUrl = `${clientUrl}/reset-password?token=${resetToken}`;

  const mailOptions = {
    from: process.env.EMAIL_FROM || `"TBM Delivery" <${process.env.EMAIL_USER}>`,
    to: to,
    subject: 'Password Reset Request - TBM Delivery System',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Password Reset</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f4f4f4;">
          <tr>
            <td style="padding: 40px 20px;">
              <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">

                <!-- Header -->
                <tr>
                  <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px 8px 0 0;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold;">
                      🔐 Password Reset Request
                    </h1>
                  </td>
                </tr>

                <!-- Content -->
                <tr>
                  <td style="padding: 40px;">
                    <p style="margin: 0 0 20px; color: #333333; font-size: 16px; line-height: 1.6;">
                      Hello <strong>${employeeName}</strong>,
                    </p>

                    <p style="margin: 0 0 20px; color: #666666; font-size: 15px; line-height: 1.6;">
                      We received a request to reset your password for your TBM Delivery System account.
                      Click the button below to create a new password:
                    </p>

                    <!-- Button -->
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 30px 0;">
                      <tr>
                        <td style="text-align: center;">
                          <a href="${resetUrl}"
                             style="display: inline-block; padding: 14px 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: bold; box-shadow: 0 4px 6px rgba(102, 126, 234, 0.4);">
                            Reset Password
                          </a>
                        </td>
                      </tr>
                    </table>

                    <p style="margin: 20px 0; color: #666666; font-size: 14px; line-height: 1.6;">
                      Or copy and paste this link into your browser:
                    </p>
                    <p style="margin: 0 0 20px; padding: 12px; background-color: #f8f9fa; border-radius: 4px; word-break: break-all; font-size: 13px; color: #667eea;">
                      ${resetUrl}
                    </p>

                    <!-- Warning Box -->
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 30px 0;">
                      <tr>
                        <td style="padding: 16px; background-color: #fff3cd; border-left: 4px solid #ffc107; border-radius: 4px;">
                          <p style="margin: 0; color: #856404; font-size: 14px; line-height: 1.5;">
                            ⏰ <strong>Important:</strong> This link will expire in 1 hour for security reasons.
                          </p>
                        </td>
                      </tr>
                    </table>

                    <p style="margin: 20px 0 0; color: #999999; font-size: 14px; line-height: 1.6;">
                      If you didn't request a password reset, please ignore this email or contact your administrator if you have concerns.
                    </p>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="padding: 30px 40px; background-color: #f8f9fa; border-radius: 0 0 8px 8px; border-top: 1px solid #e9ecef;">
                    <p style="margin: 0 0 10px; color: #999999; font-size: 12px; line-height: 1.5; text-align: center;">
                      This is an automated message from TBM Delivery System
                    </p>
                    <p style="margin: 0; color: #999999; font-size: 12px; line-height: 1.5; text-align: center;">
                      © ${new Date().getFullYear()} TBM Delivery. All rights reserved.
                    </p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `
  };

  try {
    const info = await transport.sendMail(mailOptions);
    console.log('Password reset email sent:', info.messageId);
    console.log('   To:', to);
    console.log('   Preview URL:', nodemailer.getTestMessageUrl(info));
    return true;
  } catch (error) {
    console.error('Failed to send password reset email:', error.message);
    return false;
  }
}

/**
 * Send test email to verify configuration
 * @param {string} to - Test recipient email
 * @returns {Promise<boolean>}
 */
async function sendTestEmail(to) {
  const transport = createTransporter();

  if (!transport) {
    console.error('Cannot send test email: Email service not configured');
    return false;
  }

  const mailOptions = {
    from: process.env.EMAIL_FROM || `"TBM Delivery" <${process.env.EMAIL_USER}>`,
    to: to,
    subject: 'Test Email - TBM Delivery System',
    html: `
      <h2>Email Configuration Test</h2>
      <p>If you received this email, your email service is configured correctly!</p>
      <p>Timestamp: ${new Date().toISOString()}</p>
    `
  };

  try {
    const info = await transport.sendMail(mailOptions);
    console.log('Test email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('Failed to send test email:', error.message);
    return false;
  }
}

/**
 * Send delivery failure notification to internal staff (admin / salesperson)
 * FR-06-001, FR-06-002
 */
async function sendDeliveryFailureInternalEmail(to, recipientName, { orderRef, customerName, address, failureReason, failureDesc, driverName }) {
  const transport = createTransporter();
  if (!transport) return false;

  const mailOptions = {
    from: process.env.EMAIL_FROM || `"TBM Delivery" <${process.env.EMAIL_USER}>`,
    to,
    subject: `[Action Required] Delivery Failed — ${orderRef}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
      <body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f4f4f4;">
        <table width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f4;">
          <tr><td style="padding:40px 20px;">
            <table width="600" cellspacing="0" cellpadding="0" style="margin:0 auto;background:#fff;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1);">

              <!-- Header -->
              <tr>
                <td style="padding:32px 40px 20px;background:#c0392b;border-radius:8px 8px 0 0;text-align:center;">
                  <h1 style="margin:0;color:#fff;font-size:22px;">Delivery Failed</h1>
                  <p style="margin:8px 0 0;color:#f8d7da;font-size:14px;">Immediate attention required</p>
                </td>
              </tr>

              <!-- Body -->
              <tr>
                <td style="padding:32px 40px;">
                  <p style="margin:0 0 16px;color:#333;font-size:15px;">Dear <strong>${recipientName}</strong>,</p>
                  <p style="margin:0 0 24px;color:#555;font-size:14px;">
                    A delivery has failed and requires your follow-up. Details are below.
                  </p>

                  <!-- Details table -->
                  <table width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e0e0e0;border-radius:6px;margin-bottom:24px;">
                    <tr style="background:#f8f9fa;">
                      <td style="padding:10px 16px;font-size:13px;font-weight:bold;color:#555;width:40%;border-bottom:1px solid #e0e0e0;">Order Reference</td>
                      <td style="padding:10px 16px;font-size:13px;color:#222;border-bottom:1px solid #e0e0e0;">${orderRef}</td>
                    </tr>
                    <tr>
                      <td style="padding:10px 16px;font-size:13px;font-weight:bold;color:#555;border-bottom:1px solid #e0e0e0;">Customer</td>
                      <td style="padding:10px 16px;font-size:13px;color:#222;border-bottom:1px solid #e0e0e0;">${customerName}</td>
                    </tr>
                    <tr style="background:#f8f9fa;">
                      <td style="padding:10px 16px;font-size:13px;font-weight:bold;color:#555;border-bottom:1px solid #e0e0e0;">Delivery Address</td>
                      <td style="padding:10px 16px;font-size:13px;color:#222;border-bottom:1px solid #e0e0e0;">${address}</td>
                    </tr>
                    <tr>
                      <td style="padding:10px 16px;font-size:13px;font-weight:bold;color:#555;border-bottom:1px solid #e0e0e0;">Driver</td>
                      <td style="padding:10px 16px;font-size:13px;color:#222;border-bottom:1px solid #e0e0e0;">${driverName || 'N/A'}</td>
                    </tr>
                    <tr style="background:#fff3f3;">
                      <td style="padding:10px 16px;font-size:13px;font-weight:bold;color:#c0392b;border-bottom:1px solid #e0e0e0;">Failure Reason</td>
                      <td style="padding:10px 16px;font-size:13px;color:#c0392b;font-weight:bold;border-bottom:1px solid #e0e0e0;">${failureReason}</td>
                    </tr>
                    <tr>
                      <td style="padding:10px 16px;font-size:13px;font-weight:bold;color:#555;">Additional Details</td>
                      <td style="padding:10px 16px;font-size:13px;color:#222;">${failureDesc || 'None provided'}</td>
                    </tr>
                  </table>

                  <p style="margin:0;color:#888;font-size:13px;">
                    Please log in to CE Hub to review this order and take appropriate action.
                  </p>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="padding:20px 40px;background:#f8f9fa;border-radius:0 0 8px 8px;border-top:1px solid #e9ecef;text-align:center;">
                  <p style="margin:0;color:#999;font-size:12px;">TBM Delivery System — Automated Notification</p>
                </td>
              </tr>

            </table>
          </td></tr>
        </table>
      </body>
      </html>
    `
  };

  try {
    const info = await transport.sendMail(mailOptions);
    console.log(`[Email] Failure internal notification sent to ${to}:`, info.messageId);
    return true;
  } catch (err) {
    console.error('[Email] Failed to send internal failure email:', err.message);
    return false;
  }
}

/**
 * Send delivery failure notification to the customer
 * FR-06-004
 */
async function sendDeliveryFailureCustomerEmail(to, customerName, { orderRef, failureReason, nextSteps }) {
  const transport = createTransporter();
  if (!transport) return false;

  const mailOptions = {
    from: process.env.EMAIL_FROM || `"TBM Delivery" <${process.env.EMAIL_USER}>`,
    to,
    subject: `Update on Your Delivery — ${orderRef}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
      <body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f4f4f4;">
        <table width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f4;">
          <tr><td style="padding:40px 20px;">
            <table width="600" cellspacing="0" cellpadding="0" style="margin:0 auto;background:#fff;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1);">

              <!-- Header -->
              <tr>
                <td style="padding:32px 40px 20px;background:#2c3e50;border-radius:8px 8px 0 0;text-align:center;">
                  <h1 style="margin:0;color:#fff;font-size:22px;">Delivery Update</h1>
                  <p style="margin:8px 0 0;color:#bdc3c7;font-size:14px;">Order ${orderRef}</p>
                </td>
              </tr>

              <!-- Body -->
              <tr>
                <td style="padding:32px 40px;">
                  <p style="margin:0 0 16px;color:#333;font-size:15px;">Dear <strong>${customerName}</strong>,</p>
                  <p style="margin:0 0 20px;color:#555;font-size:14px;">
                    We regret to inform you that your delivery was unable to be completed today.
                  </p>

                  <!-- Reason box -->
                  <table width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:24px;">
                    <tr>
                      <td style="padding:16px;background:#fff3cd;border-left:4px solid #f39c12;border-radius:4px;">
                        <p style="margin:0;font-size:14px;color:#856404;">
                          <strong>Reason:</strong> ${failureReason}
                        </p>
                      </td>
                    </tr>
                  </table>

                  <!-- Next steps -->
                  <p style="margin:0 0 8px;font-size:14px;font-weight:bold;color:#333;">What happens next:</p>
                  <p style="margin:0 0 24px;color:#555;font-size:14px;line-height:1.7;">
                    ${nextSteps || 'Our team will contact you shortly to arrange a new delivery appointment. We apologise for the inconvenience.'}
                  </p>

                  <p style="margin:0;color:#888;font-size:13px;">
                    If you have any questions, please contact our customer service team.
                  </p>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="padding:20px 40px;background:#f8f9fa;border-radius:0 0 8px 8px;border-top:1px solid #e9ecef;text-align:center;">
                  <p style="margin:0;color:#999;font-size:12px;">© ${new Date().getFullYear()} TBM Delivery. All rights reserved.</p>
                </td>
              </tr>

            </table>
          </td></tr>
        </table>
      </body>
      </html>
    `
  };

  try {
    const info = await transport.sendMail(mailOptions);
    console.log(`[Email] Customer failure notification sent to ${to}:`, info.messageId);
    return true;
  } catch (err) {
    console.error('[Email] Failed to send customer failure email:', err.message);
    return false;
  }
}

/**
 * Generic send for A.3 outbox worker (on-the-way / D-1 notifications).
 * Throws if email is not configured so the outbox row retries/backoffs correctly.
 *
 * @param {{ to: string, subject: string, text?: string, html?: string }} opts
 */
async function sendEmail({ to, subject, text, html }) {
  const transport = createTransporter();
  if (!transport) {
    throw new Error('Email not configured — set EMAIL_USER and EMAIL_PASSWORD in .env');
  }

  const mailOptions = {
    from:    process.env.EMAIL_FROM || `"TBM Delivery" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    text,
    html,
  };

  const info = await transport.sendMail(mailOptions);
  console.log(`[Email] Sent to ${to}: ${info.messageId}`);
  return info;
}

module.exports = {
  sendPasswordResetEmail,
  sendTestEmail,
  sendDeliveryFailureInternalEmail,
  sendDeliveryFailureCustomerEmail,
  sendEmail,
};
