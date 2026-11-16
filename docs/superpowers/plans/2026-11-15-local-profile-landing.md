# Landing and local profiles implementation plan

**Goal:** Add the requested editorial entry, optional local profiles and saved work without changing domain algorithms.
**Architecture:** Keep the existing vanilla application and hash router. A bounded local-profile service owns password derivation and explicit saved records; a separate product surface owns landing/auth/saved-work UI. The existing domain adapter clears in-flight work and volatile input on identity changes.
**Tech stack:** Existing browser APIs, Web Crypto, native disclosures, existing Playwright/axe.
**Spec:** /Users/anirudhyadav/.codex/attachments/dbbe7dbd-bf42-48be-8d0b-080f1385f319/Pasted text.txt

## Constraints
All tools remain free and guest accessible. No deployment, framework, cloud credentials or data regeneration. Browser profiles are not server authorization; saved content is unencrypted and shared-origin scripts can access storage. Password verification uses versioned PBKDF2-HMAC-SHA256, 600000 iterations and independent random 16-byte salts. Reload locks a profile; intentionally saved work remains. No automatic guest import.

## Files and tasks
- [ ] Add local-profile.js with create/login/logout/list/save/remove; bounded parsing and record validation, revision invalidation and storage-event logout. Test wrong password, duplicate names, malformed records, quota failure, isolation and logout during derivation.
- [ ] Add product surface HTML/CSS/JS: landing previews/disclosure navigation, signup/login with labels and password toggle, saved work/profile actions. Use safe text rendering and current tokens. Test carousel/manual/pause/reduced motion and menus.
- [ ] Integrate root/login/signup/app aliases with existing router and preserve old links. Add domain clear/capture/restore adapter; restored work never executes or silently imports. Clear pending operations, results, identity-specific recovery keys and URL content on logout.
- [ ] Test existing domain suites plus new exact 1440x900/375x812 light/dark routes, keyboard, axe, profile A/B/guest and storage/multitab/inflight failures. Inspect loaded screenshots, exports and native VoiceOver where available.
- [ ] Update security/architecture/design and evidence with actual results and remaining limitations. Keep changes local.

## Review focus
Corrupt storage must not silently overwrite saved work. Late async operations must not restore prior-profile input. Legacy shared links keep their intended contents. New auth must not imply encryption or remote recovery. All controls remain reachable with enlarged text.
