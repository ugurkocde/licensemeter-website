# UI release checklist

Use this checklist for any release that changes navigation, onboarding, account, connectors, or data-heavy pages.

## Automated

- Run lint, TypeScript, unit tests, production build, and Playwright.
- Verify signed-out, demo, viewer, admin, owner, empty, populated, and malformed-ID routes.
- Assert no horizontal overflow at 320px and 375px.
- Exercise keyboard navigation, reduced motion, and light/dark system themes.

## Staging-only third-party states

- WorkOS: signed out, sign-in success, callback error, expired session, and sign-out.
- Microsoft: consent success, consent denial, partial permission grant, first-sync pending, and expired BYO credential.
- Email/invitations: send success, provider failure, expired invite, resend, and unsubscribe.

Record screenshots for desktop and mobile, confirm recovery copy is actionable, and verify that no secret, raw provider error, tenant identifier, or payment detail is exposed.
