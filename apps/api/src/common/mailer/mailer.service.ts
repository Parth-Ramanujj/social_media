import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

@Injectable()
export class MailerService {
  private transporter: nodemailer.Transporter;

  constructor(config: ConfigService) {
    const smtp = config.get('smtp')!;
    this.transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465,
      auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
    });
  }

  async send(opts: { to: string; subject: string; text: string; html?: string }) {
    const config = this.transporter.options;
    const from = String(config.from ?? 'Pulse <noreply@pulse.local>');
    return this.transporter.sendMail({ ...opts, from });
  }
}