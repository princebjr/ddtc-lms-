# Owner request: idle alerts (received 2026-11-13, during Phase 15)

**Status:** built in Phase 15 (ADR-027).

1. **Sign In, after an idle sign-out:** the "You have been signed out" notice takes the style of the owner's reference image (an "Info alert"):
   - a soft tinted card with large rounded corners and a gentle shadow;
   - a round filled badge with an info icon on the left;
   - a bold title with the message beneath;
   - a close (X) button on the right.
   It uses DDTC's primary colour instead of the reference image's purple, so it matches the app and passes the contrast tests in both themes.
2. **The idle warning card in the app:** the Continue Session button's bottom edge must not touch the card's edge; give it space beneath.

Reference image: the owner's screenshot in the conversation (an info alert: lilac card, purple round badge, "Info alert!", "Change a few things up and try submitting again.", a close X).
