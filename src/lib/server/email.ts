import nodemailer from "nodemailer";
import { readServerEnv } from "./env";

let transport: ReturnType<typeof nodemailer.createTransport> | undefined;

export async function sendAuthEmail(to: string, subject: string, text: string) {
  const env = readServerEnv();
  transport ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
  });

  await transport.sendMail({ from: env.SMTP_FROM, to, subject, text });
}
