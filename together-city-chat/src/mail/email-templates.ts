/**
 * Branded HTML email templates for system mail (recovery OTP, password-changed
 * security notice). Inline styles only — email clients strip <style>/<head>.
 * Each returns { subject, text, html } so the provider can send both parts.
 */

const BRAND = '#5a3fa0';   // Together City accent
const INK = '#1b1a17';
const MUTED = '#7a756c';
const PAPER = '#f6f4ef';

function shell(inner: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:${PAPER};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #ece7de;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
        <tr><td style="background:${BRAND};padding:18px 24px;">
          <span style="color:#fff;font-size:16px;font-weight:800;letter-spacing:.02em;">🏙️ Together City</span>
        </td></tr>
        <tr><td style="padding:26px 24px 8px;">${inner}</td></tr>
        <tr><td style="padding:14px 24px 24px;">
          <p style="color:${MUTED};font-size:11.5px;line-height:1.6;margin:14px 0 0;border-top:1px solid #ece7de;padding-top:14px;">
            You received this because a password recovery was requested for your Together City account.
            If it wasn't you, you can safely ignore this email — your password stays unchanged.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
  </body></html>`;
}

export function recoveryOtpEmail(otp: string, minutes = 10): { subject: string; text: string; html: string } {
  const subject = 'Your Together City recovery code';
  const text = [
    'Your Together City verification code is:', '', otp, '',
    `This code expires in ${minutes} minutes.`, '',
    "If you didn't request this, ignore this email — your password stays unchanged.",
  ].join('\n');
  const html = shell(`
    <h1 style="color:${INK};font-size:20px;margin:0 0 6px;">Reset your password</h1>
    <p style="color:${MUTED};font-size:14px;line-height:1.6;margin:0 0 18px;">Enter this verification code to continue recovering your account.</p>
    <div style="text-align:center;margin:8px 0 18px;">
      <span style="display:inline-block;background:${PAPER};border:1px solid #e6e0d5;border-radius:12px;padding:14px 22px;font-size:30px;font-weight:800;letter-spacing:.32em;color:${INK};">${otp}</span>
    </div>
    <p style="color:${MUTED};font-size:13px;line-height:1.6;margin:0;">This code expires in <strong style="color:${INK};">${minutes} minutes</strong>. For your security, don't share it with anyone.</p>
  `);
  return { subject, text, html };
}

export function passwordChangedEmail(): { subject: string; text: string; html: string } {
  const subject = 'Your Together City password was changed';
  const text = 'Your password was just reset and you have been signed out of every device. If this wasn’t you, reset your password again immediately and contact support.';
  const html = shell(`
    <h1 style="color:${INK};font-size:20px;margin:0 0 6px;">Password changed</h1>
    <p style="color:${MUTED};font-size:14px;line-height:1.6;margin:0 0 12px;">Your password was just reset, and you've been signed out of every device.</p>
    <p style="color:${INK};font-size:14px;line-height:1.6;margin:0;font-weight:600;">If this wasn't you, reset your password again immediately and contact support.</p>
  `);
  return { subject, text, html };
}
