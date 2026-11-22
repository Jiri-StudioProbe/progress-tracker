# Football Training Tracker

A small, mobile-friendly web app for tracking daily football training over a 4-week plan
(starting Monday 23 November 2026). Plain HTML/CSS/JS — no build step, so it runs straight from GitHub Pages.

## How it works

- Four themes: **Acceleration**, **Stamina**, **Aggressive play**, **Shooting**, each with its own exercises.
- Every day, tick off the exercises you did. A theme is *done* for a day when you've ticked at least 3 of its
  exercises (or all of them if it has fewer).
- **Daily themes** (Acceleration, Stamina) must be done for the day to be *complete*.
- **Weekly themes** (Aggressive play, Shooting) can't always be done, so they don't block a day. They're still
  tracked every day, and each needs **3 days per week** reaching the daily minimum. The app shows
  "This week: 1 / 3 days · 4 days left", warns when a target can no longer be reached, and records which
  weeks hit their target.
- **Today** – tick exercises, step between days. Future days are locked.
- **Plan** – 4-week calendar showing complete / missed / upcoming days.
- **Progress** – days completed, streaks, weekly targets hit, per-theme and weekly stats, exercise log.
- **Edit times** – tap the time chip next to any exercise on the Today screen (e.g. "10 min", or "+ time" if blank) to change it.
- **Settings** – pick the page colour and toggle the footballer collage, add or remove your own exercises, add extra weeks, export/import a backup, reset.

## Saving progress to GitHub

Progress is kept in your browser as a cache, and (once you connect it) saved to a JSON file in this repo:
`progress.json` on the `progress-data` branch. That branch is separate from the site, so saving never
rebuilds GitHub Pages. If your browser data is wiped, connect again and everything comes back.

**One-time setup, on each device:**

1. On GitHub: **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. Repository access → *Only select repositories* → `progress-tracker`.
3. Permissions → Repository permissions → **Contents: Read and write** (nothing else).
4. Copy the token, open the app → **Settings → GitHub sync**, paste it and press **Connect**.

The app creates the `progress-data` branch the first time it saves. Changes are uploaded a couple of seconds after
you tick something; if you're offline they're kept and uploaded later. Edits made on two devices are merged day by day
(the most recent edit to a given day wins). The header shows whether everything is saved.

Notes: the token lives only in that browser — don't use sync on a shared computer. If the repo is public,
`progress.json` is readable by anyone. **Settings → Export backup** still downloads a copy as a file.

## Background

The page background is a collage of football legends — stylised silhouettes with each player's name and shirt number,
drawn in code (`js/background.js`), so there are no image files or photo licences involved. **Settings → Background**
has 7 colours and a switch to turn the collage off; the choice is remembered on that device.
The boxes (cards, exercise rows, tick squares, calendar days, buttons) are white on every colour except Graphite, where they are black.
To change who appears, edit the `collage` list in `js/config.js`.

## Surprises (spoilers!)

Finishing a day can trigger a little surprise (`js/eggs.js`, `css/eggs.css`):

| When | Surprise (`?egg=` id) |
| --- | --- |
| Day 2 | `var` – a painfully serious video review of your tick |
| Day 4 | `keepy` – a keepy-uppy mini-game |
| Day 5 | `crash` – a fake "legs not found" error (a prank, progress is safe) |
| Day 7 | `ceremony` – an awards ceremony with your real numbers and an acceptance speech |
| After day 7, on about half of the days, at random | `redcard`, `invader`, `flip`, `gaffer`, `banana`, `fortune` |

- A surprise shows when the day's daily themes are completed **on that day** (not when back-filling an old day).
- One a day at most. If a scripted day is missed, its surprise arrives on the next day you complete.
- Which surprises have been shown is saved with your progress (and synced), so a second device won't repeat one.
- Every surprise has a close button and closes with Escape. **Settings → Surprises** turns them off on that device.
- Respects "reduce motion": the motion-heavy ones become simple static cards.
- **Preview one:** add `?egg=<id>` to the page address, e.g. `https://…/progress-tracker/?egg=keepy`
  (or `?egg=random`). Previews don't count as shown.

## Changing the plan

Edit `js/config.js` — start date (must be a Monday), number of weeks, the minimum per theme,
and the themes/exercises. Give a theme `weeklyTarget: N` to make it a weekly theme (N days a week);
leave it out to require the theme every day.

## Publishing on GitHub Pages

1. Push this repo to GitHub.
2. Repo **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, pick your branch (e.g. `main`) and the `/ (root)` folder, then Save.
4. After a minute the site is live at `https://<your-username>.github.io/progress-tracker/`.

## Running locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```
