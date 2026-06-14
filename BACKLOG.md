# Backlog

Ideas and improvements captured for later. Not yet scheduled.

## UX

- **Collapse the API-key field once saved.** Right now the Settings sheet shows
  the full API-key input and a big, prominent orange "Save key" button at all
  times, even when a key is already saved. Instead:
  - When **no key** is saved: show an "Add API key" button (or the input) —
    entering and saving is the primary action.
  - When a key **is** saved: collapse it to a quiet confirmation line
    ("✓ Key saved — AI imports enabled") with a small **Edit** button, rather
    than the large always-visible input + Save button. Tapping **Edit** reveals
    the input + Save again. This de-emphasises a one-time setup step so Settings
    leads with what matters day to day.

## Bugs

- **Android hardware back button does nothing.** You can only navigate back with
  the in-app "‹" back button; the phone's system back button doesn't step back
  through screens (and may exit the app). The app uses screen `<div>`s toggled by
  `showScr()` rather than browser history, and no Capacitor `App` `backButton`
  listener is registered. Fix: register `App.addListener('backButton', …)` that
  mirrors the in-app back — close any open overlay/sheet first, else go to the
  previous screen (step → checklist → home, pantry → home), and only minimise/
  exit when already on the home screen.

- **Images aren't loading.** (Needs clarification — see note.) The app currently
  renders recipes with an emoji and never displays photos; imported photos are
  only sent to the AI, not stored or shown. So this report needs pinning down:
  which images, on which screen. Candidate causes once identified: emoji not
  rendering on the device's WebView (showing as boxes), an expectation that
  recipe photos should display (a feature, not a bug), or a broken asset path.
