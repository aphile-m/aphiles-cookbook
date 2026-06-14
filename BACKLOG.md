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

## Features

- **Recipe photos for visual appeal.** Today every recipe shows only an emoji;
  the app would feel much richer with a real photo per recipe (on the home
  cards and as a header on the recipe screen). Scope:
  - **Capture:** when importing by photo, keep the image (not just send it to
    the AI). Also let the user add/replace/remove a photo on any recipe
    (camera or gallery), including built-in and link/text-imported ones.
  - **Display:** show the photo as the home-card thumbnail and a recipe-screen
    header/hero; fall back to the existing emoji tile when there's no photo.
  - **Storage:** downscale to a small JPEG thumbnail before saving — full
    photos in `localStorage` will blow the ~5 MB quota fast. Cap dimensions
    (e.g. ~640px long edge) and quality; consider IndexedDB if it grows.
  - **Nice-to-have:** for AI-generated/link recipes with no photo, a tasteful
    gradient+emoji tile (current look) is the fallback rather than a blank.
