# Sip and Surf

A Chrome extension that keeps you hydrated while you browse. Every so often a pixel buddy walks onto your screen with a water bottle, stops, looks at you and takes a sip, then asks you to **Sip** or **Snooze**. Sip and Surf also tracks how much you drink each day against a daily target, with history and insights.

![Gojo walks in, sips, and after Sip raises his bottle and walks on](docs/gojo-preview.gif)

![Spider-Man gets angry when you snooze and walks back the way he came](docs/spiderman-preview.gif)

## Features

- **Two buddies, both free:** Gojo and Spider-Man. Pick one in the popup or on the welcome page.
- **Reminder interval** you pick in the popup (10 minutes to 10 hours, presets or custom).
- **Walking buddy:** enters from the left of the page and takes 8 steps along the bottom of the screen, facing the way it walks. Then it stops, turns to look at you and takes a sip, with a sip sound.
- **Sip:** the buddy says "Cheers!", raises its bottle to you, hops, then walks on off the right edge. Your sip is logged and the timer resets to your full interval.
- **Snooze:** the buddy gets angry: an anger mark pops up over its head, it grits its teeth and stamps, says when it'll be back, then walks back off the left edge, the way it came.
- **Snooze length** you pick: 1 to 120 minutes (3 by default). The Snooze button shows it.
- **Auto-snooze:** if nobody answers within 60 seconds, the buddy snoozes by itself, just as angry ("You ignored me!").
- **Active hours:** reminders only between the times you pick (8:00 to 22:00 by default), on the days you pick, so there are no reminders at 2 a.m. or on your days off. A reminder that falls outside waits for your next active hours. Windows can run past midnight for night shifts.
- **Stays out of the way:** while the page is in full screen (a video, a game, a presentation) or you're on a call (Google Meet, Zoom, Webex, Whereby and Jitsi when open; Teams, Discord, Slack, Skype, WhatsApp and Messenger while they play sound), the buddy waits and checks again every 2 minutes. You can turn this off.
- **Welcome page** on install: meet your buddy with a live demo visit, pick a buddy, set your hours.
- **Make me a buddy:** a custom buddy drawn from your own photos, for a one-time $10, arranged by email (see below).
- **Daily intake tracking:** each Sip adds one serving (250 ml by default). Log extra glasses or undo from the popup.
- **History and insights:** today vs target, current and best streak, target hit rate, daily average, how often reminders get a Sip, a daily intake chart with the target line, a drink-by-hour chart, a day-by-day table and CSV export.
- **Works everywhere it can:** on pages where Chrome blocks extensions (`chrome://` pages, the Chrome Web Store), you get a system notification with Sip and Snooze buttons instead.
- **Survives restarts:** settings, timer and history live in `chrome.storage.local`, and the timer runs on `chrome.alarms`. A reminder that came due while Chrome was closed shows a few seconds after Chrome opens.
- **Private:** nothing leaves your computer. See the [privacy policy](PRIVACY.md).

## Install (developer mode)

1. Download or clone this repo.
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick the repo folder. The welcome page opens.
4. Pin Sip and Surf to the toolbar and open the popup. The first reminder is 1 hour after install. Click **Remind me now** to see it straight away.

Chrome shows "Read and change all your data on all websites" at install. That's needed because the buddy appears on whatever page you are on without you clicking the extension first. Sip and Surf never reads page content and sends nothing anywhere.

## Make me a buddy

A custom buddy that looks like you (or a friend, or a pet), with the same walk, sip, cheers and angry snooze as Gojo and Spider-Man. **$10, one-time.** There's no payment inside the extension: the order is agreed by email.

1. The buyer clicks **Email us to order** (on the welcome page, or **Tell me more** in the popup). It opens an email with a short template: who the buddy is of, 1 to 3 photos, anything to include, and where they live.
2. You agree the details and the payment by email, using a method that works for both of you.
3. You draw the buddy and send back a `.buddy.json` file. The buyer adds it with **Add a buddy file**, and it becomes their buddy right away. Buddy files stay on their computer.

Orders go to the email address in `lib/config.js` (`CONTACT_EMAIL`). If it is left empty, the order button says "Ordering opens soon". The price and the email template live there too. Buddies are of real people and pets only, not famous characters.

### Making a buddy file

Customers' photos and files go in `customers/`, which git ignores, so they never end up in the repo.

- **Full buddy** (walks in side view, turns to face you, sips, cheers and gets angry): copy `tools/gojo.py` to `customers/<name>/<name>.py`, change the palette and the head pixels to match the photos, then run:

  ```sh
  python3 tools/make_buddy_pack.py customers/jane/jane.py --name "Jane" --line "Jane, but tiny"
  ```

- **One picture** (quicker): draw the buddy standing, facing right, holding a bottle, on a transparent background. The extension animates it with a bob-and-lean walk and a tilt-back sip.

  ```sh
  python3 tools/make_buddy_pack.py --image customers/jane/jane.png --name "Jane"
  ```

Either way you get `jane.buddy.json` to email to the buyer.

