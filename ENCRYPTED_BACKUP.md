# Encrypted portable work

Use Encrypted backup in the workspace. Save work explicitly before export. The file contains selected saved records, profile display name and schema metadata; no login password/verifier, active cloud token or decryption key is exported. Warehouse can explicitly include the current private dataset; that dataset is restored into memory and must be exported again before closing if needed.

PBKDF2-SHA256 uses a fresh 16-byte salt and 600,000 iterations; AES-GCM256 uses a fresh random 12-byte IV and authenticates app/version/algorithm metadata. The envelope is limited to 5 MiB, plaintext to 3 MiB, and nested structure/KDF parameters are bounded before use. The crypto API is Web Crypto. See [AES-GCM parameters](https://developer.mozilla.org/en-US/docs/Web/API/AesGcmParams) and [OWASP password storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). No security certification is claimed.

Choose a separate 12–256-character backup passphrase. A lost passphrase cannot be recovered. Existing browser-local saved records remain unencrypted; file encryption does not change that boundary.

Restore decrypts and validates in staging, displays entry names and dataset identity, then requires new-profile or merge confirmation. New profiles use a newly chosen local password; active sessions are never restored. Merge never silently overwrites entries or evicts work. Quota/cancellation tests preserve existing records. Restored queries never execute automatically.

Verified fresh-context browser flow: encrypted download; wrong-pass rejection; exact Unicode restore to a new profile; logout and login. Additional tests cover tampering, app mismatch, invalid iterations/encoding, structure limits and storage rollback. Real mobile hardware and password-manager interoperability need separate validation.
