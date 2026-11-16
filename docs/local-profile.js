'use strict';
// Browser-local organization only: hashes do not encrypt saved work or authorize a server.
((root) => {
  function createProfiles(app, env = root) {
    const prefix = app === 'cuereport' ? 'cuereport_profiles_v1:' : app === 'issue-warehouse' ? 'issue_warehouse_profiles_v1:' : `${app}:v1:`, registryKey = prefix + 'profiles';
    const iterations = 600000, maxBytes = 262144;
    let identity = null, revision = 0;
    const listeners = new Set();
    const pendingLogins = new Set();
    const bytes = (text) => new TextEncoder().encode(text).byteLength;
    const hex = (array) => Array.from(array, (v) => v.toString(16).padStart(2, '0')).join('');
    const unhex = (text) => Uint8Array.from(text.match(/../g), (v) => parseInt(v, 16));
    const nameOf = (name) => {
      if (typeof name !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_. -]{2,39}$/.test(name.trim())) throw Error('Use 3–40 letters, numbers, spaces, dots, underscores or hyphens.');
      return name.trim();
    };
    function read(key, fallback) {
      let value;
      try { value = env.localStorage.getItem(key); } catch { throw Error('Browser storage is unavailable. Continue as a guest.'); }
      if (value === null) return fallback;
      if (bytes(value) > maxBytes) throw Error('Saved data exceeds its limit. Delete the saved data to reset it.');
      try { return JSON.parse(value); } catch { throw Error('Saved data is damaged. Delete the saved data to reset it.'); }
    }
    function write(key, value) {
      const encoded = JSON.stringify(value);
      if (bytes(encoded) > maxBytes) throw Error('Saved work exceeds 256 KiB. Remove an older entry or shorten the content.');
      try { env.localStorage.setItem(key, encoded); } catch { throw Error('Browser storage is unavailable or full. Export your work before closing.'); }
    }
    function registry() {
      const entries = read(registryKey, []);
      if (!Array.isArray(entries) || entries.length > 12 || entries.some((p) => !p || p.version !== 1 || p.algorithm !== 'PBKDF2-SHA256' || p.iterations !== iterations || typeof p.name !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_. -]{2,39}$/.test(p.name) || !/^[a-f0-9-]{36}$/.test(p.id) || !/^[a-f0-9]{32}$/.test(p.salt) || !/^[a-f0-9]{64}$/.test(p.hash)) || new Set(entries.map((p) => p.name.toLowerCase())).size !== entries.length || new Set(entries.map((p) => p.id)).size !== entries.length) throw Error('Local profile records are damaged or unsupported. Use browser site-data settings to reset them; export saved work first where possible.');
      return entries;
    }
    function signal(next) {
      revision++; identity = next;
      for (const listener of listeners) listener(identity);
    }
    async function derive(password, salt) {
      if (typeof password !== 'string' || password.length < 12 || password.length > 256) throw Error('Use a password of 12–256 characters.');
      if (!env.crypto?.subtle) throw Error('Web Crypto is unavailable. Open HTTPS or localhost, or continue as a guest.');
      const key = await env.crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
      return hex(new Uint8Array(await env.crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unhex(salt), iterations }, key, 256)));
    }
    async function locked(fn) {
      if (!env.navigator?.locks) throw Error('This browser cannot coordinate local profile writes. Continue as a guest or use a browser with Web Locks.');
      return env.navigator.locks.request(prefix + 'write', fn);
    }
    const savedKey = () => {
      if (!identity) throw Error('Log in to a local profile to save work. Guest work is not imported automatically.');
      return prefix + identity.id + ':work';
    };
    function list() {
      const records = read(savedKey(), []);
      if (!Array.isArray(records) || records.length > 10 || records.some((r) => !r || typeof r.id !== 'string' || !/^[a-f0-9-]{36}$/.test(r.id) || typeof r.name !== 'string' || r.name.length > 80 || typeof r.updated !== 'string' || !Number.isFinite(Date.parse(r.updated)) || !r.value || typeof r.value !== 'object' || Array.isArray(r.value))) throw Error('Saved work is damaged or unsupported. Delete saved work to reset it.');
      return records;
    }
    const api = {
      current: () => identity && { ...identity }, revision: () => revision,
      subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
      async signup(name, password) {
        name = nameOf(name); const ticket = revision;
        if (!env.crypto?.subtle) throw Error('Web Crypto is unavailable. Continue as a guest.');
        const salt = hex(env.crypto.getRandomValues(new Uint8Array(16)));
        const hash = await derive(password, salt);
        return locked(() => {
          if (revision !== ticket) throw Error('Profile request cancelled. Try again.');
          const entries = registry();
          if (entries.some((p) => p.name.toLowerCase() === name.toLowerCase())) throw Error('This profile name already exists on this browser. Log in or choose another name.');
          if (entries.length === 12) throw Error('This browser has 12 profiles. Use an existing profile.');
          const profile = { id: env.crypto.randomUUID(), name, salt, hash, version: 1, algorithm: 'PBKDF2-SHA256', iterations };
          write(registryKey, [...entries, profile]); signal({ id: profile.id, name }); return api.current();
        });
      },
      async login(name, password) {
        name = nameOf(name); const ticket = revision;
        const profile = registry().find((p) => p.name.toLowerCase() === name.toLowerCase());
        if (!profile) throw Error('Profile name or password is incorrect. Profiles exist only on this browser.');
        pendingLogins.add(profile.id);
        let hash;
        try { hash = await derive(password, profile.salt); } finally { pendingLogins.delete(profile.id); }
        if (revision !== ticket) throw Error('Profile request cancelled. Try again.');
        let difference = 0; for (let i = 0; i < hash.length; i++) difference |= hash.charCodeAt(i) ^ profile.hash.charCodeAt(i);
        if (difference) throw Error('Profile name or password is incorrect.');
        if (!registry().some((p) => p.id === profile.id && p.hash === profile.hash)) throw Error('The profile changed. Try again.');
        signal({ id: profile.id, name: profile.name }); return api.current();
      },
      cancel() { revision++; },
      logout() {
        const id = identity?.id; signal(null);
        try { env.localStorage.setItem(prefix + 'logout', JSON.stringify({ id, nonce: env.crypto.randomUUID() })); } catch { /* Current tab is still cleared when persistent storage is unavailable. */ }
      },
      list,
      async restoreEntries(records, options={}) {
        if(!Array.isArray(records)||records.length>10)throw Error('Backup supports at most ten saved entries.');
        const clean=records.map(r=>{if(!r||typeof r.name!=='string'||!r.name.trim()||r.name.length>80||!r.value||typeof r.value!=='object'||Array.isArray(r.value)||bytes(JSON.stringify(r.value))>131072)throw Error('Invalid saved entry.');return {id:env.crypto.randomUUID(),name:r.name.trim(),updated:new Date().toISOString(),value:JSON.parse(JSON.stringify(r.value))};});
        if(Object.hasOwn(options,'newName')){const name=nameOf(options.newName),ticket=revision,salt=hex(env.crypto.getRandomValues(new Uint8Array(16))),hash=await derive(options.password,salt);
          return locked(()=>{if(ticket!==revision||options.isCurrent?.()===false)throw Error('Restore cancelled because the profile or request changed.');const entries=registry();if(entries.length>=12||entries.some(p=>p.name.toLowerCase()===name.toLowerCase()))throw Error('Choose an unused profile name; maximum twelve profiles.');const profile={id:env.crypto.randomUUID(),name,salt,hash,version:1,algorithm:'PBKDF2-SHA256',iterations};const key=prefix+profile.id+':work';write(key,clean);try{write(registryKey,[...entries,profile]);}catch(error){try{env.localStorage.removeItem(key);}catch{}throw error;}signal({id:profile.id,name});return api.current();});
        }
        const key=savedKey(),ticket=revision;return locked(()=>{if(ticket!==revision||key!==savedKey()||options.isCurrent?.()===false)throw Error('Restore cancelled because the profile or request changed.');const existing=list();if(existing.length+clean.length>10)throw Error('Merge exceeds ten entries. Nothing changed.');write(key,[...existing,...clean]);return api.current();});
      },
      async save(name, value) {
        if (typeof name !== 'string' || !name.trim() || name.length > 80) throw Error('Name saved work with 1–80 characters.');
        const key = savedKey(), ticket = revision;
        // Snapshot before waiting for the lock; later edits must not silently alter a save.
        const encoded = JSON.stringify(value);
        if (bytes(encoded) > 131072) throw Error('This entry exceeds 128 KiB. Shorten it or export instead.');
        const snapshot = JSON.parse(encoded);
        return locked(() => {
          if (ticket !== revision || key !== savedKey()) throw Error('Save cancelled because the profile changed.');
          const records = list();
          if (records.length >= 10) throw Error('Ten entries are already saved. Delete an entry before saving another.');
          const record = { id: env.crypto.randomUUID(), name: name.trim(), updated: new Date().toISOString(), value: snapshot };
          write(key, [...records, record]); return record;
        });
      },
      async remove(id) { const key = savedKey(), ticket = revision; return locked(() => { if (ticket !== revision) throw Error('Profile changed.'); write(key, list().filter((r) => r.id !== id)); }); },
      async clear() { const key = savedKey(), ticket = revision; return locked(() => { if (ticket !== revision) throw Error('Profile changed.'); try { env.localStorage.removeItem(key); } catch { throw Error('Saved work could not be deleted. Browser storage is blocked.'); } }); },
    };
    env.addEventListener?.('storage', (event) => {
      if (event.key === null) { if (identity || pendingLogins.size) signal(null); return; }
      if (event.key === registryKey && (identity || pendingLogins.size)) {
        try {
          const ids = new Set(registry().map((profile) => profile.id));
          if ((identity && !ids.has(identity.id)) || [...pendingLogins].some((id) => !ids.has(id))) signal(null);
        } catch { signal(null); }
        return;
      }
      if (event.key === prefix + 'logout') {
        try { const id = JSON.parse(event.newValue)?.id; if (id && (id === identity?.id || pendingLogins.has(id))) signal(null); } catch { /* Invalid unrelated event is ignored. */ }
      }
    });
    return api;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = createProfiles;
  else root.createLocalProfiles = createProfiles;
})(globalThis);
