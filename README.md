# WhisperShield

Calm your raids. WhisperShield is a lightweight browser extension that acts like a Twitch “raid firewall” so you and your (often half‑asleep) ASMR viewers don’t get blasted by sudden loud non‑ASMR raids. It blocks, closes, or redirects unsafe raids using your own lists and category rules.

---

## TL;DR
- Whitelist streamers: always allowed.
- Blacklist streamers: tab closes instantly on raid or manual visit.
- Safe categories (default: ASMR): allowed unless streamer is blacklisted.
- Everything else: close or redirect (you choose the behavior).
- Optional remote lists, logging, pause mode, and Twitch API assist.

---

## Core Features

| Feature | Description |
|---------|-------------|
| Raid Detection | Detects raids via URL (e.g. `?referrer=raid`) and internal tracking. |
| Instant Blacklist | Destination streamer on blacklist? Close immediately (no grace wait). |
| Safe Category Filter | Only allow if category is in `safeCategories` (default includes ASMR). |
| Whitelist | Always permit (category ignored). |
| Redirect Modes | close / redirectCustom (your URL) / whitelist (jump to a trusted streamer). |
| Grace Window | Short window (default 8000 ms) to collect category data. |
| Greylist (Passive) | Auto-add raiding source on blocked raids for review (optional). |
| Remote Lists | (Optional) Pull list text files you host & merge with local. |
| Logging & Badge | Local log + badge count of blocked/redirected raids. |
| Pause Mode | Temporarily suspend protection with optional auto-resume. |
| Update Ping | Checks (read-only) a remote text file for newer version notice. |
| Optional Twitch API | Faster category lookups using user implicit auth (no secret needed). |

---

## Quick Install (Developer Mode – Chrome / Edge / Brave)

1. Download or clone this repo.
2. (If present) open `background.js` and ensure any `clientSecret` is blank.
3. Go to: chrome://extensions
4. Turn on “Developer mode” (top right).
5. Click “Load unpacked” → select the project folder (where `manifest.json` lives).
6. Extension appears; pin it if you like. Open its options page to configure lists.

That’s it.

> Firefox: Go to `about:debugging` → “This Firefox” → “Load Temporary Add-on” → select `manifest.json` (temporary until restart).

---

## Minimal Setup (Recommended Defaults)

Open the options/settings (or JSON if you’re editing directly):

```jsonc
{
  "safeCategories": ["ASMR"],
  "whitelist": [],
  "blacklistStreamers": [],
  "redirectBehavior": "close", // or "redirectCustom" or "whitelist"
  "customRedirectUrl": "",
  "graceWindowMs": 8000,
  "autoGreylist": true,
  "inferRaidFromUrl": true,
  "oauth": {
    "mode": "none",   // none | implicit
    "clientId": "",
    "accessToken": ""
  }
}
```

Add a trusted ASMR channel to `whitelist` and any “never want” channels to `blacklistStreamers`.

---

## Optional: Faster Category Detection (Implicit OAuth – No Secret)

Only if you want to speed up category resolution (otherwise it just waits for Twitch DOM).

1. Set `oauth.mode` to `implicit`.
2. Put your Twitch **Client ID** (NOT the one previously in any code – use your own).
3. When prompted, authorize once. A token is stored locally; no secret required.
4. Done. (If token expires, it will re‑prompt.)

No client secret is ever needed for implicit user flow. Leave `clientSecret` blank.

---

## IMPORTANT: Do Not Commit Secrets

Never commit a Twitch Client Secret to this repository. If you ever did:
1. Reset it in the Twitch Developer Console.
2. Remove it from all code.
3. Rewrite git history to purge (see “Secret Removal” below).
4. Force push.

### Secret Removal (If You Slipped Once)

```bash
pip install git-filter-repo
git filter-repo --replace-text <(cat <<'EOF'
YOUR_OLD_CLIENT_ID==REDACTED_CLIENT_ID
YOUR_OLD_CLIENT_SECRET==REDACTED_CLIENT_SECRET
EOF
)
git push --force origin main
```

Then verify via GitHub code search.

---

## Event Flow Examples

Blacklisted raid:
```
raid_session_started → raid_inferred_from_url → raid_blocked_blacklist_immediate → tab_closed
```

Unsafe non‑blacklisted raid (close mode):
```
raid_session_started → category_resolved_unsafe → raid_blocked_unsafe → tab_closed
```

Safe (ASMR) raid:
```
raid_session_started → category_resolved_safe → raid_safe_finalized
```

---

## Remote Lists (Optional)

Point to raw text files:
```
# comments allowed
streamerone
streamertwo
```
Enable any subset (whitelist / blacklist / greylist). Lists are fetched, normalized lowercase, merged with local.

---

## Common Tweaks

| Goal | What to Change |
|------|----------------|
| Add more calm categories | Append to `safeCategories`. Exact Twitch category names. |
| Always redirect instead of close | Set `redirectBehavior` to `whitelist` (needs entries) or `redirectCustom`. |
| Stop auto greylist logging | Set `autoGreylist` to false. |
| More aggressive blocking | Shorten `graceWindowMs` or (future tweak) treat unknown as unsafe. |
| Debug | Ensure `debugLogging` (if present) is true. |

---

## Contributing

1. Fork.
2. Create a feature branch.
3. Make minimal, self‑contained changes.
4. Update README if behavior changes.
5. Open a PR with: purpose, summary of changes, test steps.

Coding style preference: small pure helpers, consistent log event names, no unnecessary dependencies.

---

## Roadmap Ideas (Open to PRs)

- Instant mute on raid until safe verified.
- “Sleep mode” (treat all non‑whitelist as unsafe during set hours).
- Per‑streamer custom actions.
- Export/import lists.
- Auto‑rotate between whitelist channels on redirect.

---

## FAQ

**Do I need any Twitch auth?**  
No. Implicit mode just speeds category detection.

**Why did an unknown category pass through?**  
Current logic finalizes safe after grace if still unknown. You can change logic to block unknown (simple code tweak).

**Does this filter chat content?**  
No—focus is raid navigation safety.

**Any data sent to third parties?**  
Only optional Twitch API requests (standard Helix endpoints). Lists/logs stay local unless you configure remote URLs you control.

---

## License

(Choose one—MIT suggested; add a LICENSE file if desired.)

```
MIT License © 2025 Codexual
```

---

## Credits

Created & maintained by **Codexual**.

Enjoy calmer raids. If you want the “treat unknown as unsafe” or “auto-mute on raid” patch, open an issue.
