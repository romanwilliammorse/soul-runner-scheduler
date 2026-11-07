import { digest, hashSecret, randomToken, verifySecret, validTimezone, validateSlots } from './security';
type Env={DB?:D1Database;LEAGUE_ADMIN_EMAIL?:string};
type Session={kind:string;team_id:string|null;member_id:string|null};
type Team={id:string;name:string;division:string;owner_hash:string;team_hash:string};
type Player={id:string;team_id:string;name:string;discord:string;is_owner:number;pin_hash:string|null;active:number;slots:string|null;timezone:string|null;saved_at:string|null;version:number};
class APIError extends Error{constructor(message:string,public status=400){super(message);}}
function text(value:unknown,label:string,max=100){if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw new APIError(`${label} is required (up to ${max} characters).`);return value.trim();}
function password(value:unknown,label='Password',min=10){if(typeof value!=='string'||value.length<min||value.length>128)throw new APIError(`${label} must be ${min}–128 characters.`);return value;}
function pin(value:unknown){if(typeof value!=='string'||!/^\d{6}$/.test(value))throw new APIError('Enter a six-digit PIN.');return value;}
const cookieNames={league:'sr_league',owner:'sr_owner',team:'sr_team',member:'sr_member'};
const age={league:43200,owner:604800,team:86400,member:604800};
type Kind=keyof typeof cookieNames;
export async function handleAPI(request:Request,env:Env){
 const headers=new Headers({'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
 try{
  if(!env.DB)throw new APIError('Storage is not ready. Please try again shortly.',503);
  const db=env.DB,url=new URL(request.url),parts=url.pathname.replace(/^\/api\/?/,'').split('/').filter(Boolean),now=Math.floor(Date.now()/1000);
  const admin=!!env.LEAGUE_ADMIN_EMAIL&&request.headers.get('oai-authenticated-user-email')?.toLowerCase()===env.LEAGUE_ADMIN_EMAIL.toLowerCase();
  const cookies=Object.fromEntries((request.headers.get('cookie')||'').split(';').map(c=>c.trim().split('=')));
  const secure=url.protocol==='https:'?'; Secure':'';
  const setCookie=(kind:Kind,value:string,seconds:number)=>headers.append('Set-Cookie',`${cookieNames[kind]}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${secure}`);
  async function session(kind:Kind){const token=cookies[cookieNames[kind]];if(!token||!/^[a-f0-9]{64}$/.test(token))return null;return db.prepare('SELECT kind,team_id,member_id FROM access_sessions WHERE token_hash=? AND kind=? AND expires>?').bind(await digest(token),kind,now).first<Session>();}
  async function issue(kind:Kind,teamId:string|null=null,memberId:string|null=null){const token=randomToken();await db.prepare('INSERT INTO access_sessions(token_hash,kind,team_id,member_id,expires) VALUES(?,?,?,?,?)').bind(await digest(token),kind,teamId,memberId,now+age[kind]).run();setCookie(kind,token,age[kind]);}
  async function clear(kind:Kind){if(cookies[cookieNames[kind]])await db.prepare('DELETE FROM access_sessions WHERE token_hash=?').bind(await digest(cookies[cookieNames[kind]])).run();setCookie(kind,'',0);}
  async function rate(key:string,max=10,window=900){const hashed=await digest(key);const r=await db.prepare('INSERT INTO access_attempts(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires<=? THEN 1 ELSE count+1 END, expires=CASE WHEN expires<=? THEN excluded.expires ELSE expires END RETURNING count').bind(hashed,now+window,now,now).first<{count:number}>();if(r&&r.count>max)throw new APIError('Too many attempts. Try again in 15 minutes.',429);}
  async function body(){if(Number(request.headers.get('content-length'))>30000)throw new APIError('Request is too large.',413);const raw=await request.text();if(raw.length>30000)throw new APIError('Request is too large.',413);try{return JSON.parse(raw) as Record<string,unknown>;}catch{throw new APIError('Invalid request.');}}
  if(request.method!=='GET'){
   if(request.method!=='POST')throw new APIError('Method not allowed.',405);
   const origin=request.headers.get('Origin');
   // The branded Vercel address serves this same public Site through a rewrite.
   // Keep an exact allowlist: forwarded-host headers must never grant CSRF access.
   const brandedOrigin=origin==='https://soulrunnerhoops.vercel.app'&&url.origin==='https://soul-runner-pc-scheduler.romanwilliammorse.chatgpt.site';
   if(origin!==url.origin&&!brandedOrigin)throw new APIError('Please submit from this website.',403);
   if(!request.headers.get('Content-Type')?.startsWith('application/json'))throw new APIError('JSON required.',415);
  }
  const setting=await db.prepare('SELECT password_hash FROM league_settings WHERE id=1').first<{password_hash:string}>();
  if(parts[0]==='state'&&request.method==='GET')return reply({configured:!!setting,league:!!await session('league'),admin});
  if(parts[0]==='setup'&&request.method==='POST'){
   if(!admin)throw new APIError('League administrator sign-in required.',403);const b=await body();const hash=await hashSecret(password(b.password,'League password'));
   await db.batch([db.prepare('INSERT INTO league_settings(id,password_hash,updated_at) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET password_hash=excluded.password_hash,updated_at=excluded.updated_at').bind(hash,new Date().toISOString()),db.prepare("DELETE FROM access_sessions WHERE kind='league'")]);await issue('league');return reply({ok:true});
  }
  if(parts[0]==='league'&&parts[1]==='login'&&request.method==='POST'){
   const rateKey=`league:${request.headers.get('cf-connecting-ip')||'unknown'}`;await rate(rateKey,15);const b=await body();if(!setting)throw new APIError('The league password has not been set yet.',503);if(!await verifySecret(String(b.password||''),setting.password_hash))throw new APIError('Incorrect league password.',401);await db.prepare('DELETE FROM access_attempts WHERE key=?').bind(await digest(rateKey)).run();await issue('league');return reply({ok:true});
  }
  if(parts[0]==='logout'&&request.method==='POST'){const b=await body();if(b.scope==='member')await clear('member');else for(const k of Object.keys(cookieNames) as Kind[])await clear(k);return reply({ok:true});}
  if(parts[0]==='register'&&request.method==='POST'){
   if(!await session('league'))throw new APIError('Enter the league password first.',401);
   await rate(`register:${request.headers.get('cf-connecting-ip')||'unknown'}`,20,3600);
   const b=await body(),name=text(b.name,'Team name',60),division=text(b.division,'Division');if(!['Main league','G League'].includes(division))throw new APIError('Choose a division.');
   const ownerName=text(b.ownerName,'Owner name',60),ownerDiscord=text(b.ownerDiscord,'Owner Discord',100),ownerPassword=password(b.ownerPassword,'Owner password'),teamPassword=password(b.teamPassword,'Team password',8),ownerPIN=pin(b.ownerPIN);
   if(ownerPassword===teamPassword)throw new APIError('Use different owner and team passwords.');
   if(!Array.isArray(b.players)||b.players.length>19)throw new APIError('A roster can have up to 20 players, including the owner.');
   const players=b.players.map((p:Record<string,unknown>)=>({name:text(p.name,'Player name',60),discord:text(p.discord,'Player Discord',100)}));
   const names=[ownerName,...players.map(p=>p.name)].map(n=>n.toLocaleLowerCase());if(new Set(names).size!==names.length)throw new APIError('Each player needs a different name.');
   const id=crypto.randomUUID(),ownerId=crypto.randomUUID();const [oh,th,ph]=await Promise.all([hashSecret(ownerPassword),hashSecret(teamPassword),hashSecret(ownerPIN)]);
   const queries=[db.prepare('INSERT INTO registered_teams(id,name,name_key,division,owner_hash,team_hash,created_at) VALUES(?,?,?,?,?,?,?)').bind(id,name,name.toLocaleLowerCase(),division,oh,th,new Date().toISOString()),db.prepare('INSERT INTO team_players(id,team_id,name,name_key,discord,is_owner,pin_hash) VALUES(?,?,?,?,?,1,?)').bind(ownerId,id,ownerName,ownerName.toLocaleLowerCase(),ownerDiscord,ph),...players.map(p=>db.prepare('INSERT INTO team_players(id,team_id,name,name_key,discord) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),id,p.name,p.name.toLocaleLowerCase(),p.discord))];
   await db.batch(queries);await issue('owner',id,ownerId);return reply({id},201);
  }
  if(parts[0]!=='team'||!parts[1])throw new APIError('Page not found.',404);
  const id=parts[1],action=parts[2];const t=await db.prepare('SELECT id,name,division,owner_hash,team_hash FROM registered_teams WHERE id=?').bind(id).first<Team>();if(!t)throw new APIError('Team not found. Check your link.',404);
  const ownerSession=await session('owner'),teamSession=await session('team'),memberSession=await session('member');const isOwner=ownerSession?.team_id===id,hasTeam=isOwner||teamSession?.team_id===id;
  const mid=isOwner?ownerSession.member_id:hasTeam&&memberSession?.team_id===id?memberSession.member_id:null;
  const self=mid?await db.prepare('SELECT * FROM team_players WHERE id=? AND team_id=? AND active=1').bind(mid,id).first<Player>():null;
  if(!action&&request.method==='GET'){
   const players=hasTeam?(await db.prepare('SELECT id,name,discord,is_owner,active,pin_hash IS NOT NULL AS pin_set,slots IS NOT NULL AS responded,saved_at FROM team_players WHERE team_id=? AND (active=1 OR ?=1) ORDER BY is_owner DESC,name COLLATE NOCASE').bind(id,isOwner?1:0).all()).results:[];
   return reply({team:{id:t.id,name:t.name,division:t.division},owner:isOwner,access:hasTeam,players,self:self?{id:self.id,name:self.name,timezone:self.timezone,slots:self.slots===null?null:JSON.parse(self.slots),savedAt:self.saved_at,version:self.version}:null});
  }
  if(action==='availability'&&request.method==='GET'){
   if(!isOwner)throw new APIError('Owner password required.',403);
   const rows=(await db.prepare('SELECT id,name,timezone,slots FROM team_players WHERE team_id=? AND active=1 ORDER BY is_owner DESC,name COLLATE NOCASE').bind(id).all<{id:string;name:string;timezone:string|null;slots:string|null}>()).results;
   return reply({players:rows.map(p=>({...p,slots:p.slots===null?null:JSON.parse(p.slots)}))});
  }
  if((action==='games'||action==='messages')&&request.method==='GET'){
   if(!self)throw new APIError('Identify yourself first.',401);
   if(action==='games')return reply({games:(await db.prepare('SELECT id,opponent,starts_at FROM scheduled_games WHERE team_id=? AND starts_at>=? ORDER BY starts_at,id LIMIT 100').bind(id,new Date(Date.now()-6*3600000).toISOString()).all()).results});
   const before=url.searchParams.get('before');if(before!==null&&!/^\d{1,15}$/.test(before))throw new APIError('Invalid message cursor.');
   const rows=(await db.prepare('SELECT m.id,m.member_id,m.body,m.created_at,p.name FROM team_messages m JOIN team_players p ON p.id=m.member_id WHERE m.team_id=? AND m.id<? ORDER BY m.id DESC LIMIT 100').bind(id,before?Number(before):Number.MAX_SAFE_INTEGER).all()).results;
   return reply({messages:rows.reverse(),hasMore:rows.length===100});
  }
  if(request.method!=='POST')throw new APIError('Method not allowed.',405);const b=await body();
  if(action==='messages'){
   if(!self)throw new APIError('Identify yourself first.',401);
   const message=text(b.message,'Message',2000),clientId=text(b.clientId,'Message identifier',64);
   if(!/^[a-zA-Z0-9-]{8,64}$/.test(clientId))throw new APIError('Invalid message identifier.');
   await rate(`chat:${id}:${self.id}`,60,900);
   await db.prepare('INSERT INTO team_messages(team_id,member_id,client_id,body,created_at) VALUES(?,?,?,?,?) ON CONFLICT(team_id,member_id,client_id) DO NOTHING').bind(id,self.id,clientId,message,new Date().toISOString()).run();
   return reply({ok:true});
  }
  if(action==='games'){
   if(!isOwner||!self)throw new APIError('Owner password required.',403);
   if(b.action==='remove'){await db.prepare('DELETE FROM scheduled_games WHERE id=? AND team_id=?').bind(text(b.gameId,'Game'),id).run();return reply({ok:true});}
   if(b.action!=='add')throw new APIError('Unknown schedule action.');
   const opponent=text(b.opponent,'Opponent team',60),start=text(b.startsAt,'Game time',40),date=new Date(start);
   if(!/T.*Z$/.test(start)||!Number.isFinite(date.getTime())||date.getTime()<Date.now()||date.getTime()>Date.now()+366*86400000)throw new APIError('Choose a future game time within the next year.');
   const gameId=text(b.gameId,'Game identifier',64);if(!/^[a-zA-Z0-9-]{8,64}$/.test(gameId))throw new APIError('Invalid game identifier.');
   await db.prepare('INSERT INTO scheduled_games(id,team_id,opponent,starts_at,created_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(gameId,id,opponent,date.toISOString(),new Date().toISOString()).run();return reply({ok:true});
  }
  if(action==='login'||action==='owner-login'){
   const rateKey=`${action}:${id}:${request.headers.get('cf-connecting-ip')||'unknown'}`;await rate(rateKey);
   if(!await verifySecret(String(b.password||''),action==='login'?t.team_hash:t.owner_hash))throw new APIError('Incorrect password.',401);
   await db.prepare('DELETE FROM access_attempts WHERE key=?').bind(await digest(rateKey)).run();
   if(action==='login'){await clear('owner');await clear('member');await issue('team',id);}else{const owner=await db.prepare('SELECT id FROM team_players WHERE team_id=? AND is_owner=1 AND active=1').bind(id).first<{id:string}>();if(!owner)throw new APIError('Owner record missing.',409);await issue('owner',id,owner.id);}
   return reply({ok:true});
  }
  if(action==='identify'){
   if(!hasTeam)throw new APIError('Enter your team password first.',401);const playerId=text(b.memberId,'Player');const value=pin(b.pin);await rate(`pin:${id}:${playerId}`,8);
   const p=await db.prepare('SELECT * FROM team_players WHERE id=? AND team_id=? AND active=1').bind(playerId,id).first<Player>();if(!p)throw new APIError('Choose a player on this roster.',404);
   if(p.pin_hash){if(!await verifySecret(value,p.pin_hash))throw new APIError('Incorrect PIN.',401);}
   else{if(value!==b.confirmPIN)throw new APIError('The PINs do not match.');const result=await db.prepare('UPDATE team_players SET pin_hash=? WHERE id=? AND pin_hash IS NULL AND active=1').bind(await hashSecret(value),p.id).run();if(result.meta.changes!==1)throw new APIError('A PIN was just created for this player. Enter that PIN to continue.',409);}
   await db.prepare('DELETE FROM access_attempts WHERE key=?').bind(await digest(`pin:${id}:${playerId}`)).run();await clear('owner');await issue('member',id,p.id);return reply({ok:true});
  }
  if(action==='availability'){
   if(!self)throw new APIError('Identify yourself first.',401);if(!validTimezone(b.timezone))throw new APIError('Choose a valid time zone.');let slots:number[];try{slots=validateSlots(b.slots);}catch(e){throw new APIError((e as Error).message);}
   if(!Number.isInteger(b.version))throw new APIError('Reload your availability before saving.');
   const savedAt=new Date().toISOString();const result=await db.prepare('UPDATE team_players SET slots=?,timezone=?,saved_at=?,version=version+1 WHERE id=? AND active=1 AND version=?').bind(JSON.stringify(slots),b.timezone,savedAt,self.id,b.version).run();if(result.meta.changes!==1)throw new APIError('Your availability changed in another window. Reload before saving again.',409);return reply({ok:true,savedAt,version:Number(b.version)+1});
  }
  if(!isOwner)throw new APIError('Owner password required.',403);
  if(action==='roster'){
   const operation=text(b.action,'Action');
   if(operation==='add'){
    const name=text(b.name,'Player name',60),discord=text(b.discord,'Discord',100);
    const result=await db.prepare('INSERT INTO team_players(id,team_id,name,name_key,discord) SELECT ?,?,?,?,? WHERE (SELECT count(*) FROM team_players WHERE team_id=? AND active=1)<20').bind(crypto.randomUUID(),id,name,name.toLocaleLowerCase(),discord,id).run();if(result.meta.changes!==1)throw new APIError('The roster is full (20 players).');
   }else{
    const playerId=text(b.memberId,'Player'),p=await db.prepare('SELECT * FROM team_players WHERE id=? AND team_id=?').bind(playerId,id).first<Player>();if(!p)throw new APIError('Player not found.',404);
    if(operation==='edit'){const name=text(b.name,'Player name',60);await db.prepare('UPDATE team_players SET name=?,name_key=?,discord=? WHERE id=?').bind(name,name.toLocaleLowerCase(),text(b.discord,'Discord',100),playerId).run();}
    else if(operation==='remove'){if(p.is_owner)throw new APIError('The owner stays on the roster.');await db.batch([db.prepare('UPDATE team_players SET active=0 WHERE id=?').bind(playerId),db.prepare('DELETE FROM access_sessions WHERE member_id=?').bind(playerId)]);}
    else if(operation==='restore'){const result=await db.prepare('UPDATE team_players SET active=1 WHERE id=? AND (SELECT count(*) FROM team_players WHERE team_id=? AND active=1)<20').bind(playerId,id).run();if(result.meta.changes!==1)throw new APIError('The roster is full.');}
    else if(operation==='reset-pin'){if(p.is_owner)throw new APIError('Change your own PIN in team settings.');await db.batch([db.prepare('UPDATE team_players SET pin_hash=NULL WHERE id=?').bind(playerId),db.prepare("DELETE FROM access_sessions WHERE member_id=? AND kind='member'").bind(playerId),db.prepare('DELETE FROM access_attempts WHERE key=?').bind(await digest(`pin:${id}:${playerId}`))]);}
    else throw new APIError('Unknown roster action.');
   }return reply({ok:true});
  }
  if(action==='passwords'){
   // Validate and hash every supplied value before the atomic update batch.
   const queries:D1PreparedStatement[]=[];let ownerChanged=false;
   if(b.teamPassword){const value=password(b.teamPassword,'Team password',8);if(value===b.ownerPassword||await verifySecret(value,t.owner_hash))throw new APIError('Use different team and owner passwords.');queries.push(db.prepare('UPDATE registered_teams SET team_hash=? WHERE id=?').bind(await hashSecret(value),id),db.prepare("DELETE FROM access_sessions WHERE team_id=? AND kind IN ('team','member')").bind(id));}
   if(b.ownerPassword){const value=password(b.ownerPassword,'Owner password');if(await verifySecret(value,t.team_hash))throw new APIError('Use different team and owner passwords.');queries.push(db.prepare('UPDATE registered_teams SET owner_hash=? WHERE id=?').bind(await hashSecret(value),id),db.prepare("DELETE FROM access_sessions WHERE team_id=? AND kind='owner'").bind(id));ownerChanged=true;}
   if(b.ownerPIN)queries.push(db.prepare('UPDATE team_players SET pin_hash=? WHERE id=? AND is_owner=1').bind(await hashSecret(pin(b.ownerPIN)),ownerSession!.member_id),db.prepare("DELETE FROM access_sessions WHERE member_id=? AND kind='member'").bind(ownerSession!.member_id));
   if(!queries.length)throw new APIError('Enter a new password or PIN.');await db.batch(queries);if(ownerChanged)await issue('owner',id,ownerSession!.member_id);return reply({ok:true});
  }
  throw new APIError('Page not found.',404);
 }catch(e){if(e instanceof APIError)return reply({error:e.message},e.status);const message=e instanceof Error?e.message:'';if(/UNIQUE constraint failed/.test(message))return reply({error:'That name is already in use. Choose a different name.'},409);console.error('Phase-one API error',message.replace(/pbkdf2\$[^\s]+/g,'[redacted]'));return reply({error:'Something went wrong. Please try again.'},500);}
}

