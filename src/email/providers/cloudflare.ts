import type {
  CloudflareEmailBinding,
  EmailProvider,
  SendEmailInput,
} from '../types.js';

export function createCloudflareEmailProvider(
  binding: CloudflareEmailBinding,
): EmailProvider {
  return {
    async send(input: SendEmailInput) {
      const result = await binding.send(input);

      return {
        provider: 'cloudflare',
        id: result.messageId,
      };
    },
  };
}