## The characters

Both are unofficial fan art, included for free: Gojo is from Jujutsu Kaisen (© Gege Akutami / Shueisha) and Spider-Man is © Marvel. Sip and Surf isn't affiliated with or endorsed by either.

- **Gojo:** white spiky hair pushed up by his black blindfold, pale skin, a cocky smirk, the dark navy high-collar uniform with its gold button, black shoes.
- **Spider-Man:** the red and blue suit with its web pattern and the black spider on the chest, red gloves and boots, and the mask rolled up to just under his nose so he can sip with his mouth. Big white lenses that narrow when he's angry and curve up when he's happy.

What they do:

- **Walking:** side view, looking where it's going, with an 8-frame walk cycle (heel strike, knee bend, push-off) and arms swinging opposite the legs. The page moves it exactly one stride per step, so its feet don't slide.
- **Stopping:** it turns through a three-quarter view to face you.
- **Sip:** the arm lifts the bottle to the chin, the straw goes into the mouth, the water level drops with bubbles rising, then a smile.
- **After you press Sip:** it raises the bottle to you, hops, and walks on.
- **After Snooze:** it growls and frowns with the anger mark throbbing over its head, then walks back the way it came.

### Drawing them

`tools/make_character.py` holds everything the characters share: the body, the poses, the walk cycle and the bottle. `tools/gojo.py` and `tools/spiderman.py` each swap in a palette, a head and an outfit. Body parts are vector shapes posed with joint angles, drawn at 8x and reduced to clean pixels, each with its own outline. Faces, hair and masks are placed pixel by pixel. Run `python3 tools/make_character.py` after editing to rebuild `assets/characters/`, then `python3 tools/make_previews.py` for the previews here. To add a built-in character, copy `tools/gojo.py`, build it in `build_all()`, and list it in `lib/characters.js`.

![Every frame of both sheets: side view, 8 walk frames, the turn, facing you, 8 sip frames, the bottle raised, and 2 angry frames](docs/sheet-preview.png)

## How it works

| File | What it does |
| --- | --- |
| `manifest.json` | Manifest V3. Permissions: `alarms`, `storage`, `scripting`, `notifications`, `offscreen`, `tabs`, and host access to all sites. |
| `background.js` | Service worker. Owns the timer (`chrome.alarms`), holds reminders back in quiet hours and while you're busy, shows the reminder in the active tab, handles Sip, Snooze and auto-snooze, records intake, and adds or removes buddy files. |
| `lib/state.js` | Settings, timer state and daily history in `chrome.storage.local`. |
| `lib/hours.js` | Active hours: whether now is inside them, and when they next start (pure functions, unit tested). |
| `lib/busy.js` | Whether you're in full screen or on a call (pure functions, unit tested). |
| `lib/characters.js` | The built-in characters. |
| `lib/buddies.js` | Checks and stores custom buddy files. |
| `lib/config.js` | The contact email, the Make me a buddy price and its email template. |
| `lib/sprite.js` | Loads a character's sheet, or builds one from a single picture. |
| `lib/insights.js` | Streaks, hit rate, averages and CSV export (pure functions, unit tested). |
| `content/overlay.js` | The on-page buddy, inside a closed Shadow DOM so page CSS can't affect it and it can't affect the page. |
| `offscreen/` | Plays `assets/sip.wav`. Service workers can't play audio, so an offscreen document does it. |
| `popup/` | Today's intake, the countdown, the buddy picker and Make me a buddy, and the settings. |
| `welcome/` | Opens on install: the demo visit, picking a buddy, active hours, Make me a buddy and adding buddy files. |
| `privacy/` | The privacy policy, inside the extension. The same text is in `PRIVACY.md` for the store listing. |
| `history/` | History and insights page (also opens as the extension's options page). |
| `tools/make_character.py`, `tools/gojo.py`, `tools/spiderman.py` | Draw the characters, their sprite sheets (`assets/characters/`) and the anger mark. |
| `tools/make_buddy_pack.py` | Makes `.buddy.json` files for Make me a buddy orders. |
| `tools/make_previews.py` | Makes the GIFs and sheet preview in this README. |
| `tools/make_assets.py` | Regenerates the icons and the sip sound. |

Timer rules:

- **Sip:** next reminder at `now + interval`.
- **Snooze or auto-snooze:** next reminder at `now + snooze length`.
- **Outside active hours:** the reminder waits for the next start of your active hours.
- **Busy (full screen or a call):** it checks again every 2 minutes and comes once you're done.
- **Remind me now** always shows the buddy straight away.
- The shortest interval is 10 minutes and the shortest snooze is 1 minute.

## Development

```sh
npm test                          # unit tests: active hours, busy checks, buddy files, insights, settings (Node 18+)
python3 tools/make_character.py   # redraw the character sheets (needs pillow and numpy)
python3 tools/make_previews.py    # redraw the README previews
python3 tools/make_assets.py      # regenerate icons and sound
```

If motion is reduced in your OS settings, the buddy fades in at the stopping point instead of walking.
