// Optional staging check. Requires two already proposed, conflicting windows;
// each proposal must have the first team's acceptance and await the second owner.
// This intentionally changes staging records. Never run against real scheduled series.
import assert from 'node:assert/strict';
const required=['SUPABASE_URL','SUPABASE_ANON_KEY','OWNER_B_ACCESS_TOKEN','PROPOSAL_A_ID','PROPOSAL_B_ID','TEAM_B_ID'];
for(const name of required)if(!process.env[name])throw Error(`Missing ${name}; see README staging concurrency check.`);
if(process.env.CONFIRM_STAGING_TEST!=='yes')throw Error('Set CONFIRM_STAGING_TEST=yes for disposable staging proposals only.');
async function accept(id){const response=await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/decide`,{method:'POST',headers:{apikey:process.env.SUPABASE_ANON_KEY,Authorization:`Bearer ${process.env.OWNER_B_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({proposal:id,team:process.env.TEAM_B_ID,accept:true})});const body=await response.json();if(!response.ok)throw Error(`RPC failed: ${body.message||response.status}`);return body;}
const results=await Promise.all([accept(process.env.PROPOSAL_A_ID),accept(process.env.PROPOSAL_B_ID)]);
assert.deepEqual(results.sort(),['confirmed','invalid']);
console.log('PASS: concurrent independent HTTP requests produced exactly one confirmed and one invalid proposal.');
