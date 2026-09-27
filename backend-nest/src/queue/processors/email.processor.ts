import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Job } from 'bullmq';
import nodemailer from 'nodemailer';
import { LoggerService } from '../../common/services/logger.service';
import { QUEUE_NAMES } from '../constants';
import type { EmailJob } from '../types/queue.types';
import {
  isAllowedEmailTemplate,
  isSafeEmailAddress,
  sanitizeEmailVariable,
  sanitizeHeaderValue,
} from './email.sanitize';

const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: smtpPort,
  secure: smtpPort === 465,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  pool: true,
  maxConnections: 3,
});

@Injectable()
@Processor(QUEUE_NAMES.EMAILS, { concurrency: 3 })
export class EmailProcessor extends WorkerHost implements OnModuleInit {
  constructor(private readonly logger: LoggerService) {
    super();
  }

  async onModuleInit() {
    if (!process.env.SMTP_HOST || !process.env.SMTP_PASS) {
      this.logger.warn({}, 'SMTP not configured — email jobs will be skipped');
      return;
    }
    try {
      await transporter.verify();
      this.logger.info({ host: process.env.SMTP_HOST }, 'SMTP ready');
    } catch (err) {
      this.logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'SMTP verify failed',
      );
    }
  }
  async process(job: Job<EmailJob>): Promise<void> {
    if (job.name !== 'send') return;
    if (!process.env.SMTP_HOST || !process.env.SMTP_PASS) {
      this.logger.warn({}, 'SMTP not configured — skipping email job');
      return;
    }

    const { to, subject, template, variables } = job.data;
    if (!isSafeEmailAddress(to)) {
      this.logger.warn({ to }, 'Skipping email — invalid recipient');
      return;
    }
    if (!isAllowedEmailTemplate(template)) {
      this.logger.warn({ template }, 'Skipping email — unknown template');
      return;
    }

    const vars = variables ?? {};
    const templates: Record<string, string> = {
      welcome: `مرحباً بك في سرح، ${sanitizeEmailVariable(vars.name)}! حسابك جاهز.`,
      fee_reminder: `تذكير: لديك رسوم معلقة ${sanitizeEmailVariable(vars.amount)} ريال مستحقة بتاريخ ${sanitizeEmailVariable(vars.dueDate)}.`,
      subscription_renew: `تجديد اشتراكك: ${sanitizeEmailVariable(vars.plan)} - ${sanitizeEmailVariable(vars.amount)} ريال`,
      email_verification: `رمز التحقق: <strong>${sanitizeEmailVariable(vars.code)}</strong> (صالح 10 دقائق)`,
    };

    await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'sarh@sarhsa.online',
      to: sanitizeHeaderValue(to),
      subject: sanitizeHeaderValue(subject),
      html: `<div dir="rtl" style="font-family:sans-serif;max-width:600px;margin:0 auto">${templates[template]}</div>`,
    });
  }
}
