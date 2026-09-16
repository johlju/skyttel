# Operator Upgrade Notes

This file records release-specific actions that production operators must know
before upgrading Skyttel.

## Unreleased

### First installation and persistent storage

Deploy one application instance with a persistent disk that the application
user can write to. Keep this disk and the authentication secret across
restarts and updates. A missing or replaced disk starts a separate empty
installation. Startup stops before traffic if database preparation fails;
correct the cause before you restore traffic.

### Identity and household access

Configure the first administrator with a verified provider account identifier
for each installation. Configure both identity providers and their public
callback addresses. Enable personal Microsoft accounts and verify real sign-in
with both providers before use. Email addresses do not grant access or link
accounts. After household creation, current membership controls access;
changing the configured first administrator does not transfer the household.
