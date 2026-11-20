const {test}=require('node:test'),assert=require('node:assert/strict');
test('Friends state isolates accounts, ignores a late prior-user response, and clears on logout',async()=>{
 const original=global.fetch,requests=[];let release;
 global.fetch=async(url,options)=>{requests.push({url,options});if(options.signal&&!release)return await new Promise(resolve=>{release=resolve;});return{ok:true,json:async()=>({friends:[{id:2,name:'Friend',steam_id:'2'}]})};};
 try{
  const {friendsStore}=await import('../frontend/features/account/state/friends.mjs');const first=friendsStore.sync('first');await Promise.resolve();
  await friendsStore.sync('second');assert.equal(friendsStore.getSnapshot().username,'second');assert.equal(friendsStore.getSnapshot().friends[0].id,2);
  release({ok:true,json:async()=>({friends:[{id:99,name:'Private first-user friend'}]})});await first;assert.equal(friendsStore.getSnapshot().friends[0].id,2);
  await friendsStore.set({id:3},true);assert.deepEqual(JSON.parse(requests.at(-1).options.body),{player_id:3,friend:true});assert.equal(requests.at(-1).options.credentials,'same-origin');
  await friendsStore.sync(null);assert.deepEqual(friendsStore.getSnapshot().friends,[]);assert.equal(friendsStore.getSnapshot().username,null);await assert.rejects(friendsStore.set({id:3},true),/Log in/);
 }finally{global.fetch=original;}
});
