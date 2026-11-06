# @vergekit/core

Core runtime helpers for Verge Kit applications.

## Exports

- `@vergekit/core/utilities`
- `@vergekit/core/http`
- `@vergekit/core/email`
- `@vergekit/core/auth`

## Development

```bash
npm install
npm run verify
```

Build before publishing:

```bash
npm run build
npm publish --access public
```

## License

`@vergekit/core` is available under the [MIT License](./LICENSE).

## Account email changes

The shared auth handler lets signed-in users change their email immediately, without a password prompt or a confirmation link.
VK trusts the replacement address for sign-in and recovery.
The shared `POST /api/auth/change-email-direct` handler requires a valid session and rejects banned users.
It normalizes addresses and rejects an address that another account uses.
Database uniqueness also protects simultaneous requests.
The current session stays active, and the handler revokes other sessions.
The link-based email change endpoint stays disabled.
Initial registration still requires email verification.
