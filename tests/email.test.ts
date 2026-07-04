import { describe, expect, it, vi } from 'vitest';
import {
  createAuthEmailSender,
  createAuthEmailSenderFromEnv,
  createCloudflareEmailProvider,
  createConsoleEmailProvider,
  createMailerFromEnv,
  createMailgunEmailProvider,
  createResendEmailProvider,
  sendEmail,
} from '../src/email/index.js';
import type { Fetcher, SendEmailInput } from '../src/email/index.js';

const message = {
  to: 'ada@example.com',
  from: { email: 'accounts@example.com', name: 'Verge Kit Accounts' },
  subject: 'Welcome',
  html: '<p>Hello</p>',
  text: 'Hello',
  replyTo: 'support@example.com',
} satisfies SendEmailInput;

describe('email providers', () => {
  it('uses the console provider as a non-delivering local provider', async () => {
    const info = vi.fn();
    const provider = createConsoleEmailProvider({ info });

    const result = await provider.send(message);

    expect(info).toHaveBeenCalledWith('[email:console]', message);
    expect(result).toEqual({ provider: 'console', id: 'console' });
  });

  it('passes the common message shape to the Cloudflare Email binding', async () => {
    const send = vi.fn(async () => ({ messageId: 'cf-message-1' }));
    const provider = createCloudflareEmailProvider({ send });

    const result = await provider.send(message);

    expect(send).toHaveBeenCalledWith(message);
    expect(result).toEqual({ provider: 'cloudflare', id: 'cf-message-1' });
  });

  it('sends Resend payloads with bearer auth and reply_to mapping', async () => {
    const fetcher = vi.fn<Fetcher>(async () => {
      return Response.json({ id: 'resend-message-1' });
    });
    const provider = createResendEmailProvider({
      apiKey: 'resend-key',
      fetcher,
    });

    const result = await provider.send(message);
    const [, init] = fetcher.mock.calls[0]!;

    expect(fetcher).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer resend-key',
          'Content-Type': 'application/json',
        },
      }),
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      to: message.to,
      from: 'Verge Kit Accounts <accounts@example.com>',
      subject: message.subject,
      html: message.html,
      text: message.text,
      reply_to: message.replyTo,
    });
    expect(result).toEqual({ provider: 'resend', id: 'resend-message-1' });
  });

  it('sends Mailgun form payloads with basic auth and reply-to header field', async () => {
    const fetcher = vi.fn<Fetcher>(async () => {
      return Response.json({ id: '<mailgun-message-1>' });
    });
    const provider = createMailgunEmailProvider({
      apiKey: 'mailgun-key',
      domain: 'mg.example.com',
      fetcher,
    });

    const result = await provider.send(message);
    const [, init] = fetcher.mock.calls[0]!;
    const body = init?.body as URLSearchParams;

    expect(fetcher).toHaveBeenCalledWith(
      'https://api.mailgun.net/v3/mg.example.com/messages',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa('api:mailgun-key')}`,
        },
      }),
    );
    expect(body.get('to')).toBe(message.to);
    expect(body.get('from')).toBe('Verge Kit Accounts <accounts@example.com>');
    expect(body.get('subject')).toBe(message.subject);
    expect(body.get('html')).toBe(message.html);
    expect(body.get('text')).toBe(message.text);
    expect(body.get('h:Reply-To')).toBe(message.replyTo);
    expect(result).toEqual({ provider: 'mailgun', id: '<mailgun-message-1>' });
  });
});

describe('email runtime factory', () => {
  it('sends through the configured provider from runtime env', async () => {
    const info = vi.fn();

    const result = await sendEmail(
      { EMAIL_PROVIDER: undefined },
      message,
      { console: { info } },
    );

    expect(info).toHaveBeenCalledWith('[email:console]', message);
    expect(result).toEqual({ provider: 'console', id: 'console' });
  });

  it('defaults to the console provider for local development', async () => {
    const info = vi.fn();
    const provider = createMailerFromEnv(
      { EMAIL_PROVIDER: undefined },
      { console: { info } },
    );

    await provider.send(message);

    expect(info).toHaveBeenCalledWith('[email:console]', message);
  });

  it('requires explicit provider configuration for production email providers', () => {
    expect(() =>
      createMailerFromEnv({ EMAIL_PROVIDER: 'cloudflare' }),
    ).toThrow('EMAIL binding is required');
    expect(() =>
      createMailerFromEnv({ EMAIL_PROVIDER: 'resend' }),
    ).toThrow('RESEND_API_KEY is required');
    expect(() =>
      createMailerFromEnv({ EMAIL_PROVIDER: 'mailgun' }),
    ).toThrow('MAILGUN_API_KEY is required');
    expect(() =>
      createMailerFromEnv({ EMAIL_PROVIDER: 'smtp-node' }),
    ).toThrow('Unsupported EMAIL_PROVIDER "smtp-node"');
  });
});

describe('auth email sender', () => {
  it('sends verification and reset emails from provided renderers', async () => {
    const sent: SendEmailInput[] = [];
    const authEmail = createAuthEmailSender({
      from: 'accounts@example.com',
      mailer: {
        send: async (input) => {
          sent.push(input);
          return { provider: 'console', id: 'test' };
        },
      },
      renderVerificationEmail: async ({ url }) => ({
        subject: 'Verify your Verge Kit email',
        html: `<p>Verify ${url}</p>`,
        text: `Verify ${url}`,
      }),
      renderResetPasswordEmail: async ({ url }) => ({
        subject: 'Reset your Verge Kit password',
        html: `<p>Reset ${url}</p>`,
        text: `Reset ${url}`,
      }),
    });

    await authEmail.sendVerificationEmail({
      to: 'ada@example.com',
      name: 'Ada',
      url: 'https://vergekit.dev/verify-email?token=verify-token',
    });
    await authEmail.sendResetPasswordEmail({
      to: 'ada@example.com',
      name: 'Ada',
      url: 'https://vergekit.dev/reset-password/reset-token',
    });

    expect(sent).toEqual([
      {
        to: 'ada@example.com',
        from: 'accounts@example.com',
        subject: 'Verify your Verge Kit email',
        html: '<p>Verify https://vergekit.dev/verify-email?token=verify-token</p>',
        text: 'Verify https://vergekit.dev/verify-email?token=verify-token',
        replyTo: undefined,
      },
      {
        to: 'ada@example.com',
        from: 'accounts@example.com',
        subject: 'Reset your Verge Kit password',
        html: '<p>Reset https://vergekit.dev/reset-password/reset-token</p>',
        text: 'Reset https://vergekit.dev/reset-password/reset-token',
        replyTo: undefined,
      },
    ]);
  });

  it('creates an auth sender from runtime env and provided renderers', async () => {
    const info = vi.fn();
    const authEmail = createAuthEmailSenderFromEnv(
      { EMAIL_PROVIDER: 'console' },
      {
        console: { info },
        fallbackFromName: 'Verge Kit',
        renderVerificationEmail: async ({ url }) => ({
          subject: 'Verify',
          html: url,
          text: url,
        }),
        renderResetPasswordEmail: async ({ url }) => ({
          subject: 'Reset',
          html: url,
          text: url,
        }),
      },
    );

    await authEmail.sendVerificationEmail({
      to: 'ada@example.com',
      url: 'https://vergekit.dev/verify-email?token=abc',
    });

    expect(info).toHaveBeenCalledWith(
      '[email:console]',
      expect.objectContaining({
        from: {
          email: 'noreply@example.test',
          name: 'Verge Kit',
        },
      }),
    );
  });
});
