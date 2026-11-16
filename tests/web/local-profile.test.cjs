const test = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const create = require('../../docs/local-profile.js');
function environment(shared = new Map()) {
  const listeners = new Map();
  return { crypto: webcrypto, navigator: { locks: { request: async (_, fn) => fn() } },
    localStorage: { getItem: (k) => shared.get(k) ?? null, setItem: (k, v) => shared.set(k, v), removeItem: (k) => shared.delete(k) },
    addEventListener: (name, fn) => listeners.set(name, fn), listeners, shared };
}
test('profile derivation, isolation, exact save/restore and deletion', async () => {
  const env = environment(), api = create('test', env);
  const a = await api.signup('Alice', 'first long password');
  const registry = JSON.parse(env.shared.get('test:v1:profiles'));
  assert.equal(registry[0].iterations, 600000); assert.equal(registry[0].salt.length, 32);
  assert.ok(!JSON.stringify([...env.shared]).includes('first long password'));
  await api.save('query', { sql: 'SELECT title FROM issues LIMIT 2' });
  api.logout(); assert.throws(() => api.list(), /Log in/);
  await api.signup('Bobby', 'second long password'); assert.deepEqual(api.list(), []);
  api.logout(); await assert.rejects(api.login('Alice', 'incorrect password'), /incorrect/);
  await api.login('Alice', 'first long password'); assert.equal(api.current().id, a.id);
  assert.equal(api.list()[0].value.sql, 'SELECT title FROM issues LIMIT 2');
  await api.remove(api.list()[0].id); assert.deepEqual(api.list(), []);
  await assert.rejects(api.signup('ALICE', 'another long password'), /already exists/);
});
test('logout cancels derivation and saves; corrupt and blocked storage fail explicitly', async () => {
  const env = environment(), api = create('test', env);
  const pending = api.signup('Alice', 'first long password'); api.logout();
  await assert.rejects(pending, /cancelled/); assert.equal(api.current(), null);
  await api.signup('Alice', 'first long password');
  env.shared.set(`test:v1:${api.current().id}:work`, '{'); assert.throws(() => api.list(), /damaged/);
  await api.clear(); assert.deepEqual(api.list(), []);
  env.localStorage.setItem = () => { throw Error('quota'); };
  await assert.rejects(api.save('query', { sql: 'SELECT 1' }), /full/);
});
test('storage logout event clears matching identity, reload starts locked', async () => {
  const env = environment(), api = create('test', env);
  const user = await api.signup('Alice', 'first long password');
  assert.equal(create('test', environment(env.shared)).current(), null);
  env.listeners.get('storage')({ key: 'test:v1:logout', newValue: JSON.stringify({ id: user.id }) });
  assert.equal(api.current(), null);
});

test('remote logout invalidates an in-flight login before it can unlock a profile', async () => {
 const env=environment(), api=create('test',env);
 const user=await api.signup('Alice','first long password'); api.logout();
 const pending=api.login('Alice','first long password');
 env.listeners.get('storage')({key:'test:v1:logout',newValue:JSON.stringify({id:user.id})});
 await assert.rejects(pending,/cancelled/); assert.equal(api.current(),null);
});

test('unrelated profile creation preserves current work session', async () => {
 const env=environment(), api=create('test',env);
 const user=await api.signup('Alice','first long password');
 const other=create('test',environment(env.shared));
 await other.signup('Bobby','second long password');
 env.listeners.get('storage')({key:'test:v1:profiles',newValue:env.shared.get('test:v1:profiles')});
 assert.equal(api.current()?.id,user.id);
 env.listeners.get('storage')({key:null}); assert.equal(api.current(),null);
});
test('portable restore stages new profile and merges atomically with quota rollback', async()=>{
 const env=environment(),api=create('test',env);const entries=[{name:'保存',value:{version:1,title:'Résumé',body:'VoiceOver “保存”'}}];
 await api.restoreEntries(entries,{newName:'Restored',password:'new local password'});assert.equal(api.list()[0].value.body,'VoiceOver “保存”');const before=JSON.stringify([...env.shared]);const native=env.localStorage.setItem;env.localStorage.setItem=(k,v)=>{if(k==='test:v1:profiles')throw Error('quota');native(k,v);};
 await assert.rejects(api.restoreEntries(entries,{newName:'FailedRestore',password:'new local password'}),/full/);assert.equal(JSON.stringify([...env.shared]),before);assert.equal(api.current().name,'Restored');env.localStorage.setItem=native;
 await assert.rejects(api.restoreEntries(entries,{newName:'',password:'new local password'}),/Use 3/);assert.equal(api.list().length,1);await api.restoreEntries(entries);assert.equal(api.list().length,2);await assert.rejects(api.restoreEntries(Array.from({length:9},()=>entries[0])),/exceeds/);assert.equal(api.list().length,2);
 api.logout();await api.login('Restored','new local password');assert.equal(api.list().length,2);
});

test('cancelled restore derivation and queued merge leave existing work unchanged',async()=>{const env=environment(),api=create('test',env);await api.signup('Alice','existing local password');const before=JSON.stringify([...env.shared]);let cancelled=false;const entries=[{name:'new',value:{version:1,title:'new',body:'new'}}];const pending=api.restoreEntries(entries,{newName:'Cancelled',password:'restored password',isCurrent:()=>!cancelled});cancelled=true;await assert.rejects(pending,/cancelled/);assert.equal(JSON.stringify([...env.shared]),before);let release;env.navigator.locks.request=async(_,fn)=>{await new Promise(r=>release=r);return fn();};cancelled=false;const merge=api.restoreEntries(entries,{isCurrent:()=>!cancelled});cancelled=true;release();await assert.rejects(merge,/cancelled/);assert.equal(JSON.stringify([...env.shared]),before);});
