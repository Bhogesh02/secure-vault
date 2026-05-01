import type { Env } from "../types";

export async function sendOtpEmail(env: Env, email: string, code: string): Promise<void> {
  if (!env.RESEND_API_KEY || env.RESEND_API_KEY === "local-dev" || env.RESEND_API_KEY === "re_replace_me") {
    console.log(`Local development OTP for ${email}: ${code}`);
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: "Secure Vault <no-reply@securevault.local>",
      to: [email],
      subject: "Your Secure Vault OTP",
      html: `<p>Your Secure Vault verification code is <strong>${code}</strong>. It expires in 5 minutes.</p>`
    })
  });

  if (!response.ok) {
    const body = await response.text();
    console.error("Failed to send OTP email", response.status, body);
    throw new Error("Failed to send OTP email");
  }
}

export async function sendDeadManEmail(env: Env, recipient: string, senderEmail: string): Promise<void> {
  if (!env.RESEND_API_KEY || env.RESEND_API_KEY === "local-dev" || env.RESEND_API_KEY === "re_replace_me") {
    console.log(`Local development Dead Man alert for ${senderEmail} sent to ${recipient}`);
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: "BlindLock Security <alerts@blindlock.cloud>",
      to: [recipient],
      subject: `Emergency Access Alert: ${senderEmail}`,
      html: `
        <h2>Emergency Access Alert</h2>
        <p>This is an automated message from BlindLock Security on behalf of <strong>${senderEmail}</strong>.</p>
        <p>They have been inactive for their specified safety period, which has triggered this emergency notification.</p>
        <p>Please take any necessary actions as per your arrangement with them.</p>
      `
    })
  });

  if (!response.ok) {
    const body = await response.text();
    console.error("Failed to send Dead Man email", response.status, body);
    throw new Error("Failed to send Dead Man email");
  }
}
