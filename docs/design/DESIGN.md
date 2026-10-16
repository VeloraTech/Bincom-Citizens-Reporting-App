# WeSignal — Milestone 2 design direction

## Product intent
A calm, trustworthy public window into community incidents, paired with a secure reporting path for residents. Guests can open the app and browse published incidents immediately. An account is only required when someone chooses to submit a report or view their private submitted reports.

## Design movement — WeSignal
**WeSignal civic signal:** high-contrast editorial hierarchy, bright civic blue, and compact metadata that make a public service feel accountable rather than bureaucratic.

## Core principles
- **Open first:** the first useful screen is the public incident feed, not a login wall.
- **Clarity before decoration:** one obvious next action per view and plain-language system states.
- **Trust through disclosure:** connection, empty, error, and auth requirements are visible without exposing secrets.
- **Respectful urgency:** status and category pills are scannable without alarmist color.

## Visual system
- Primary blue: `#1769E0`; near-black text: `#111111`; white background and surfaces: `#FFFFFF`; neutral dividers: `#E6E7E9`. Use blue primarily for actions and selected states, not as a decorative panel color.
- System sans-serif with tight, bold headings and 14–16px readable body copy.
- Public incident cards use a blue signal edge, category chip, status chip, excerpt, date, and location when present. Inline SVG/CSS icons are used instead of emoji glyphs.

## Interaction
The first-launch welcome explains browsing and reporting, with **Get started** and **Skip for now**. Both persist completion in local storage; Skip goes directly to the feed. Location permission is requested only after the user taps “Use my current location” from the preserved report form, with a landmark fallback.

The report CTA remains visible from the feed. Guests see an in-context account gate with Login and Create account actions; draft fields are not cleared. Auth success returns to the report screen. Feed loading uses skeleton cards. Empty, configuration, and backend failure states explain what is happening and offer retry when meaningful.

## Security boundary
`reports.is_public` is false by default. The client can read only published rows for the public feed; report inserts are forced private in both client payload and RLS. No service-role key, moderation UI, photo upload, or private report data is exposed.

## WeSignal brand lock
The approved icon is the original image supplied for this project at `resources/icon-original.png`. Preserve its exact symbol, colors, and proportions; do not redraw it or substitute the former generated mark. The launcher uses the supplied symbol, while onboarding and the app header carry the WeSignal wordmark. The exact product tagline is **“See it. Report it. Improve it.”**
