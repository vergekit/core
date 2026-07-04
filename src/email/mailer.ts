import { createCloudflareEmailProvider } from './providers/cloudflare.js';
import { createConsoleEmailProvider } from './providers/console.js';
import { createMailgunEmailProvider } from './providers/mailgun.js';
import { createResendEmailProvider } from './providers/resend.js';
import { EMAIL_PROVIDER_NAMES } from './types.js';
import type {
  CreateMailerFromEnvOptions,
  EmailProvider,
  EmailProviderName,
  EmailRuntimeEnv,
  CloudflareEmailBinding,
  ResolveEmailFromAddressOptions,
  SendEmailInput,
  SendEmailResult,
} from './types.js';

const DEFAULT_EMAIL_PROVIDER: EmailProviderName = 'console';
const CONSOLE_FALLBACK_FROM_EMAIL = 'noreply@example.test';

export async function sendEmail(
  runtimeEnv: EmailRuntimeEnv,
  input: SendEmailInput,
  options?: CreateMailerFromEnvOptions,
): Promise<SendEmailResult> {
  return createMailerFromEnv(runtimeEnv, options).send(input);
}

export function createMailerFromEnv(
  runtimeEnv: EmailRuntimeEnv,
  options: CreateMailerFromEnvOptions = {},
): EmailProvider {
  const providerName = resolveEmailProviderName(runtimeEnv.EMAIL_PROVIDER);

  switch (providerName) {
    case 'console':
      return createConsoleEmailProvider(options.console);
    case 'cloudflare':
      if (!runtimeEnv.EMAIL) {
        throw new Error('EMAIL binding is required for Cloudflare email');
      }

      return createCloudflareEmailProvider(
        runtimeEnv.EMAIL as CloudflareEmailBinding,
      );
    case 'resend':
      if (!runtimeEnv.RESEND_API_KEY?.trim()) {
        throw new Error('RESEND_API_KEY is required for Resend email');
      }

      return createResendEmailProvider({
        apiKey: runtimeEnv.RESEND_API_KEY,
        fetcher: options.fetcher,
      });
    case 'mailgun':
      if (!runtimeEnv.MAILGUN_API_KEY?.trim()) {
        throw new Error('MAILGUN_API_KEY is required for Mailgun email');
      }
      if (!runtimeEnv.MAILGUN_DOMAIN?.trim()) {
        throw new Error('MAILGUN_DOMAIN is required for Mailgun email');
      }

      return createMailgunEmailProvider({
        apiKey: runtimeEnv.MAILGUN_API_KEY,
        domain: runtimeEnv.MAILGUN_DOMAIN,
        fetcher: options.fetcher,
      });
  }
}

export function resolveEmailProviderName(
  providerName?: string,
): EmailProviderName {
  const normalized = providerName?.trim() || DEFAULT_EMAIL_PROVIDER;

  if (EMAIL_PROVIDER_NAMES.includes(normalized as EmailProviderName)) {
    return normalized as EmailProviderName;
  }

  throw new Error(`Unsupported EMAIL_PROVIDER "${normalized}"`);
}

export function resolveEmailFromAddress(
  runtimeEnv: Pick<EmailRuntimeEnv, 'EMAIL_FROM'>,
  providerName: EmailProviderName,
  options: ResolveEmailFromAddressOptions = {},
) {
  const configuredFrom = runtimeEnv.EMAIL_FROM?.trim();

  if (configuredFrom) {
    return configuredFrom;
  }

  if (providerName === 'console') {
    return {
      email: options.fallbackFromEmail ?? CONSOLE_FALLBACK_FROM_EMAIL,
      name: options.fallbackFromName,
    };
  }

  throw new Error('EMAIL_FROM is required for configured email provider');
}
