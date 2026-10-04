const nodemailer = require("nodemailer");

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const message = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  const user = process.env.GMAIL_USER;
  const password = process.env.GMAIL_APP_PASSWORD;
  const port = Number(process.env.SMTP_PORT || 465);

  if (!user || !password) {
    throw new Error("GMAIL_USER and GMAIL_APP_PASSWORD must be configured");
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port,
    secure: process.env.SMTP_SECURE
      ? process.env.SMTP_SECURE.toLowerCase() === "true"
      : port === 465,
    auth: { user, pass: password },
  });

  await transporter.sendMail({
    from: process.env.MAIL_FROM || user,
    to: message.to,
    subject: message.subject,
    text: message.text,
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
