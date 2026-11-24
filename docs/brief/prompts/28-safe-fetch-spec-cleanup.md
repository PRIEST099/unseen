A few sections of `.kiro/specs/safe-fetch/design.md` still describe approaches that the amendment (prompt 26) rejected. An implementer would follow them. Fix every one of these to match decisions A, B and F, then grep again:

- **Line ~502 (flow diagram):** "Launch Chromium with --proxy-server=127.0.0.1:<port>". Change it to a per-audit proxy wired through `browser.newContext({ proxy: { server, bypass: '<-loopback>' } })`.
- **Lines ~1063–1131 (integration sketch):** `if (policy instanceof RestrictiveSafeFetchPolicy)`, "launching Chromium with --proxy-server", and "Re-launch context with proxy (or launch browser with --proxy-server initially)", plus the "exact integration point depends…" note. Replace all of it with the single decided integration: mode-based selection (`policy.mode !== 'permissive'`), proxy started per audit before `createContext`, passed as the context `proxy` option, and closed in the audit's `finally`.
- **Line ~1141:** the `'--disable-webrtc'` launch arg. Remove it (the flag does not exist). Use `--force-webrtc-ip-handling-policy=disable_non_proxied_udp`, `--webrtc-ip-handling-policy=disable_non_proxied_udp`, `--disable-quic` and `--disable-features=DnsOverHttps`.
- **Lines ~1193 and ~1242 (Test 6.2):** assertions about `--disable-webrtc`. Rewrite them to assert the real flags, plus a behavioural check where possible.

Done means: `grep -n -- "instanceof Restrictive\|--proxy-server\|--disable-webrtc" .kiro/specs/safe-fetch/*.md` returns only lines that explicitly say "do not use". Final message: the grep output.
