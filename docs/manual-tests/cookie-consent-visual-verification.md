# Cookie consent visual verification

Evidence date: 16 October 2026. Scope: issue #467, cookie consent, policy
and settings. The frozen reference is
[Viscalyx at 72d6554](https://github.com/viscalyx/viscalyx.se/tree/72d6554acf3915cf8cc4dc80800dec9e9780c823).

## Comparison setup

Both applications run locally in Chromium. Desktop frames use 1280 × 900
CSS pixels; mobile frames use 390 × 844. Each pair uses the same viewport
and theme. Reference frames use the frozen source with its lockfile.
Skyttel frames use an isolated development installation with synthetic
configuration and an empty database. They contain no real household or
provider information. The screenshots below are unmodified captures.

The reference theme class and Skyttel theme attribute select the visual
skins for these frames. The functional integration cases select the theme
through the browser's color preference separately. Local HTTP screenshots
show presentation only; real HTTPS integration tests cover cookie and
session behavior. They are not evidence for the production ingress.

## Visual assessment

The compact banner follows the reference's fixed bottom placement,
1280-pixel content limit, dimmed backdrop, blue actions and icon, spacing,
and vertically stacked mobile buttons. Expanded mode keeps a fixed action
area below scrollable category cards. White and dark gray surfaces, blue
accents, green necessary-storage icons, purple preference icons, eight-pixel
corners and 44 × 24 pixel switches follow the reference throughout.

The policy and settings use the reference's Inter/system font family,
heading hierarchy, 896-pixel content limit, quick-action panel, bordered
category cards, expandable details and separate save action. Skyttel keeps
its existing account navigation. Longer approved wording and two actual
storage categories change card heights and wrapping. The policy date is
fixed to the publication version; the separate decision panel shows the
browser's choice time.

Intentional accessibility adaptations include a darker off-switch track
and a darker primary button in dark mode. White text on primary blue
`#2563eb` has a contrast ratio of 5.17:1. White switch thumbs on the off
track `#64748b` have 4.76:1 contrast. Controls retain at least 44-pixel
interactive height and visible focus. Necessary storage is disabled and
also identified by text. Skyttel-specific reset, recovery and function
controls use the same visual language. No analytics, marketing or export
controls are presented as Skyttel features.

Expanded storage details use separate indented entries with a left border,
a monospace name, purpose and a duration/provider line. Counts reflect
Skyttel's actual entries. The paired detail frames below show this layout
with both reference preference cookies and Skyttel's own two preference
cookies. Dark metadata is slightly brighter than the reference to preserve
readable contrast.

## Paired screenshots

Each link opens a viewport capture. Settings frames scroll to the quick
actions; policy frames show the page introduction without a banner.

<!-- markdownlint-disable MD013 -->
| Surface | View | Reference | Skyttel |
| --- | --- | --- | --- |
| Compact banner | Desktop, light | [Reference](cookie-consent-evidence/ref-light-desktop.png) | [Skyttel](cookie-consent-evidence/skyttel-light-desktop.png) |
| Compact banner | Desktop, dark | [Reference](cookie-consent-evidence/ref-dark-desktop.png) | [Skyttel](cookie-consent-evidence/skyttel-dark-desktop.png) |
| Compact banner | Mobile, light | [Reference](cookie-consent-evidence/ref-light-mobile.png) | [Skyttel](cookie-consent-evidence/skyttel-light-mobile.png) |
| Compact banner | Mobile, dark | [Reference](cookie-consent-evidence/ref-dark-mobile.png) | [Skyttel](cookie-consent-evidence/skyttel-dark-mobile.png) |
| Expanded banner | Desktop, light | [Reference](cookie-consent-evidence/ref-expanded-light-desktop.png) | [Skyttel](cookie-consent-evidence/skyttel-expanded-light-desktop.png) |
| Expanded banner | Desktop, dark | [Reference](cookie-consent-evidence/ref-expanded-dark-desktop.png) | [Skyttel](cookie-consent-evidence/skyttel-expanded-dark-desktop.png) |
| Expanded banner | Mobile, light | [Reference](cookie-consent-evidence/ref-expanded-light-mobile.png) | [Skyttel](cookie-consent-evidence/skyttel-expanded-light-mobile.png) |
| Expanded banner | Mobile, dark | [Reference](cookie-consent-evidence/ref-expanded-dark-mobile.png) | [Skyttel](cookie-consent-evidence/skyttel-expanded-dark-mobile.png) |
| Expanded details | Desktop, light | [Reference](cookie-consent-evidence/ref-details-light-desktop.png) | [Skyttel](cookie-consent-evidence/skyttel-details-light-desktop.png) |
| Expanded details | Desktop, dark | [Reference](cookie-consent-evidence/ref-details-dark-desktop.png) | [Skyttel](cookie-consent-evidence/skyttel-details-dark-desktop.png) |
| Expanded details | Mobile, light | [Reference](cookie-consent-evidence/ref-details-light-mobile.png) | [Skyttel](cookie-consent-evidence/skyttel-details-light-mobile.png) |
| Expanded details | Mobile, dark | [Reference](cookie-consent-evidence/ref-details-dark-mobile.png) | [Skyttel](cookie-consent-evidence/skyttel-details-dark-mobile.png) |
| Policy | Desktop, light | [Reference](cookie-consent-evidence/ref-policy-light-desktop.png) | [Skyttel](cookie-consent-evidence/skyttel-policy-light-desktop.png) |
| Policy | Desktop, dark | [Reference](cookie-consent-evidence/ref-policy-dark-desktop.png) | [Skyttel](cookie-consent-evidence/skyttel-policy-dark-desktop.png) |
| Policy | Mobile, light | [Reference](cookie-consent-evidence/ref-policy-light-mobile.png) | [Skyttel](cookie-consent-evidence/skyttel-policy-light-mobile.png) |
| Policy | Mobile, dark | [Reference](cookie-consent-evidence/ref-policy-dark-mobile.png) | [Skyttel](cookie-consent-evidence/skyttel-policy-dark-mobile.png) |
| Settings | Desktop, light | [Reference](cookie-consent-evidence/ref-settings-light-desktop.png) | [Skyttel](cookie-consent-evidence/skyttel-settings-light-desktop.png) |
| Settings | Desktop, dark | [Reference](cookie-consent-evidence/ref-settings-dark-desktop.png) | [Skyttel](cookie-consent-evidence/skyttel-settings-dark-desktop.png) |
| Settings | Mobile, light | [Reference](cookie-consent-evidence/ref-settings-light-mobile.png) | [Skyttel](cookie-consent-evidence/skyttel-settings-light-mobile.png) |
| Settings | Mobile, dark | [Reference](cookie-consent-evidence/ref-settings-dark-mobile.png) | [Skyttel](cookie-consent-evidence/skyttel-settings-dark-mobile.png) |
<!-- markdownlint-enable MD013 -->

## Accessibility scope and remaining observations

The automated cookie cases check accessible control names, keyboard use,
Escape behavior, focus containment and return, background clicks, pending
and unknown saves, mobile overflow and a public policy without an overlay.
Policy, reset and expanded-banner cases cover a 320-pixel viewport. A
320-pixel development-browser inspection also shows equal dialog content
and scroll widths, with all three 44-pixel save buttons inside the viewport.
These checks
support WCAG 2.2 AA assessment; they do not establish full conformance.

Human screen-reader reading and announcements, actual browser zoom and
text enlargement, physical browser restarts, and production HTTPS/provider
observations remain in [issue #465](https://github.com/viscalyx/skyttel/issues/465).
The screenshots do not claim those checks. The corresponding manual
actions and expected outcomes remain in [Kakor och lagring](cookies.md).
