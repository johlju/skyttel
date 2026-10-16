---
applyTo: "{src/client/**/*.{ts,tsx},src/server/**/*.ts,src/shared/storage-consent.ts,src/shared/remembered-login.ts,migrations/*.sql}"
---

## Browser Storage Information

- When adding, changing or removing cookies, localStorage or sessionStorage
  entries, synchronize every affected disclosure in the same change: expanded
  consent banner, `/cookies` policy and storage register, and user guidance.
- Cover changes to names, HTTPS variants, purpose, category, provider,
  persistence, lifetime, renewal, withdrawal and cleanup. Distinguish browser
  storage lifetime from server access limits and server retention.
- Assess whether a changed purpose requires renewed consent; keep purpose
  information versions separate from text corrections and publication dates.
- Update affected manual cases and test expectations when the disclosed
  information or observable behavior changes. Assess operator upgrade impact
  when persistence, consent or transition behavior changes.
- Before finishing, compare each affected entry across all presentations
  against the implementation. Resolve stale names, missing properties and
  conflicting times or purposes.
