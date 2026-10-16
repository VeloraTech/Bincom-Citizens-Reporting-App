# Bincom Citizens Reporting — Design direction

## Product intent

A calm, accountable reporting tool for residents who need to record a community issue without having to understand a government process first. Milestone 1 establishes the mobile shell and honest data states; it does not pretend that a report was submitted when a backend is not configured.

## Design movement

**Civic calm**: editorial information hierarchy, warm paper-like surfaces, and a deep teal action color that suggests stewardship rather than urgency.

## Core principles

- **Clarity before decoration:** every screen has one obvious next action and a plain-language status.
- **Trust through disclosure:** connection state and empty states explain what is and is not available.
- **Respectful urgency:** report categories and status chips are scannable without using alarmist red as the default.
- **Low-friction progress:** short forms, large touch targets, and no hidden steps.

## Color philosophy

Ink (#16302F) anchors legibility. Sea teal (#166A63) is the signature action color: practical, distinctive, and associated with repair. Sand (#F5F1E8) gives the app a grounded civic texture, while pale mint (#DDEDE7) marks positive progress. Amber is reserved for attention, not failure.

## Layout paradigm

A **stacked field notebook**: a compact header establishes place and context, then content is grouped into generous cards that can be scanned vertically with one hand. The primary action stays visible near the thumb rather than being hidden behind a navigation drawer.

## Signature elements

1. A small “field note” eyebrow above major headings.
2. Status chips with both text and color, never color alone.
3. A bottom navigation rail with Report as the elevated center action.

## Interaction and motion

Forms reveal only the fields needed for the selected category. Validate on blur and on submit with specific copy. Use 160–220ms ease-out transitions for cards and pressed states; avoid looping motion and avoid movement that implies a request is processing when it is not.

## Typography

Use system sans-serif for dependable rendering: `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`. Headings are 700 weight with tight tracking; body copy is 400–500 weight and at least 16px on mobile. Labels are 12px uppercase with 0.08em tracking.

## Brand voice

Direct, grounded, and neighborly.

- CTA: “Start a report”
- Empty state: “Your submitted reports will appear here once you connect an account.”

## Accessibility

Maintain a minimum 4.5:1 text contrast, visible focus rings, semantic labels, keyboard navigation in browser preview, `aria-live` feedback for validation, and touch targets of at least 44px. Status is always expressed in text, not color alone.
