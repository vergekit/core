export { formatEmailAddress, formatEmailRecipients } from './address.js';
export {
  createAuthEmailSender,
  createAuthEmailSenderFromEnv,
} from './auth.js';
export {
  createMailerFromEnv,
  resolveEmailFromAddress,
  resolveEmailProviderName,
  sendEmail,
} from './mailer.js';
export { createCloudflareEmailProvider } from './providers/cloudflare.js';
export { createConsoleEmailProvider } from './providers/console.js';
export { createMailgunEmailProvider } from './providers/mailgun.js';
export { createResendEmailProvider } from './providers/resend.js';
export {
  EMAIL_PROVIDER_NAMES,
  type AuthEmailRenderer,
  type AuthEmailSender,
  type AuthEmailTemplateInput,
  type CloudflareEmailBinding,
  type CloudflareEmailMessage,
  type ConsoleEmailProviderOptions,
  type CreateAuthEmailSenderFromEnvOptions,
  type CreateAuthEmailSenderOptions,
  type CreateMailerFromEnvOptions,
  type EmailAddress,
  type EmailProvider,
  type EmailProviderName,
  type EmailRecipient,
  type EmailRuntimeEnv,
  type Fetcher,
  type MailgunEmailProviderOptions,
  type RenderedAuthEmail,
  type ResendEmailProviderOptions,
  type ResolveEmailFromAddressOptions,
  type SendEmailInput,
  type SendEmailResult,
} from './types.js';
