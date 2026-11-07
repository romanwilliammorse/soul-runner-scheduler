'use client';
import {useEffect,useRef,useState,type FormEvent,type ReactNode} from 'react';
import WeeklyGrid from './weekly-grid';
import TeamAvailability from './team-availability';
import PlayerHome,{ScheduleManager} from './player-home';
type Player={id:string;name:string;discord:string;is_owner:number;active:number;pin_set:number;responded:number};
type Self={id:string;name:string;slots:number[]|null;timezone:string|null;savedAt:string|null;version:number};
type Team={team:{id:string;name:string;division:string};owner:boolean;access:boolean;players:Player[];self:Self|null};
type State={configured:boolean;league:boolean;admin:boolean};
async function api<T>(path:string,body?:unknown):Promise<T>{const r=await fetch(`/api/${path}`,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});const data=await r.json() as T&{error?:string};if(!r.ok)throw Error(data.error||'Unable to complete this request. Try again.');return data;}
function Field({label,name,type='text',minLength,required=true,defaultValue='',pattern,maxLength=128,autoComplete,onChange}:{label:string;name:string;type?:string;minLength?:number;required?:boolean;defaultValue?:string;pattern?:string;maxLength?:number;autoComplete?:string;onChange?:(value:string)=>void}){return <label>{label}<input name={name} type={type} minLength={minLength} required={required} defaultValue={defaultValue} pattern={pattern} maxLength={pattern?6:maxLength} inputMode={pattern?'numeric':undefined} autoCapitalize="none" onChange={onChange?e=>onChange(e.target.value):undefined} autoComplete={autoComplete??(type==='password'?'current-password':'off')}/></label>;}
function Modal({title,children,close}:{title:string;children:ReactNode;close:()=>void}){const ref=useRef<HTMLDialogElement>(null);useEffect(()=>{const el=ref.current;el?.showModal();return()=>el?.close();},[]);return <dialog ref={ref} onCancel={e=>{e.preventDefault();close();}}><div className="section-heading"><h2>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={close}>×</button></div>{children}</dialog>;}
export default function LeagueApp(){
 const [state,setState]=useState<State|null>(null),[team,setTeam]=useState<Team|null>(null),[id,setId]=useState(''),[view,setView]=useState('home'),[tab,setTab]=useState('team'),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false),[playerView,setPlayerView]=useState(false),[leave,setLeave]=useState<(()=>void)|null>(null);
 const dirty=useRef(false),sequence=useRef(0),address=useRef('');
 async function load(teamId:string){if((new URL(location.href).searchParams.get('team')||'')!==teamId)return;const seq=++sequence.current;try{const [s,t]=await Promise.all([api<State>('state'),teamId?api<Team>(`team/${teamId}`):Promise.resolve(null)]);if(seq===sequence.current){setState(s);setTeam(t);}}finally{if(seq===sequence.current)setLoading(false);}}
 function guard(action:()=>void){if(dirty.current)setLeave(()=>action);else action();}
 function navigate(next:string,teamId=''){guard(()=>{dirty.current=false;setId(teamId);setView(next);setTeam(null);setError('');setPlayerView(false);setLoading(true);const u=new URL(location.href);u.search='';if(teamId)u.searchParams.set('team',teamId);else if(next!=='home')u.searchParams.set('view',next);history.pushState(null,'',u);address.current=u.href;void load(teamId).catch(e=>setError(e.message));});}
 useEffect(()=>{const read=()=>{const u=new URL(location.href),teamId=u.searchParams.get('team')||'';setId(teamId);setView(u.searchParams.get('view')||'home');setTeam(null);setPlayerView(false);setLoading(true);setError('');address.current=u.href;void load(teamId).catch(e=>setError(e.message));};const pop=()=>{if(dirty.current){const target=location.href;history.pushState(null,'',address.current);setLeave(()=>()=>{history.replaceState(null,'',target);read();});}else read();};read();window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop);},[]);
 async function run(action:()=>Promise<void>){if(busy)return;setBusy(true);setError('');try{await action();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 function submit(e:FormEvent<HTMLFormElement>,action:(data:Record<string,FormDataEntryValue>)=>Promise<void>){e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));void run(()=>action(data));}
 function changeTab(next:string){guard(()=>{dirty.current=false;setTab(next);setError('');window.scrollTo(0,0);});}
 const owner=!!team?.owner&&!playerView,unlocked=!!team?.self;
 return <><header className="site-header"><a className="wordmark" href="/" onClick={e=>{e.preventDefault();navigate('home');}}><img src="/soul-runner-logo.png" alt="" width={40} height={40}/><span><strong>SOUL RUNNER</strong><small>PC 2K LEAGUE</small></span></a>{unlocked&&<button className="text-button" disabled={busy} onClick={()=>guard(()=>void run(async()=>{await api('logout',{scope:team.owner?'all':'member'});dirty.current=false;setPlayerView(false);await load(id);}))}>Sign out</button>}</header>
 <main className={unlocked||view==='player-demo'?'app-main':!id&&view==='home'?'entry-main landing-main':'entry-main'}>
 {error&&<div className="feedback error" role="alert">{error}</div>}
 {view==='player-demo'?<><div className="team-heading"><div><p className="eyebrow">SAMPLE TEAM</p><h2>Soul Runner</h2></div><button className="text-button" onClick={()=>navigate('home')}>Exit player view</button></div><PlayerHome demo onDirty={v=>dirty.current=v} onSaved={async()=>{}} onError={setError} guard={guard}/></>:loading?<p className="loading" role="status">Loading your team…</p>:!state||id&&!team?<div className="entry-card"><h1>Unable to load</h1><button className="primary" onClick={()=>{setLoading(true);void load(id).catch(e=>setError(e.message));}}>Try again</button></div>:view==='setup'?<div className="entry-card"><p className="eyebrow">ADMINISTRATION</p><h1>League access</h1>{state.admin?<form onSubmit={e=>submit(e,async d=>{if(d.password!==d.confirm)throw Error('Passwords do not match.');await api('setup',{password:d.password});navigate('home');})}><Field label="League password" name="password" type="password" minLength={10}/><Field label="Confirm password" name="confirm" type="password" minLength={10}/><button className="primary" disabled={busy}>Save password</button></form>:<a className="button primary" href="/signin-with-chatgpt?return_to=%2F%3Fview%3Dsetup" target="_top">Administrator sign in</a>}</div>:!id?<>
 {view==='register'&&state.league?<Registration busy={busy} submit={submit} back={()=>navigate('home')} done={teamId=>{setTab('invite');navigate('home',teamId);}}/>:<div className={view==='gate'?'entry-card':'entry-card landing-card'}><div className="entry-content"><p className="eyebrow">SOUL RUNNER PC 2K LEAGUE</p><h1>Get your team{' '}<span>on the same time.</span></h1>{view!=='gate'?<><button className="primary entry-cta" onClick={()=>navigate(state.league?'register':'gate')}>Register team <span aria-hidden="true">↗</span></button><p className="entry-note">Already on a team? Open the link from your owner.</p><button className="secondary demo-entry" onClick={()=>navigate('player-demo')}>View as player</button></>:<><p>Enter the league password from Roman.</p>{state.configured?<form onSubmit={e=>submit(e,async d=>{await api('league/login',d);navigate('register');})}><Field label="League password" name="password" type="password"/><button className="primary" disabled={busy}>{busy?'Checking…':'Continue'}</button></form>:<p>Registration opens when the league password is set.</p>}<button className="text-button" onClick={()=>navigate('home')}>Back</button></>}{state.admin&&<button className="text-button admin-link" onClick={()=>navigate('setup')}>League settings</button>}</div>{view!=='gate'&&<img className="entry-logo" src="/soul-runner-logo.png" alt="" width={250} height={250}/>}</div>}
 </>:team&&!unlocked?<TeamEntry key={id} teamId={id} team={team} refresh={()=>load(id)}/>:team?.self?<>
 <div className="team-heading"><div><p className="eyebrow">{team.team.division}</p><h2>{team.team.name}</h2></div>{team.owner&&<button className="text-button" onClick={()=>guard(()=>{dirty.current=false;setPlayerView(!playerView);})}>{playerView?'Return to owner':'View as player'}</button>}</div>
 {owner&&<nav className="team-tabs" aria-label="Team pages">{[['team','Team availability'],['schedule','Scheduled games'],['hours','My hours'],['players','Players'],['invite','Invite & settings']].map(([key,label])=><button key={key} aria-current={tab===key?'page':undefined} onClick={()=>changeTab(key)}>{label}</button>)}</nav>}
 {!owner?<PlayerHome key={id} teamId={id} self={team.self} onDirty={v=>dirty.current=v} onSaved={()=>load(id)} onError={setError} guard={guard}/>:tab==='schedule'?<ScheduleManager teamId={id}/>:tab==='hours'?<WeeklyGrid key={`${team.self.id}-${playerView}`} self={team.self} teamId={id} onDirty={v=>dirty.current=v} onSaved={()=>load(id)} onError={setError}/>:tab==='team'?<TeamAvailability teamId={id}/>:tab==='players'?<Roster team={team} refresh={()=>load(id)}/>:<Invite teamId={id}/>}
 </>:null}
 </main>
 {leave&&<Modal title="Unsaved hours" close={()=>setLeave(null)}><p>Save your hours before leaving, or discard these changes.</p><div className="dialog-actions"><button className="primary" onClick={()=>setLeave(null)}>Keep editing</button><button className="secondary" onClick={()=>{const action=leave;dirty.current=false;setLeave(null);action();}}>Discard changes</button></div></Modal>}</>;
}

