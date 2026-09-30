# Sip and Surf

A Chrome extension that keeps you hydrated while you browse. Every so often a pixel buddy walks onto your screen with a water bottle, stops, and asks you to **Sip** or **Snooze**. Sip and Surf also tracks how much you drink each day against a daily target, with history and insights.

![The Sip and Surf character walking and taking a sip](docs/character-preview.gif)

## Features

- **Reminder interval** you pick in the popup (10 minutes to 10 hours, presets or custom).
- **Walking buddy:** enters from the far left of the page, takes 8 steps along the bottom of the screen, then stops. A sip sound plays on arrival.
- **Sip:** the buddy drinks from the bottle, hops, and leaves. Your sip is logged and the timer resets to 100% of your interval.
- **Snooze:** the buddy walks off to the right and comes back after exactly 5% of your interval (60 min interval: 3 min snooze).
- **Auto-snooze:** if nobody answers within 60 seconds, the buddy snoozes automatically.
- **Daily intake tracking:** each Sip adds one serving (250 ml by default). Log extra glasses or undo from the popup.
- **History and insights:** today vs target, current and best streak, target hit rate, daily average, how often reminders get a Sip, a daily intake chart with the target line, a drink-by-hour chart, a day-by-day table and CSV export.
- **Works everywhere it can:** on pages where Chrome blocks extensions (`chrome://` pages, the Chrome Web Store), you get a system notification with Sip and Snooze buttons instead.
- **Survives restarts:** settings, timer and history live in `chrome.storage.local`, and the timer runs on `chrome.alarms`. A reminder that came due while Chrome was closed shows a few seconds after Chrome opens.

## Install (developer mode)

1. Download or clone this repo.
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick the repo folder.
4. Pin Sip and Surf to the toolbar and open the popup. The first reminder is 1 hour after install. Click **Remind me now** to see it straight away.

Chrome shows "Read and change all your data on all websites" at install. That's needed because the buddy appears on whatever page you are on without you clicking the extension first. Sip and Surf never reads page content and sends nothing anywhere.

## The character

The buddy is a pixel portrait of ayush (messy hair, round shades, black high-collar jacket, grey backpack), drawn in `tools/make_character.py` as a letter grid, one letter per pixel. Edit the grid and run `python3 tools/make_character.py` to tweak the look.

![All 11 frames built from the one image](docs/sheet-preview.png)

### Using a different character

Everything comes from **one image**: `assets/character-sprite.png`.

1. Draw your character standing, **facing right**, holding the water bottle, on a transparent background. Feet on the bottom edge. Any size works; small pixel art (for example 24 × 32 or 32 × 48) looks crispest.
2. Replace `assets/character-sprite.png` with it (same file name).
3. Reload the extension in `chrome://extensions`.

When the extension starts, it builds the full sprite sheet from that single image (`lib/sprite.js`): 1 idle frame, 4 walk frames (a bob, lean and squash cycle, two steps per cycle) and 6 drink frames (tilts back with the bottle up, with water droplets, then comes back). You don't draw any extra frames. To change the poses, edit the `POSES` table in `lib/sprite.js`.

The on-screen height is about 160 px. Small images scale up by whole numbers so the pixels stay sharp.

## How it works

| File | What it does |
| --- | --- |
| `manifest.json` | Manifest V3. Permissions: `alarms`, `storage`, `scripting`, `notifications`, `offscreen`, `tabs`, and host access to all sites. |
| `background.js` | Service worker. Owns the timer (`chrome.alarms`), shows the reminder in the active tab, handles Sip, Snooze and auto-snooze, and records intake. |
| `lib/state.js` | Settings, timer state and daily history in `chrome.storage.local`. |
| `lib/sprite.js` | Builds the sprite sheet from your one image. |
| `lib/insights.js` | Streaks, hit rate, averages and CSV export (pure functions, unit tested). |
| `content/overlay.js` | The on-page buddy, inside a closed Shadow DOM so page CSS can't affect it and it can't affect the page. |
| `offscreen/` | Plays `assets/sip.wav`. Service workers can't play audio, so an offscreen document does it. |
| `popup/` | Today's intake, the countdown, and the settings. |
| `history/` | History and insights page (also opens as the extension's options page). |
| `tools/make_character.py` | Draws the character into `assets/character-sprite.png`. |
| `tools/make_assets.py` | Regenerates the icons and the sip sound. |

Timer rules:

- **Sip:** next reminder at `now + interval`.
- **Snooze or auto-snooze:** next reminder at `now + interval × 0.05`.
- The shortest interval is 10 minutes, because Chrome alarms can't fire sooner than 30 seconds and 5% of 10 minutes is 30 seconds.

## Development

```sh
npm test                    # unit tests for the insights maths (Node 18+)
python3 tools/make_character.py  # redraw the character (needs pillow)
python3 tools/make_assets.py     # regenerate icons and sound (needs pillow and numpy)
```

If motion is reduced in your OS settings, the buddy fades in at the stopping point instead of walking.
