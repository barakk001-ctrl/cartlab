# CartLab 🛒

Shopping lists with photos and **lock-screen reminders**. Bilingual (EN/HE with RTL), installable on iPhone as a PWA — same architecture as FitLab (React + Vite + Tailwind, Express + Web Push, Railway).

## Features

- **Multiple lists** — create, open, delete. Each list shows how many items are left to buy.
- **Items with quantities** — +/− stepper per item, check items off into an "In cart" section, clear bought items in one tap.
- **Photo per item** — tap the camera square on any item; on iPhone this offers *Take Photo / Photo Library*. Photos are downscaled to a small JPEG and stored on-device in IndexedDB (never uploaded).
- **Lock-screen reminders** — pick a date & time per list; a push notification arrives with the list name and the items still left to buy (e.g. `🛒 Groceries — Milk ×2 · Eggs · Bread`). Tapping it opens the app on that list. If you keep editing the list after setting the reminder, the notification text is kept in sync automatically.
- **Export to Apple Reminders** — the "Apple Reminders" button on a list sends every unbought item into the native iOS Reminders app via a one-time Shortcut (see below). Native reminders sync across devices and appear on the lock screen. On non-iOS devices the button shares/copies the list instead.
- **Offline** — service worker caches the app shell; lists live in localStorage.

## How reminders work

Same mechanism as FitLab's rest-timer pushes, extended for long delays:

1. The client subscribes to Web Push and POSTs `/api/push/schedule` with an absolute time (up to 45 days ahead).
2. The server persists it to `reminders.json` (so restarts re-arm pending reminders) and sends the push via the push service at the right moment.
3. The service worker shows the notification — on the lock screen, even if the app has been closed for days.

Note: Railway's filesystem is ephemeral across **deploys**, so redeploying drops pending reminders (restart/crash does not).

## Apple Reminders export — one-time Shortcut setup

The app launches a Shortcut named **CartLab** and passes it text where the **first line is the list name** and each following line is an unbought item. The Shortcut files the items into the Reminders list with that name — so every CartLab list gets its own list ("directory") in the Reminders app. Create it once on the iPhone:

1. Open the **Shortcuts** app, tap **+**, and name the shortcut exactly **CartLab**.
2. Add a **Split Text** action — Separator: **New Lines** (input: Shortcut Input).
3. Add **Get Item from List** — **First Item** (that's the list name).
4. Add **Get Item from List** again — **Items in Range**: 2 to 500.
5. Add **Repeat with Each** over the range items; inside it add **Add New Reminder** — Title: **Repeat Item**; for the List field tap it → **Select Variable** → the **First Item** from step 3.
6. In the **Reminders** app, create a list with the same name as your CartLab list once (tap "Add List") — Shortcuts matches the list by name but can't create it.

The app shows these same steps in the export dialog.

## Run locally

```bash
npm install
npm run build
npm start          # http://localhost:4173 (serves dist/ + push API)
```

For UI development with hot reload: `npm run dev` (Vite on :5173, proxies `/api` to :4173 — run `npm start` in a second terminal if you need push locally).

`.env` holds the VAPID key pair (already generated; regenerate with `npx web-push generate-vapid-keys`).

## Deploy to Railway

1. Push this folder to a GitHub repo and create a Railway service from it (`railway.json` / `nixpacks.toml` are already set up — same as FitLab).
2. In Railway → Variables, add the three values from `.env`:
   `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
3. Deploy. `/api/health` is the healthcheck.

## Install on iPhone (required for reminders)

iOS only delivers web push to **installed** web apps (iOS 16.4+):

1. Open the deployed URL in **Safari**.
2. Tap **Share → Add to Home Screen**.
3. Open the app **from the home screen icon** and set a reminder — approve the notification permission prompt.

After that, reminders appear on the lock screen like any native notification. The app shows a hint automatically if you try to set a reminder from Safari without installing first.
