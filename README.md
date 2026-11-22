# Football Training Tracker

A small, mobile-friendly web app for tracking daily football training over a 4-week plan
(starting Monday 23 November 2026). Plain HTML/CSS/JS — no build step, so it runs straight from GitHub Pages.

## How it works

- Four themes: **Acceleration**, **Stamina**, **Aggressive play**, **Shooting**, each with its own exercises.
- Every day, tick off the exercises you did. A theme is *done* when you've ticked at least 3 of its exercises
  (or all of them if the theme has fewer than 3 — currently Aggressive play, which has only one).
- A day is *complete* when all four themes are done.
- **Today** – tick exercises, step between days. Future days are locked.
- **Plan** – 4-week calendar showing complete / missed / upcoming days.
- **Progress** – days completed, streaks, per-theme and weekly stats, exercise log.
- **Settings** – add or remove your own exercises, add extra weeks, export/import a backup, reset.

Progress is stored in your browser (`localStorage`) on the device you use. Use **Settings → Export backup**
to keep a copy or move it to another device.

## Changing the plan

Edit `js/config.js` — start date (must be a Monday), number of weeks, the minimum per theme,
and the themes/exercises.

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
