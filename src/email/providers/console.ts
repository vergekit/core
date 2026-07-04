import type {
  ConsoleEmailProviderOptions,
  EmailProvider,
  SendEmailInput,
} from '../types.js';

export function createConsoleEmailProvider(
  options: ConsoleEmailProviderOptions = {},
): EmailProvider {
  const info = options.info ?? console.info;

  return {
    async send(input: SendEmailInput) {
      info('[email:console]', input);

      return {
        provider: 'console',
        id: 'console',
      };
    },
  };
}
