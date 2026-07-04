export const EMAIL_PROVIDER_NAMES = [
  'console',
  'cloudflare',
  'resend',
  'mailgun',
] as const;

export type EmailProviderName = (typeof EMAIL_PROVIDER_NAMES)[number];

export interface EmailAddress {
  email: string;
  name?: string;
}

export type EmailRecipient = string | EmailAddress;

export interface SendEmailInput {
  to: EmailRecipient | EmailRecipient[];
  from: EmailRecipient;
  subject: string;
  html: string;
  text: string;
  replyTo?: EmailRecipient;
}

export interface SendEmailResult {
  provider: EmailProviderName;
  id?: string;
}

export interface EmailProvider {
  send(input: SendEmailInput): Promise<SendEmailResult>;
}

export type Fetcher = typeof fetch;

export interface CloudflareEmailMessage {
  to: EmailRecipient | EmailRecipient[];
  from: EmailRecipient;
  subject: string;
  html: string;
  text: string;
  replyTo?: EmailRecipient;
}

export interface CloudflareEmailBinding {
  send(input: CloudflareEmailMessage): Promise<{ messageId?: string }>;
}

export interface EmailRuntimeEnv {
  EMAIL_PROVIDER?: string;
  EMAIL?: unknown;
  EMAIL_FROM?: string;
  EMAIL_REPLY_TO?: string;
  RESEND_API_KEY?: string;
  MAILGUN_API_KEY?: string;
  MAILGUN_DOMAIN?: string;
}

export interface ConsoleEmailProviderOptions {
  info?: (message?: unknown, ...optionalParams: unknown[]) => void;
}

export interface ResendEmailProviderOptions {
  apiKey: string;
  endpoint?: string;
  fetcher?: Fetcher;
}

export interface MailgunEmailProviderOptions {
  apiKey: string;
  domain: string;
  endpointBase?: string;
  fetcher?: Fetcher;
}

export interface CreateMailerFromEnvOptions {
  console?: ConsoleEmailProviderOptions;
  fetcher?: Fetcher;
}

export interface ResolveEmailFromAddressOptions {
  fallbackFromEmail?: string;
  fallbackFromName?: string;
}

export interface AuthEmailTemplateInput {
  name?: string | null;
  url: string;
}

export interface RenderedAuthEmail {
  subject: string;
  html: string;
  text: string;
}

export type AuthEmailRenderer = (
  input: AuthEmailTemplateInput,
) => Promise<RenderedAuthEmail>;

export interface AuthEmailSender {
  sendVerificationEmail(input: {
    to: string;
    name?: string | null;
    url: string;
  }): Promise<void>;
  sendResetPasswordEmail(input: {
    to: string;
    name?: string | null;
    url: string;
  }): Promise<void>;
}

export interface CreateAuthEmailSenderOptions {
  from: SendEmailInput['from'];
  mailer: EmailProvider;
  renderVerificationEmail: AuthEmailRenderer;
  renderResetPasswordEmail: AuthEmailRenderer;
  replyTo?: SendEmailInput['replyTo'];
}

export interface CreateAuthEmailSenderFromEnvOptions
  extends CreateMailerFromEnvOptions,
    ResolveEmailFromAddressOptions {
  renderVerificationEmail: AuthEmailRenderer;
  renderResetPasswordEmail: AuthEmailRenderer;
}
