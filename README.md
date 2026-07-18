# CartLab 🛒

Shopping lists with photos and **lock-screen reminders**. Bilingual (EN/HE with RTL), installable on iPhone as a PWA — same architecture as FitLab (React + Vite + Tailwind, Express + Web Push, Railway).

## Features

- **Multiple lists** — create, open, delete. Each list shows how many items are left to buy.
- **Items with quantities & units** — +/− stepper per item; tapping the number cycles the unit (× / kg / g / L / pack) with sensible steps (0.5 kg, 100 g). Check items off into an "In cart" section, clear bought items in one tap — and enjoy the little "All done!" when the last one lands in the cart.
- **Item notes** — tap an item's name to add a short note ("the brand in the blue package"); it shows under the name and syncs.
- **Urgent items** — the item sheet has a "Mark as urgent" button: everyone sharing the list — including the person who marked it, as confirmation — gets an immediate push notification with the product name (in their own language), and the item jumps to a red 🚨 Urgent section at the top of the list. Devices register for these alerts automatically once notification permission is granted (marking something urgent, or setting a reminder, is the moment the app asks).
- **Photo per item** — tap the camera square on any item; on iPhone this offers *Take Photo / Photo Library*. Photos are downscaled to a small JPEG, cached on-device in IndexedDB, and synced to the server so everyone sharing the list sees them.
- **Autocomplete** — typing in the add-item box suggests from a built-in catalog of ~150 common groceries (EN + HE, matched in both languages) plus everything you've added before; tap a suggestion to add it instantly.
- **Grouped by store section** — the "To buy" list auto-groups items into Vegetables / Fruit / Dairy / Meat / Pantry… in store-walk order, using the same catalog (unrecognized items land under "Other").
- **Merge duplicates** — when the same item appears twice (easy on a shared list), a "Merge duplicates" button shows up: one survivor per name with quantities summed, photos kept.
- **Undo** — removing an item or clearing bought items shows a 6-second Undo toast that restores the items (photos included) in place.
- **Frequently bought** — check-offs build a per-device purchase history; your staples appear as one-tap chips under the add box.
- **Sync status** — a small pill shows "Syncing…" when changes are still queueing and "Offline — changes will sync" when there's no connection.
- **Swipe gestures** — swipe an item in the reading direction to check it off, the other way to delete (mirrored in RTL; undo covers mistakes).
- **Live-edit flash** — items added or changed by another device flash green for a moment, so a partner's edits are visible as they happen.
- **Category fix** — tap an item's name to file it under a different section when the automatic guess is wrong; the override syncs.
- **Dark mode** — follows the system appearance (palette swaps via CSS variables; browser chrome follows through dual theme-color metas).
- **"Near store" alert** — a Shortcuts "When I arrive" automation (web apps can't geofence in the background) fetches `GET /api/lists/:id/alert?min=N`, which returns the unbought items as text only when at least N remain — the Shortcut turns that into a lock-screen notification. The in-app "Near store" button generates the URL and walks through the one-time setup.
- **Lock-screen reminders** — pick a date & time per list; a push notification arrives with the list name and the items still left to buy (e.g. `🛒 Groceries — Milk ×2 · Eggs · Bread`). Tapping it opens the app on that list. If you keep editing the list after setting the reminder, the notification text is kept in sync automatically.
- **Export to Apple Reminders** — the "Apple Reminders" button on a list sends every unbought item into the native iOS Reminders app via a one-time Shortcut (see below). Native reminders sync across devices and appear on the lock screen. On non-iOS devices the button shares/copies the list instead.
- **Shared lists** — every list lives on the server; the "Share list" button sends a link (`/#list=<id>`), and anyone who opens it joins the list. Edits sync live between devices (SSE change feed), per item, so two people can shop the same list at once without overwriting each other.
- **Offline** — service worker caches the app shell; lists are cached in localStorage and edits made offline are queued and replayed to the server on reconnect. Photos taken offline upload when connectivity returns.

## How sharing/sync works

- The server (`store.mjs`) keeps lists in SQLite via Node's built-in `node:sqlite` (no native deps, Node ≥ 22.13). The DB lives in `DATA_DIR`.
- A list's id **is** the sharing capability — there are no accounts. The share link deep-links to `/#list=<id>`; opening it fetches the list and adds it to "My lists" on that device.
- Writes are per-item, last-write-wins (`PUT /api/lists/:id/items/:itemId`), so concurrent edits to different items never conflict. Every mutation bumps the list `version` and is broadcast over `GET /api/events` (SSE); other devices refetch only when the version moved.
- The client (`src/hooks/useSyncedLists.js`) applies edits optimistically, persists a mutation queue in localStorage, and replays it in order when connectivity returns.
- Photos: the compressed JPEG caches in IndexedDB and uploads via a separate queue to `PUT /api/lists/:id/items/:itemId/photo`; the server stores files under `DATA_DIR/photos` and owns `hasPhoto`/`photoRev`, which cache-bust the immutable photo URLs on other devices.

## How reminders work

Same mechanism as FitLab's rest-timer pushes, extended for long delays:

1. The client subscribes to Web Push and POSTs `/api/push/schedule` with an absolute time (up to 45 days ahead).
2. The server persists it to `reminders.json` (so restarts re-arm pending reminders) and sends the push via the push service at the right moment.
3. The service worker shows the notification — on the lock screen, even if the app has been closed for days.

Note: without a volume, Railway's filesystem is ephemeral across **deploys** — see the volume step under Deploy, which makes both lists and pending reminders survive.

## Apple Reminders export — one-time Shortcut setup

The app launches a Shortcut named **CartLab** and passes it text where the **first line is the target Reminders list name** (editable in the export dialog and remembered — e.g. "קניות"; defaults to the CartLab list's name) and each following line is an unbought item. The Shortcut files the items into the Reminders list with that name. Create it once on the iPhone:

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
3. **Attach a volume** (service → right-click → Attach Volume), mount it at e.g. `/data`, and set `DATA_DIR=/data`. This is where the shared-lists SQLite DB and `reminders.json` live — without it, every deploy wipes all lists.
4. Deploy. `/api/health` is the healthcheck.

## Install on iPhone (required for reminders)

iOS only delivers web push to **installed** web apps (iOS 16.4+):

1. Open the deployed URL in **Safari**.
2. Tap **Share → Add to Home Screen**.
3. Open the app **from the home screen icon** and set a reminder — approve the notification permission prompt.

After that, reminders appear on the lock screen like any native notification. The app shows a hint automatically if you try to set a reminder from Safari without installing first.
