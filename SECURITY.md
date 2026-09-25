# Report a security vulnerability

Use [private vulnerability reporting](https://github.com/viscalyx/skyttel/security/advisories/new)
to contact the maintainers. Do not open a public issue with credentials,
identity details, household data, or an exploit that exposes an installation.

Use fictional data in public tests and reports. If a credential leaks, revoke
or rotate it before discussing remediation. Removing it from the latest file
does not remove it from repository history.

See the [security checks guide](docs/operations/security-checks.md) for
blocking policy, temporary exceptions, and maintainer review.

Maintainers review security updates weekly and deliver fixes in a new
verified release. Operators maintain the alarm recipient and verify actual
delivery. The running image and retained rollback image receive daily
checks under the [maintenance routine](docs/operations/security-monitoring.md).
This maintenance scope covers the running installation and retained
rollback image. Keep installation-specific investigation private.
