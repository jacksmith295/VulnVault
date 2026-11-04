# Authentication hardening

This records the hardening decisions following the project review. It supplements the [authentication design](auth-workspace-design.md); password hashing, session tokens, verification, and recovery remain Better Auth responsibilities.

## Local throttling

The application runs directly through Next.js, without a trusted proxy that replaces client-supplied forwarding headers. Authentication therefore ignores forwarded IP headers and uses one database-backed bucket per authentication path across local users. Changing `X-Forwarded-For`, `X-Real-IP`, or `Forwarded` does not grant a fresh budget.

`advanced.ipAddress.ipAddressHeaders` is deliberately empty. IP tracking is not disabled: the installed library uses an active shared bucket when no configured client address is available. Setting `disableIpTracking: true` would bypass throttling and must not replace this configuration.

This trades independent user budgets for a trustworthy limit in the current local setup. Hosting for larger teams requires an agreed network boundary that strips untrusted forwarding headers and provides a trusted client address. Do not enable arbitrary forwarded-header trust as a convenience.

Authentication counters commit independently through a separate PostgreSQL pool capped at two connections. Credential transactions keep the existing ten-connection application pool. This prevents a slow credential operation from holding a shared throttle-row lock, and prevents requests from exhausting the application pool while waiting for a second connection to update their counters. Failed credential operations still count toward throttling.

Tests retain real throttling. Sequential integration and browser cases clear only authentication buckets in the isolated test database between cases, preserving workspace-creation counters and the limits exercised within each case. There is no application endpoint or production flag that clears or disables limits.

## Credential recovery concurrency

The reviewed Better Auth 1.7.16 credential flow reads a password before asynchronous verification and later session creation or account update. Password reset alone cannot revoke a session that is created afterwards or prevent an already-validated password change from overwriting recovery. The published 1.7.17 patch was inspected and leaves the affected sign-in and password-change code unchanged, so this slice keeps the existing pinned dependency.

The application integrates a narrow credential guard at the exported auth handler and direct credential API boundaries:

- Guard email sign-in, password reset, password change, server-side password setting, and account unlinking. The last two are included because the library exposes credential-affecting APIs beyond the visible forms.
- Run guarded operations in a PostgreSQL transaction. A request-local adapter dispatch ensures credential, session, and recovery-token queries use that transaction's connection even when Better Auth establishes its own adapter context.
- Resolve the user from an authoritative database read: the sign-in user, reset verification record, or authenticated session. Acquire a namespaced per-user transaction advisory lock and repeat that read before returning it to the library. A waiting operation therefore sees the current credential, reset token, or session rather than its pre-lock snapshot.
- Hold the lock through credential checking and writes. Operations for one user serialize; different users do not share a credential lock. Successful recovery revokes sessions created by a preceding sign-in and wins over a preceding password change. A password change starting after recovery must revalidate its session.
- Preserve nested library transactions as savepoints. The HTTP handler can convert an endpoint exception into a response, so a failing reset still needs its inner transaction to roll back token consumption, session revocation, and password writes.

This changes neither password cryptography nor the schema. Keep the guard in place until an upstream fix has been verified against the same PostgreSQL regressions. Do not replace it with an extra session deletion, an unprotected password reread, or a lock held on a separate connection from credential writes.

## Upgrade and extension requirements

The guard relies on the pinned adapter interface, database read shapes, and credential endpoint inventory. A Better Auth update, new authentication provider, custom credential hook, or newly enabled account-management endpoint must review these assumptions and run the deterministic concurrency and rollback tests. Organization endpoints remain disabled until their separate permission design is implemented.

Keep credential operations behind the guarded exports. Future hooks must not introduce nested public credential API calls without reviewing transaction and lock ordering.