function TeamEntry({teamId,team,refresh}:{teamId:string;team:Team;refresh:()=>Promise<void>}){
 const [mode,setMode]=useState<'join'|'returning'>('join'),[ownerLogin,setOwnerLogin]=useState(false),[chosen,setChosen]=useState<Player|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [draft,setDraft]=useState({name:'',discord:'',pin:'',confirmPIN:''});
 const pending=useRef<{key:string;joinId:string}|null>(null),submitting=useRef(false),active=useRef(true),errorBox=useRef<HTMLParagraphElement>(null);
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 useEffect(()=>{if(error)errorBox.current?.scrollIntoView({block:'nearest'});},[error]);
 async function authenticated(){if(active.current)await refresh();}
 function updateDraft(field:keyof typeof draft,value:string){setDraft(previous=>({...previous,[field]:value}));}
 const full=team.players.filter(p=>p.active).length>=20;
 async function submitEntry(e:FormEvent<HTMLFormElement>,action:(data:Record<string,FormDataEntryValue>)=>Promise<void>){
  e.preventDefault();if(submitting.current)return;
  const data=Object.fromEntries(new FormData(e.currentTarget));
  submitting.current=true;setBusy(true);setError('');
  try{await action(data);}catch(e){if(active.current)setError((e as Error).message);}finally{submitting.current=false;if(active.current)setBusy(false);}
 }
 function changeMode(next:'join'|'returning'){setMode(next);setChosen(null);setError('');}
 return <section className="entry-card team-entry" aria-label="Join or sign in to your team">
  <p className="eyebrow">{team.team.division}</p><h1>{team.team.name}</h1>
  {!team.access||ownerLogin?<>
   <div className="segments login-mode" aria-label="Team access"><button type="button" disabled={busy} aria-pressed={!ownerLogin} onClick={()=>{setOwnerLogin(false);setError('');}}>Player</button><button type="button" disabled={busy} aria-pressed={ownerLogin} onClick={()=>{setOwnerLogin(true);setError('');}}>Owner</button></div>
   <p>{ownerLogin?'Sign in to manage your team.':'Enter the team password your owner shared. Next, add your player details or sign in.'}</p>
   <form key={String(ownerLogin)} onSubmit={e=>void submitEntry(e,async data=>{await api(`team/${teamId}/${ownerLogin?'owner-login':'login'}`,data);await authenticated();if(active.current)setOwnerLogin(false);})}>
    <fieldset disabled={busy}><Field label={ownerLogin?'Private owner password':'Team password'} name="password" type="password"/></fieldset>

    <button className="primary" disabled={busy}>{busy?'Checking…':'Continue'}</button>
   </form>
  </>:<>
   <div className="segments login-mode" aria-label="Player access"><button type="button" disabled={busy} aria-pressed={mode==='join'} onClick={()=>changeMode('join')}>Join team</button><button type="button" disabled={busy} aria-pressed={mode==='returning'} onClick={()=>changeMode('returning')}>Returning player</button></div>
   {mode==='join'?<>
    <h2 className="entry-subheading">Your player details</h2>
    <p>Add yourself to the roster. Your owner will see your name and Discord username.</p>
    {full?<div className="feedback"><p>This team has reached its 20-player limit. Ask your owner to make room, or sign in if you’re already on the roster.</p><button className="secondary" type="button" onClick={()=>changeMode('returning')}>Sign in</button></div>:<form onSubmit={e=>void submitEntry(e,async data=>{
     if(data.pin!==data.confirmPIN)throw Error('The PINs do not match.');
     const details={name:String(data.name||'').trim(),discord:String(data.discord||'').trim(),pin:String(data.pin||''),confirmPIN:String(data.confirmPIN||'')};
     const key=JSON.stringify(details);if(pending.current?.key!==key)pending.current={key,joinId:crypto.randomUUID()};
     await api(`team/${teamId}/join`,{...details,joinId:pending.current.joinId});await authenticated();
    })}>
     <fieldset disabled={busy}>
      <Field label="Your name" name="name" maxLength={60} autoComplete="nickname" defaultValue={draft.name} onChange={value=>updateDraft('name',value)}/>
      <Field label="Discord username" name="discord" maxLength={100} defaultValue={draft.discord} onChange={value=>updateDraft('discord',value)}/>
      <p className="hint">Use your Discord username, not your display name.</p>
      <div className="join-pin-fields"><Field label="Create a six-digit PIN" name="pin" type="password" pattern="[0-9]{6}" autoComplete="new-password" defaultValue={draft.pin} onChange={value=>updateDraft('pin',value)}/><Field label="Confirm PIN" name="confirmPIN" type="password" pattern="[0-9]{6}" autoComplete="new-password" defaultValue={draft.confirmPIN} onChange={value=>updateDraft('confirmPIN',value)}/></div>
      <p className="hint">Keep this PIN. You’ll use it to return to your saved hours and team chat.</p>
     </fieldset>

     <button className="primary" disabled={busy}>{busy?'Joining…':'Join team & continue'}</button>
    </form>}
   </>:chosen?<>
    <button type="button" className="text-button" disabled={busy} onClick={()=>{setChosen(null);setError('');}}>← Choose another player</button>
    <h2 className="entry-subheading">{chosen.name}</h2>
    {!chosen.pin_set&&<p>Your profile is already on the roster. Create your personal PIN to open the team.</p>}
    <form key={chosen.id} onSubmit={e=>void submitEntry(e,async data=>{await api(`team/${teamId}/identify`,{...data,memberId:chosen.id});await authenticated();})}>
     <fieldset disabled={busy}><Field label={chosen.pin_set?'Your six-digit PIN':'Create a six-digit PIN'} name="pin" type="password" pattern="[0-9]{6}" autoComplete={chosen.pin_set?'current-password':'new-password'}/>{!chosen.pin_set&&<Field label="Confirm PIN" name="confirmPIN" type="password" pattern="[0-9]{6}" autoComplete="new-password"/>}</fieldset>

     <button className="primary" disabled={busy}>{busy?'Signing in…':'Open team'}</button>
    </form><p className="hint">Forgot your PIN? Ask your owner to reset it.</p>
   </>:<>
    <h2 className="entry-subheading">Welcome back</h2><p>Choose your name, then enter your personal PIN.</p>
    <div className="player-list">{team.players.filter(p=>p.active).map(p=><button type="button" className="player-choice" key={p.id} onClick={()=>{setChosen(p);setError('');}}><span>{p.name}<small>{p.pin_set?'Enter your PIN':'Already on the roster · create a PIN'}</small></span><span aria-hidden="true">→</span></button>)}</div>
   </>}
   <button type="button" className="text-button owner-entry" disabled={busy} onClick={()=>{setOwnerLogin(true);setError('');}}>Owner sign in</button>
  </>}
 {error&&<p ref={errorBox} className="feedback error" role="alert">{error}</p>}
 </section>;
}

