import { createMailerFromEnv, resolveEmailFromAddress, resolveEmailProviderName } from './mailer.js';
import type {
  AuthEmailSender,
  CreateAuthEmailSenderFromEnvOptions,
  CreateAuthEmailSenderOptions,
  EmailRuntimeEnv,
} from './types.js';

export function createAuthEmailSender({
  from,
  mailer,
  renderVerificationEmail,
  renderResetPasswordEmail,
  replyTo,
}: CreateAuthEmailSenderOptions): AuthEmailSender {
  return {
    async sendVerificationEmail(input) {
      const email = await renderVerificationEmail({
        name: input.name,
        url: input.url,
      });

      await mailer.send({
        to: input.to,
        from,
        subject: email.subject,
        html: email.html,
        text: email.text,
        replyTo,
      });
    },
    async sendResetPasswordEmail(input) {
      const email = await renderResetPasswordEmail({
        name: input.name,
        url: input.url,
      });

      await mailer.send({
        to: input.to,
        from,
        subject: email.subject,
        html: email.html,
        text: email.text,
        replyTo,
      });
    },
  };
}

export function createAuthEmailSenderFromEnv(
  runtimeEnv: EmailRuntimeEnv,
  options: CreateAuthEmailSenderFromEnvOptions,
) {
  const providerName = resolveEmailProviderName(runtimeEnv.EMAIL_PROVIDER);

  return createAuthEmailSender({
    from: resolveEmailFromAddress(runtimeEnv, providerName, options),
    replyTo: runtimeEnv.EMAIL_REPLY_TO,
    mailer: createMailerFromEnv(runtimeEnv, options),
    renderVerificationEmail: options.renderVerificationEmail,
    renderResetPasswordEmail: options.renderResetPasswordEmail,
  });
}
