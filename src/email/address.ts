import type { EmailRecipient } from './types.js';

export function formatEmailAddress(address: EmailRecipient) {
  if (typeof address === 'string') {
    return address;
  }

  if (!address.name?.trim()) {
    return address.email;
  }

  return `${address.name.trim()} <${address.email}>`;
}

export function formatEmailRecipients(
  recipients: EmailRecipient | EmailRecipient[],
) {
  if (Array.isArray(recipients)) {
    return recipients.map(formatEmailAddress);
  }

  return formatEmailAddress(recipients);
}
