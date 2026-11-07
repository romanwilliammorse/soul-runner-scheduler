import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {handleAPI} from '../lib/phase-api';
import {hashSecret,verifySecret,validateSlots,validTimezone} from '../lib/security';
class Statement{
 args:any[]=[];
 constructor(private db:DatabaseSync,private sql:string){}
 bind(...args:any[]){const s=new Statement(this.db,this.sql);s.args=args;return s;}
 async first(){return this.db.prepare(this.sql).get(...this.args)||null;}
 async all(){return {results:this.db.prepare(this.sql).all(...this.args)};}
 async run(){const r=this.db.prepare(this.sql).run(...this.args);return {meta:{changes:Number(r.changes)}};}
}
function fixture(origin='https://league.test',browserOrigin=origin){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')))sql.exec(readFileSync(`drizzle/${f}`,'utf8'));
 const adapter={prepare:(s:string)=>new Statement(sql,s),batch:async(statements:Statement[])=>{sql.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 const env={DB:adapter as unknown as D1Database,LEAGUE_ADMIN_EMAIL:'admin@example.test'};
 const client=(admin=false)=>{const cookies=new Map<string,string>();return {cookies,async req(path:string,body?:unknown,extra:Record<string,string>={}){const headers:Record<string,string>={cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join(';'),'cf-connecting-ip':'127.0.0.1',...extra};if(body!==undefined){headers.Origin=browserOrigin;headers['Content-Type']='application/json';}if(admin)headers['oai-authenticated-user-email']='admin@example.test';const response=await handleAPI(new Request(`${origin}/api/${path}`,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body)}),env);for(const cookie of response.headers.getSetCookie()){const [key,value]=cookie.split(';')[0].split('=');if(value)cookies.set(key,value);else cookies.delete(key);}return {status:response.status,body:await response.json() as any,headers:response.headers};}};};
 return {sql,client,env};
}
const registration={name:'Test Team',division:'Main league',ownerName:'Owner',ownerDiscord:'owner.test',ownerPassword:'private-owner-password',teamPassword:'shared-team-password',ownerPIN:'123456',players:[{name:'Alex',discord:'alex.test'},{name:'Jordan',discord:'jordan.test'}]};
test('branded origin supports login, host-only cookies, saved hours and reload without weakening CSRF',async()=>{
 const upstream='https://soul-runner-pc-scheduler.romanwilliammorse.chatgpt.site',brand='https://soulrunnerhoops.vercel.app';
 const f=fixture(upstream,brand),owner=f.client(true),p=f.client();
 assert.equal((await owner.req('setup',{password:'league-password-test'})).status,200);
 const created=await owner.req('register',registration);assert.equal(created.status,201);const id=created.body.id;
 assert.equal((await p.req(`team/${id}/login`,{password:registration.teamPassword})).status,200);
 const member=(await p.req(`team/${id}`)).body.players.find((p:any)=>p.name==='Alex');
 const identified=await p.req(`team/${id}/identify`,{memberId:member.id,pin:'234567',confirmPIN:'234567'});assert.equal(identified.status,200);
 for(const cookie of identified.headers.getSetCookie()){assert.ok(!cookie.toLowerCase().includes('domain='));assert.ok(cookie.includes('HttpOnly'));assert.ok(cookie.includes('SameSite=Strict'));assert.ok(cookie.includes('Secure'));}
 assert.equal((await p.req(`team/${id}/availability`,{slots:[42,43],timezone:'America/Chicago',version:0})).status,200);
 assert.deepEqual((await p.req(`team/${id}`)).body.self.slots,[42,43]);
 assert.equal((await p.req(`team/${id}/roster`,{action:'add',name:'Forbidden',discord:'no'})).status,403);
 for(const origin of ['https://evil.test','https://soulrunnerhoops.vercel.app.evil.test','http://soulrunnerhoops.vercel.app','null','']){
  const headers={'Content-Type':'application/json',Origin:origin,'x-forwarded-host':'soulrunnerhoops.vercel.app'};
  const response=await handleAPI(new Request(upstream+'/api/logout',{method:'POST',headers,body:'{}'}),f.env);assert.equal(response.status,403,origin);
 }
 assert.equal((await p.req('logout',{scope:'member'})).status,200);assert.equal((await p.req(`team/${id}`)).body.self,null);f.sql.close();
});
test('player hub: private chat, verified sender, retry deduplication, pagination and owner-managed schedule',async()=>{
 const f=await registered(),p=f.client(),stranger=f.client();const root=`team/${f.id}`;
 assert.equal((await stranger.req(`${root}/messages`)).status,401);
 assert.equal((await stranger.req(`${root}/games`)).status,401);
 await p.req(`${root}/login`,{password:registration.teamPassword});
 assert.equal((await p.req(`${root}/messages`)).status,401);
 const player=(await p.req(root)).body.players.find((x:any)=>x.name==='Alex');
 await p.req(`${root}/identify`,{memberId:player.id,pin:'234567',confirmPIN:'234567'});
 const msg={message:'Meet in the locker room <script>alert(1)</script>',clientId:'retry-message-123',memberId:'spoof',name:'spoof'};
 assert.equal((await p.req(`${root}/messages`,msg)).status,200);
 assert.equal((await p.req(`${root}/messages`,msg)).status,200);
 const messages=(await f.owner.req(`${root}/messages`)).body.messages;
 assert.equal(messages.length,1);assert.equal(messages[0].name,'Alex');assert.equal(messages[0].member_id,player.id);assert.equal(messages[0].body,msg.message);
 assert.equal((await p.req(`${root}/messages`,{message:' ',clientId:'blank-message'})).status,400);
 assert.equal((await p.req(`${root}/messages`,{message:'a'.repeat(2001),clientId:'long-message'})).status,400);
 assert.equal((await p.req(`${root}/messages?before=invalid`)).status,400);
 const game={action:'add',gameId:'game-retry-123',opponent:'Chicago Flight',startsAt:new Date(Date.now()+86400000).toISOString()};
 assert.equal((await p.req(`${root}/games`,game)).status,403);
 assert.equal((await f.owner.req(`${root}/games`,game)).status,200);
 assert.equal((await f.owner.req(`${root}/games`,game)).status,200);
 let games=(await p.req(`${root}/games`)).body.games;assert.equal(games.length,1);assert.equal(games[0].starts_at,game.startsAt);assert.equal(games[0].opponent,game.opponent);
 assert.equal((await f.owner.req(`${root}/games`,{...game,startsAt:'bad'})).status,400);
 assert.equal((await f.owner.req(`${root}/games`,{...game,startsAt:new Date(0).toISOString()})).status,400);
 const other=f.client();await other.req('league/login',{password:'league-password-test'});const second=await other.req('register',{...registration,name:'Other team'});
 assert.equal((await other.req(`${root}/messages`)).status,401);assert.equal((await other.req(`${root}/games`)).status,401);
 await other.req(`team/${second.body.id}/games`,{action:'remove',gameId:game.gameId});assert.equal((await p.req(`${root}/games`)).body.games.length,1);
 for(let i=0;i<105;i++)f.sql.prepare('INSERT INTO team_messages(team_id,member_id,client_id,body,created_at) VALUES(?,?,?,?,?)').run(f.id,player.id,`fixture-${i}`,`message ${i}`,new Date().toISOString());
 const latest=(await p.req(`${root}/messages`)).body;assert.equal(latest.messages.length,100);assert.equal(latest.hasMore,true);
 const earlier=(await p.req(`${root}/messages?before=${latest.messages[0].id}`)).body;assert.equal(earlier.messages.length,6);assert.equal(earlier.hasMore,false);assert.ok(earlier.messages.at(-1).id<latest.messages[0].id);
 await f.owner.req(`${root}/games`,{action:'remove',gameId:game.gameId});assert.equal((await p.req(`${root}/games`)).body.games.length,0);
 await f.owner.req(`${root}/roster`,{action:'remove',memberId:player.id});assert.equal((await p.req(`${root}/messages`)).status,401);assert.equal((await p.req(`${root}/messages`,msg)).status,401);
 f.sql.close();
});
async function registered(){const f=fixture(),owner=f.client(true);assert.equal((await owner.req('setup',{password:'league-password-test'})).status,200);const r=await owner.req('register',registration);assert.equal(r.status,201);return {...f,owner,id:r.body.id as string};}
test('correct logins do not exhaust the shared-network failure budget',async()=>{
 const f=await registered(),p=f.client();
 for(let attempt=0;attempt<16;attempt++){
  assert.equal((await p.req('league/login',{password:'league-password-test'})).status,200);
  assert.equal((await p.req(`team/${f.id}/login`,{password:registration.teamPassword})).status,200);
  assert.equal((await p.req(`team/${f.id}/owner-login`,{password:registration.ownerPassword})).status,200);
 }
 for(let attempt=0;attempt<10;attempt++)assert.equal((await p.req(`team/${f.id}/login`,{password:'bad'})).status,401);
 assert.equal((await p.req(`team/${f.id}/login`,{password:'bad'})).status,429);f.sql.close();
});
test('75 players across 15 teams retain isolated availability over 10 revisions',async()=>{
 const f=fixture(),admin=f.client(true);await admin.req('setup',{password:'league-password-test'});
 const teams:Array<{id:string;owner:ReturnType<typeof f.client>;players:Array<{client:ReturnType<typeof f.client>;id:string;slots:number[]}>}>=[];
 for(let team=0;team<15;team++){
  const owner=f.client();await owner.req('league/login',{password:'league-password-test'});
  const r=await owner.req('register',{...registration,name:`Scale Team ${team}`,players:Array.from({length:4},(_,i)=>({name:`Player ${i}`,discord:`player${i}.test`}))});assert.equal(r.status,201);
  const roster=(await owner.req(`team/${r.body.id}`)).body.players;
  const players=[{client:owner,id:roster.find((p:any)=>p.is_owner).id,slots:[] as number[]}];
  for(const player of roster.filter((p:any)=>!p.is_owner)){
   const member=f.client();await member.req(`team/${r.body.id}/login`,{password:registration.teamPassword});
   assert.equal((await member.req(`team/${r.body.id}/identify`,{memberId:player.id,pin:'123456',confirmPIN:'123456'})).status,200);players.push({client:member,id:player.id,slots:[]});
  }
  teams.push({id:r.body.id,owner,players});
 }
 for(let revision=0;revision<10;revision++)for(let t=0;t<teams.length;t++)for(let p=0;p<5;p++){
  const entry=teams[t].players[p];entry.slots=[(t*5+p+revision)%168];
  assert.equal((await entry.client.req(`team/${teams[t].id}/availability`,{slots:entry.slots,timezone:'America/Chicago',version:revision})).status,200);
 }
 for(let t=0;t<teams.length;t++){
  const result=await teams[t].owner.req(`team/${teams[t].id}/availability`);assert.equal(result.body.players.length,5);
  for(const entry of teams[t].players){const self=(await entry.client.req(`team/${teams[t].id}`)).body.self;assert.equal(self.version,10);assert.deepEqual(self.slots,entry.slots);assert.deepEqual(result.body.players.find((p:any)=>p.id===entry.id).slots,entry.slots);}
  assert.equal((await teams[t].owner.req(`team/${teams[(t+1)%15].id}/availability`)).status,403);
 }
 assert.equal((f.sql.prepare('SELECT count(*) AS count FROM team_players').get() as any).count,75);f.sql.close();
});
test('team availability is owner-only and excludes removed players and secrets',async()=>{
 const f=await registered(),guest=f.client();
 assert.equal((await guest.req(`team/${f.id}/availability`)).status,403);
 await guest.req(`team/${f.id}/login`,{password:registration.teamPassword});
 assert.equal((await guest.req(`team/${f.id}/availability`)).status,403);
 await f.owner.req(`team/${f.id}/availability`,{slots:[],timezone:'UTC',version:0});
 let r=await f.owner.req(`team/${f.id}/availability`);assert.equal(r.status,200);assert.equal(r.body.players.length,3);assert.deepEqual(r.body.players[0].slots,[]);assert.equal(r.body.players[1].slots,null);
 assert.deepEqual(Object.keys(r.body.players[0]).sort(),['id','name','slots','timezone']);
 await f.owner.req(`team/${f.id}/roster`,{action:'remove',memberId:r.body.players[1].id});
 r=await f.owner.req(`team/${f.id}/availability`);assert.equal(r.body.players.length,2);f.sql.close();
});
test('setup is admin-only; league password gates registration',async()=>{const f=fixture(),guest=f.client();assert.equal((await guest.req('setup',{password:'unauthorized-password'})).status,403);assert.equal((await guest.req('register',registration)).status,401);assert.equal((await guest.req('state')).body.configured,false);f.sql.close();});
test('registration persists owner as a player and hashes every credential',async()=>{const f=await registered();const r=await f.owner.req(`team/${f.id}`);assert.equal(r.body.owner,true);assert.equal(r.body.players.length,3);assert.equal(r.body.self.name,'Owner');assert.equal(r.body.self.slots,null);assert.equal(r.body.players.find((p:any)=>p.is_owner).pin_set,1);const team=f.sql.prepare('select * from registered_teams').get() as any;assert.notEqual(team.owner_hash,registration.ownerPassword);assert.notEqual(team.team_hash,registration.teamPassword);assert.equal(JSON.stringify(r.body).includes('pbkdf2'),false);f.sql.close();});
test('team link hides roster until shared password is entered; player must claim PIN',async()=>{const f=await registered(),p=f.client();assert.equal((await p.req(`team/${f.id}`)).body.players.length,0);assert.equal((await p.req(`team/${f.id}/login`,{password:'incorrect'})).status,401);assert.equal((await p.req(`team/${f.id}/login`,{password:registration.teamPassword})).status,200);const r=await p.req(`team/${f.id}`),alex=r.body.players.find((x:any)=>x.name==='Alex');assert.equal((await p.req(`team/${f.id}/identify`,{memberId:alex.id,pin:'678901',confirmPIN:'678901'})).status,200);const me=await p.req(`team/${f.id}`);assert.equal(me.body.self.name,'Alex');assert.equal(me.body.owner,false);assert.equal((await p.req(`team/${f.id}/roster`,{action:'add',name:'Intruder',discord:'bad'})).status,403);f.sql.close();});
test('wrong PIN cannot edit availability or replace an existing PIN',async()=>{const f=await registered(),p=f.client();await p.req(`team/${f.id}/login`,{password:registration.teamPassword});const owner=(await p.req(`team/${f.id}`)).body.players.find((x:any)=>x.is_owner);assert.equal((await p.req(`team/${f.id}/identify`,{memberId:owner.id,pin:'999999',confirmPIN:'999999'})).status,401);assert.equal((await p.req(`team/${f.id}/availability`,{slots:[1],timezone:'UTC',version:0})).status,401);f.sql.close();});
test('recurring Sunday-Saturday hours and IANA time zone persist; empty submission differs from missing',async()=>{const f=await registered();const r=await f.owner.req(`team/${f.id}/availability`,{slots:[0,17,167],timezone:'America/Los_Angeles',version:0});assert.equal(r.status,200);let me=(await f.owner.req(`team/${f.id}`)).body.self;assert.deepEqual(me.slots,[0,17,167]);assert.equal(me.timezone,'America/Los_Angeles');assert.equal(me.version,1);await f.owner.req(`team/${f.id}/availability`,{slots:[],timezone:'America/Los_Angeles',version:1});me=(await f.owner.req(`team/${f.id}`)).body.self;assert.deepEqual(me.slots,[]);assert.ok(me.savedAt);f.sql.close();});
test('stale concurrent save cannot overwrite newer availability',async()=>{const f=await registered();const results=await Promise.all([f.owner.req(`team/${f.id}/availability`,{slots:[1],timezone:'UTC',version:0}),f.owner.req(`team/${f.id}/availability`,{slots:[2],timezone:'UTC',version:0})]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);f.sql.close();});
test('duplicate team and roster names are rejected atomically',async()=>{const f=await registered();assert.equal((await f.owner.req('register',registration)).status,409);assert.equal((f.sql.prepare('select count(*) as n from registered_teams').get() as any).n,1);assert.equal((await f.owner.req(`team/${f.id}/roster`,{action:'add',name:'alex',discord:'other'})).status,409);f.sql.close();});
test('player from another team cannot access or mutate this roster',async()=>{const f=await registered(),second=f.client();await second.req('league/login',{password:'league-password-test'});const r=await second.req('register',{...registration,name:'Other team'});assert.equal(r.status,201);assert.equal((await second.req(`team/${f.id}`)).body.access,false);assert.equal((await second.req(`team/${f.id}/roster`,{action:'add',name:'Wrong team',discord:'wrong'})).status,403);f.sql.close();});
test('owner can reset PIN and revoke player access; removal is reversible',async()=>{const f=await registered(),p=f.client();await p.req(`team/${f.id}/login`,{password:registration.teamPassword});const alex=(await p.req(`team/${f.id}`)).body.players.find((x:any)=>x.name==='Alex');await p.req(`team/${f.id}/identify`,{memberId:alex.id,pin:'678901',confirmPIN:'678901'});await f.owner.req(`team/${f.id}/roster`,{action:'reset-pin',memberId:alex.id});assert.equal((await p.req(`team/${f.id}`)).body.self,null);await f.owner.req(`team/${f.id}/roster`,{action:'remove',memberId:alex.id});assert.equal((await p.req(`team/${f.id}`)).body.players.some((x:any)=>x.id===alex.id),false);await f.owner.req(`team/${f.id}/roster`,{action:'restore',memberId:alex.id});assert.equal((await p.req(`team/${f.id}`)).body.players.some((x:any)=>x.id===alex.id),true);f.sql.close();});
test('team-password rotation revokes team sessions without deleting saved hours',async()=>{const f=await registered(),p=f.client();await p.req(`team/${f.id}/login`,{password:registration.teamPassword});await f.owner.req(`team/${f.id}/availability`,{slots:[5],timezone:'UTC',version:0});assert.equal((await f.owner.req(`team/${f.id}/passwords`,{teamPassword:'new-team-password'})).status,200);assert.equal((await p.req(`team/${f.id}`)).body.access,false);assert.deepEqual((await f.owner.req(`team/${f.id}`)).body.self.slots,[5]);f.sql.close();});
test('CSRF protection rejects requests from another origin',async()=>{const f=fixture();const r=await handleAPI(new Request('https://league.test/api/setup',{method:'POST',headers:{Origin:'https://evil.test','Content-Type':'application/json','oai-authenticated-user-email':'admin@example.test'},body:JSON.stringify({password:'should-not-work'})}),f.env);assert.equal(r.status,403);f.sql.close();});
test('PIN guessing is rate limited server-side',async()=>{const f=await registered(),p=f.client();await p.req(`team/${f.id}/login`,{password:registration.teamPassword});const owner=(await p.req(`team/${f.id}`)).body.players.find((x:any)=>x.is_owner);for(let i=0;i<8;i++)assert.equal((await p.req(`team/${f.id}/identify`,{memberId:owner.id,pin:'999999'})).status,401);assert.equal((await p.req(`team/${f.id}/identify`,{memberId:owner.id,pin:'999999'})).status,429);f.sql.close();});
test('credential hashes are salted; slot/time zone validation rejects invalid input',async()=>{const a=await hashSecret('secret-value'),b=await hashSecret('secret-value');assert.notEqual(a,b);assert.equal(await verifySecret('secret-value',a),true);assert.equal(await verifySecret('wrong',a),false);for(const value of [[168],[-1],[1.5],[1,1],null])assert.throws(()=>validateSlots(value));assert.equal(validTimezone('America/New_York'),true);assert.equal(validTimezone('invalid/zone'),false);});
test('first PIN claim is atomic when two clients select the same unclaimed player',async()=>{const f=await registered(),one=f.client(),two=f.client();await one.req(`team/${f.id}/login`,{password:registration.teamPassword});await two.req(`team/${f.id}/login`,{password:registration.teamPassword});const p=(await one.req(`team/${f.id}`)).body.players.find((p:any)=>p.name==='Alex');const result=await Promise.all([one.req(`team/${f.id}/identify`,{memberId:p.id,pin:'111111',confirmPIN:'111111'}),two.req(`team/${f.id}/identify`,{memberId:p.id,pin:'222222',confirmPIN:'222222'})]);assert.equal(result.filter(r=>r.status===200).length,1);assert.ok([401,409].includes(result.find(r=>r.status!==200)!.status));f.sql.close();});
test('owner PIN grants personal availability but never roster-management rights',async()=>{const f=await registered(),p=f.client();await p.req(`team/${f.id}/login`,{password:registration.teamPassword});const owner=(await p.req(`team/${f.id}`)).body.players.find((x:any)=>x.is_owner);await p.req(`team/${f.id}/identify`,{memberId:owner.id,pin:registration.ownerPIN});assert.equal((await p.req(`team/${f.id}`)).body.owner,false);assert.equal((await p.req(`team/${f.id}/roster`,{action:'remove',memberId:owner.id})).status,403);assert.equal((await p.req(`team/${f.id}/availability`,{slots:[1],timezone:'UTC',version:0})).status,200);f.sql.close();});
test('sessions are HttpOnly, secure over HTTPS, and expire',async()=>{const f=await registered(),p=f.client();const r=await p.req(`team/${f.id}/owner-login`,{password:registration.ownerPassword});assert.ok(r.headers.getSetCookie().some(c=>c.includes('HttpOnly')&&c.includes('Secure')&&c.includes('SameSite=Strict')));f.sql.exec('UPDATE access_sessions SET expires=0');assert.equal((await p.req(`team/${f.id}`)).body.access,false);f.sql.close();});

