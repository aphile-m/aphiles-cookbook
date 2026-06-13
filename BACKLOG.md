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
