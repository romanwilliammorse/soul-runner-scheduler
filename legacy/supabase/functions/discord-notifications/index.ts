import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// Invoke from a trusted scheduler; no user JWT or public invocation may dispatch notifications.
Deno.serve(async(req:Request)=>{
 const secret=Deno.env.get('NOTIFICATION_WORKER_SECRET');
 if(!secret||req.headers.get('Authorization')!==`Bearer ${secret}`)return new Response('Unauthorized',{status:401});
 const webhook=Deno.env.get('DISCORD_WEBHOOK_URL');
 if(!webhook)return Response.json({status:'disabled',reason:'No Discord webhook configured'});
 if(!/^https:\/\/discord\.com\/api\/webhooks\//.test(webhook))return Response.json({error:'Invalid Discord webhook host'},{status:500});
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
 const {data:jobs,error}=await db.rpc('claim_notifications');if(error)return Response.json({error:'Could not claim notifications'},{status:500});
 const results=[];
 for(const job of jobs||[]){
  try{
   const {data:settings}=await db.from('notification_settings').select('enabled,events').single();
   if(!settings?.enabled||!settings.events.includes(job.event)){await db.from('outbox').update({status:'skipped'}).eq('id',job.id);continue;}
   const p=job.payload;const when=p.starts_at?`${new Date(p.starts_at).toISOString().replace('T',' ').slice(0,16)} UTC – ${new Date(p.ends_at).toISOString().replace('T',' ').slice(0,16)} UTC`:'See the league scheduler for the proposed time.';
   const decision=job.event==='decision'?`\nDecision: ${p.proposal_status}. ${p.team_a}: ${p.accepted_a?'accepted':'not accepted'}; ${p.team_b}: ${p.accepted_b?'accepted':'not accepted'}.`:'';
   const exceptional=p.override_reason?`\nADMIN OVERRIDE: ${String(p.override_reason).slice(0,300)}`:'';
   const note=job.event==='cancelled'?`\nReason: ${String(p.note||'See scheduler').slice(0,300)}`:'';
   const response=await fetch(webhook+'?wait=true',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:`**Soul Runner PC 2K League · ${job.event}**\n${p.team_a} vs ${p.team_b} · Meeting ${p.meeting}\n${when}${decision}${exceptional}${note}\nEvent ${job.id}`,allowed_mentions:{parse:[]}}),signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw Error(`Discord returned HTTP ${response.status}`);
   await db.from('outbox').update({status:'sent',error:null}).eq('id',job.id);results.push({id:job.id,status:'sent'});
  }catch(e){const message=e instanceof Error?e.message:'Delivery failed';await db.from('outbox').update({status:'failed',error:message}).eq('id',job.id);results.push({id:job.id,status:'failed'});}
 }
 return Response.json({results});
});