function Registration({busy,submit,back,done}:{busy:boolean;submit:(e:FormEvent<HTMLFormElement>,f:(d:Record<string,FormDataEntryValue>)=>Promise<void>)=>void;back:()=>void;done:(id:string)=>void}){
 const [step,setStep]=useState(0),[data,setData]=useState<Record<string,FormDataEntryValue>>({});const formRef=useRef<HTMLFormElement>(null);
 return <div className="entry-card registration">
  <div className="section-heading"><p className="eyebrow">REGISTER TEAM · {step+1} / 2</p><button className="text-button" disabled={busy} onClick={()=>{if(formRef.current)setData(d=>({...d,...Object.fromEntries(new FormData(formRef.current!))}));step?setStep(step-1):back();}}>Back</button></div>
  <div className="step-track">{[0,1].map(n=><i className={n<=step?'complete':''} key={n}/>)}</div>
  <h1>{step===0?'Your team':'Team access'}</h1>
  <form ref={formRef} key={step} onSubmit={e=>submit(e,async values=>{const next={...data,...values};setData(next);if(step===0){setStep(1);return;}const result=await api<{id:string}>('register',{...next,players:[]});done(result.id);})}>
   <fieldset disabled={busy}>
    {step===0?<>
     <Field label="Team name" name="name" maxLength={60} defaultValue={String(data.name||'')}/>
     <label>Division<select name="division" defaultValue={String(data.division||'Main league')}><option>Main league</option><option>G League</option></select></label>
     <Field label="Your name" name="ownerName" maxLength={60} defaultValue={String(data.ownerName||'')}/>
     <Field label="Your Discord username" name="ownerDiscord" maxLength={100} defaultValue={String(data.ownerDiscord||'')}/>
     <p className="registration-note">Your players will enter their own details using your team link.</p>
    </>:<>
     <Field label="Private owner password" name="ownerPassword" type="password" minLength={10} autoComplete="new-password" defaultValue={String(data.ownerPassword||'')}/>
     <p className="hint">For you only · 10+ characters</p>
     <Field label="Shared team password" name="teamPassword" type="password" minLength={8} autoComplete="new-password" defaultValue={String(data.teamPassword||'')}/>
     <p className="hint">Share with your players · use a different password · 8+ characters</p>
     <Field label="Your six-digit player PIN" name="ownerPIN" type="password" pattern="[0-9]{6}" autoComplete="new-password" defaultValue={String(data.ownerPIN||'')}/>
    </>}
   </fieldset>
   <button className="primary form-next" disabled={busy}>{busy?'Saving…':step===0?'Continue':'Create team & get invite link'}</button>
  </form>
 </div>;
}


