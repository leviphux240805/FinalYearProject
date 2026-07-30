# Demo Script — Super League Fantasy (project defense)

This document is meant to be followed step-by-step while screen-recording. Each section has: **action** (what to click), **what to say** (tied to the algorithm/chapter in the `report-chapters-2-7.md` report), and **what you should expect** to see on screen.

---

## 0. Startup checklist (do this BEFORE hitting Record)

Run these in order, one terminal window per command, **keep all terminals open** during recording (the instructor may want to see the logs):

1. **PostgreSQL** — make sure the service is running (Windows Service `postgresql-x64-18`, or `pg_ctl start` if you're running it manually as described in Section 5.6 of the report).
2. **Redis** — start the Redis server. If the backend log doesn't show the line `🔌 Redis Cluster connected successfully!`, the leaderboard (item 10 below) won't work — check this before recording.
3. Open terminal 1:
   ```
   cd fantasy-backend
   npx prisma migrate dev
   ```
   Confirm the 2 latest migrations were applied: `20260724130000_add_matchday_scoring` and `20260724140000_fix_virtual_balance_scale`. If Prisma reports a schema drift error, see `MATCHDAY_SETUP.md` already in the `fantasy-backend/` folder.
4. Seed the data (only needs to be done once, skip if the DB already has data):
   ```
   npm run seed:teams
   npm run seed:curated
   node scripts/seedGameweekStats.js
   ```
5. Start the backend (keep the terminal open):
   ```
   node server.js
   ```
   Check the log confirms: `🚀 Server: http://localhost:3000`, `🔌 Redis Cluster connected successfully!`.
6. Open terminal 2, start the frontend:
   ```
   cd super-league-fantasy
   npm run dev
   ```
   Vite prints a URL (usually `http://localhost:5173`) — open that URL in Chrome.
7. **Important:** use a **NEW account, registered right at the start of recording** — both to demo the registration flow, and to avoid any leftover data/wallet bugs encountered previously (already fixed, but a fresh account is the cleanest for demoing).

---

## 1. Opening (30 seconds, spoken to camera or as voice-over)

> "This is Super League Fantasy — a fantasy football system built around 3 core algorithms from the report's design: BNPL Transfer Execution (Algorithm 1, with row-locking to prevent race conditions), Weighted Random Pack Drop (Algorithm 2, the Gacha system), and the Tactical Fit Analyzer (Algorithm 3). This entire demo runs live against a real database, not mocked data."

This is exactly the point the report makes in Chapter 6: clearly distinguishing "genuinely verified" from "only designed on paper" — this demo is the former.

---

## 2. Register an account

**Action:** On the login screen, choose the "Sign Up" tab/link, enter a username (letters/numbers/underscore only, ≥3 characters) and a password (≥8 characters).

**What to say:** "The password is hashed with bcrypt at 12 salt rounds before being stored; the username is checked for duplicates and character constraints right on the backend."

**Expected:** A green welcome toast, automatic login, wallet showing **$100.0M**.

---

## 3. Log out then log back in

**Action:** Click the ⏏ button in the top-right corner to log out, then log back in with the same account you just created.

**What to say:** "Login uses a constant-time bcrypt.compare even when the username doesn't exist, preventing username-enumeration attacks via response timing."

**Expected:** Returns to the exact same wallet/squad as before logging out (genuinely resynced from Postgres via `/api/auth/me` and `/api/squad`, not just relying on localStorage).

---

## 4. Build your squad & the Transfer Market — Algorithm 1 (BNPL)

**Actions & what to say (do these in order):**

1. Buy 1–2 moderately priced players (within your current wallet) → "The transaction runs inside a single Prisma transaction with a row lock (`SELECT ... FOR UPDATE`), the balance always comes from the server's response, the client never computes it itself."
2. Pick a player priced **slightly higher than your wallet** (shortfall ≤ $2.0M) → the "Virtual Overdraft" BNPL modal appears → confirm the loan → "The loan goes through, but incurs a 4-point penalty (`penaltyPoints`), exactly per Algorithm 1."
3. Pick a player with a **shortfall greater than $2.0M** → the system rejects it with an overdraft-limit message → "This is the `InsufficientFundsError` when the shortfall exceeds `MAX_BNPL_OVERDRAFT`."
4. Try buying a **4th player from the same club** → blocked with "maximum 3 players/club" → "This business rule is enforced on the backend, not just in the UI."
5. Try exceeding a position limit (e.g. a 3rd GK) → blocked → "Position limits (GK≤2, DEF≤5, MID≤5, FWD≤3, total ≤15) are enforced on both layers: client and server."
6. Sell a player → "Refunds 90% of the value, also inside a transaction with a row lock."

**Expected:** The wallet/penalty points update correctly immediately, matching green/red toasts.

---

## 5. Compare Players — Algorithm 3 (Tactical Fit Analyzer)

**Action:** Go to the "Compare Players" tab, pick 2 players, or click the 📈 icon on a player row in the market to open the radar chart.

**What to say:** "The Tactical Fit score is computed as `baseScore 50 + a modifier based on position and the club's tactical stats` — for example Haaland (FWD, Man City) produces a score of 83, matching the hand-calculation `50 + 50×0.3 + 90×0.2 = 83` recorded in Section 6.3 of the report."

**Expected:** The radar chart renders, and the score is consistent every time it's fetched again (not random).

---

## 6. Open a Gacha pack — Algorithm 2 (Weighted Random Pack Drop)

**Action:** Go to the "Open Player Packs" tab, open a few packs in a row.

**What to say:** "Probability by tier: LEGENDARY ~5%, EPIC ~15%, RARE ~30%, COMMON ~50%, using cumulative weighted random — you can see most pulls land on COMMON/RARE, LEGENDARY is rare, exactly as designed."

**Expected:** The pack-opening animation plays, the player's name + tier are shown clearly.

---

## 7. Arrange the starting lineup

**Action:** On the "Squad & Market" tab, drag-and-drop players between the pitch and the bench, click to pick a Captain, right-click to pick a Vice-Captain.

**What to say:** "The constraint of exactly 1 starting goalkeeper and exactly 11 starters is validated on both directions of the drag-and-drop."

**Expected:** Smooth drag-and-drop effects, the Captain (C)/Vice-Captain (V) armband appears on the correct player.

---

## 8. Demo real-time scoring via Webhook — UC-02 (the report's original design)

This is the **event-by-event real-time** flow already present in the original report (Section 3.5, UC-02) — simulating a third-party webhook firing an event.

**Action:** Open one more terminal, get your `userId` by opening DevTools Console on the logged-in web tab and typing:
```js
JSON.parse(localStorage.getItem('auth_user')).id
```
Then run (replacing `<userId>` and `<playerId>` — playerId must be a player CURRENTLY in your starting lineup):
```bash
curl -X POST http://localhost:3000/api/webhook/simulate ^
  -H "Content-Type: application/json" ^
  -d "{\"playerId\": <playerId>, \"action\": \"Goal!\", \"points\": 6, \"userId\": \"<userId>\", \"eventId\": \"demo-1\", \"gameweek\": 1}"
```
(In PowerShell use the `` ` `` backtick instead of `^` for line continuation, or type it all on one line.)

**What to say:** "The server checks for a duplicate `eventId` using a 10-minute in-memory TTL cache before broadcasting, then fires it over Socket.io to the exact `gameweek_1` room — the client receives `LIVE_SCORE_UPDATE` and adds the points automatically, doubled if it's the captain."

**Expected:** A "🔥 LIVE: ... +N points!" toast, a sound effect, the player's score increasing immediately on screen with no page reload.

---

## 9. [EXTENDED feature — not in the original report] Run Matchday

> ⚠️ **Important note:** This section is a feature that was built ADDITIONALLY after the `report-chapters-2-7.md` report was finalized — the report currently only describes event-by-event real-time scoring (item 8 above), not this "score the whole gameweek at once" mechanism. You should **proactively tell the instructor this is an extension** rather than let them wonder why it's not in the report. If you want, you could add a section to Chapter 4/5 describing the `CalculatePlayerMatchPoints` algorithm before the defense — let me know if you need that section written.

**Action:** Field a full 11 starting players + pick a captain → the "▶ Run Matchday" button appears below the tactical pitch → click it.

**What to say:** "Scoring is based on real match stats (minutes played, goals weighted by position, assists, disciplinary cards, clean sheets, goalkeeper saves), doubled for the captain, running inside a transaction with a row lock to prevent double-clicking, then the squad gets locked."

**Expected:** Each player's points update, a "🔒 Squad locked" banner, a toast with the total score.

---

## 10. Global leaderboard (Redis Sorted Set)

**Action:** After running Matchday or the webhook demo, call `GET http://localhost:3000/api/leaderboard` (open this URL directly in another browser tab, or via Postman/curl) to show the instructor the returned JSON.

**What to say:** "The Redis ZSET allows top-50 and individual rank queries at O(log N) complexity, independent of PostgreSQL — matching OBJ-05/FR-07 in the report."

**Expected:** JSON containing `rank`, `userId`, `score` — the demo account's rank appears.

---

## 11. Session auto-expiry after closing the site for 30 minutes

No need to actually wait 30 minutes while recording — **explaining it verbally + showing the code** is convincing enough:

**What to say:** "When the tab is hidden or closed, `store.js` records the timestamp in localStorage; reopening it more than 30 minutes after that timestamp auto-logs-out and requires logging in again — but if the tab stays open and in continuous use, it's never interrupted mid-session, since the 30-minute clock only starts from closing, not from logging in." You can quickly open `store.js`'s "SESSION EXPIRY" section to show the instructor the code, or open DevTools → Application → Local Storage to show the `auth_closed_at` key appearing when switching tabs.

*(If you want to demo this QUICKLY for real instead of just explaining: temporarily change `SESSION_GRACE_MS` in `store.js` to `10 * 1000` (10 seconds) just for recording, then set it back to `30 * 60 * 1000` right after — don't forget to change it back before submitting.)*

---

## 12. Log out

**Action:** Click ⏏.

**What to say:** "Clears the token and all related state on the client, disconnects the Socket.io connection."

---

## 13. Questions the instructor might ask — quick answer suggestions

- **"How can you be sure there's no double-spend when 2 requests arrive at the same time?"** → Point to `tests/bnpl.concurrency.test.js`, run `npm test` in `fantasy-backend` live on screen: 3 test cases pass, including a test that reproduces the bug with the lock TURNED OFF to prove the lock is actually necessary (Chapter 6.2 of the report).
- **"Why isn't JWT the main session-control mechanism?"** → JWT is just a 1-day safety ceiling; the real policy (30 minutes after closing the site) lives on the client for UX reasons — not wanting to interrupt someone playing continuously. This is correctly updated in Section 4.7 of the report.
- **"Why doesn't Tactical Fit use `playerStats`?"** → Exactly as originally designed — the parameter is accepted but deliberately unused in the formula, see the "Note on fidelity" in Chapter 4.5.
- **"Is Run Matchday Algorithm 4?"** → Answer honestly: this is a feature added after the report was written, illustrating that the scoring system can be extended from event-by-event real-time to a full-gameweek summary.

---

## 14. Before the official recording — one more pass

- [ ] Ran `npx prisma migrate dev` with the 2 latest migrations.
- [ ] Ran `node scripts/seedGameweekStats.js` (required if you want to demo item 9).
- [ ] Redis is running (check the backend log).
- [ ] Using a NEW account registered right at the start of recording.
- [ ] Read item 9 — decided whether to demo "Run Matchday", and if so, prepared the "this is an extension beyond the original report" explanation.
- [ ] If planning to demo item 11 (30-minute session) by shortening the duration: remember to **set it back to `30 * 60 * 1000`** in `store.js` after recording.