function Roster({team,refresh}:{team:Team;refresh:()=>Promise<void>}){
 const [edit,setEdit]=useState<Player|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[action,setAction]=useState('');
 async function save(body:unknown){if(busy)return;setBusy(true);setError('');try{await api(`team/${team.team.id}/roster`,body);await refresh();setEdit(null);setAction('');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <section><div className="section-heading"><h1>Players</h1><button className="primary" onClick={()=>{setError('');setAction('');setEdit({id:'',name:'',discord:'',active:1,is_owner:0,pin_set:0,responded:0});}}>Add player</button></div><p>Players can add themselves using your team link. You can manage their details here.</p><div className="roster-list">{team.players.filter(p=>p.active).map(p=><div className="roster-row" key={p.id}><div><strong>{p.name}{p.is_owner?' · Owner':''}</strong><small>{p.discord}</small></div><span className={p.responded?'response saved':'response'}>{p.responded?'Saved':'Waiting'}</span><button className="text-button" onClick={()=>{setError('');setAction('');setEdit(p);}}>Edit</button></div>)}</div>{team.players.some(p=>!p.active)&&<details><summary>Removed players</summary>{team.players.filter(p=>!p.active).map(p=><div className="roster-row" key={p.id}>{p.name}<button className="secondary" disabled={busy} onClick={()=>save({action:'restore',memberId:p.id})}>Restore</button></div>)}</details>}{error&&!edit&&<p role="alert" className="feedback error">{error}</p>}
 {edit&&<Modal title={edit.id?'Edit player':'Add player'} close={()=>{if(!busy)setEdit(null);}}><form onSubmit={e=>{e.preventDefault();void save({...Object.fromEntries(new FormData(e.currentTarget)),action:edit.id?'edit':'add',memberId:edit.id});}}><Field label="Name" name="name" defaultValue={edit.name}/><Field label="Discord username" name="discord" defaultValue={edit.discord}/><button className="primary" disabled={busy}>Save player</button></form>{error&&<p role="alert" className="feedback error">{error}</p>}{edit.id&&!edit.is_owner&&<div className="edit-actions">{action?<><p>{action==='remove'?'Remove this player? Their saved hours will be retained.':'Reset this player’s PIN? They will create a new one on their next visit.'}</p><button className="secondary" disabled={busy} onClick={()=>save({action,memberId:edit.id})}>Confirm {action==='remove'?'removal':'PIN reset'}</button><button className="text-button" onClick={()=>setAction('')}>Cancel</button></>:<><button className="text-button" onClick={()=>setAction('reset-pin')}>Reset PIN</button><button className="text-button danger" onClick={()=>setAction('remove')}>Remove player</button></>}</div>}</Modal>}</section>;
}

function Invite({teamId}:{teamId:string}){
 const [notice,setNotice]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[link,setLink]=useState('');useEffect(()=>setLink(`${location.origin}/?team=${teamId}`),[teamId]);
 return <section className="settings"><h1>Invite your team</h1><p>Share this link and the team password. Players enter their own name and Discord username, then create a six-digit PIN.</p><label>Team link<input readOnly value={link} onFocus={e=>e.target.select()}/></label><button className="primary" onClick={async()=>{try{await navigator.clipboard.writeText(link);setNotice('Team link copied.');}catch{setError('Select the link above and copy it manually.');}}}>Copy team link</button><details><summary>Passwords & PIN</summary><form onSubmit={async e=>{e.preventDefault();const form=e.currentTarget;setBusy(true);setError('');try{await api(`team/${teamId}/passwords`,Object.fromEntries(new FormData(form)));form.reset();setNotice('Access settings updated.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}><Field label="New team password" name="teamPassword" type="password" minLength={8} required={false}/><Field label="New owner password" name="ownerPassword" type="password" minLength={10} required={false}/><Field label="New personal PIN" name="ownerPIN" type="password" pattern="[0-9]{6}" required={false}/><button className="secondary" disabled={busy}>Update access</button></form></details>{notice&&<p role="status" className="feedback success">{notice}</p>}{error&&<p role="alert" className="feedback error">{error}</p>}</section>;
}
