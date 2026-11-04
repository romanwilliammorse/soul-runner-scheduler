// Disposable loopback-only integration fixture for browser QA. Never sends to production.
const origin='http://127.0.0.1:5173';
const cookies=new Map([['__sites_local_auth','1']]);
async function post(path,body){const r=await fetch(origin+'/api/'+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join(';')},body:JSON.stringify(body)});for(const c of r.headers.getSetCookie()){const [k,v]=c.split(';')[0].split('=');cookies.set(k,v);}const data=await r.json();if(!r.ok)throw Error(JSON.stringify(data));return data;}
await post('setup',{password:'local-league-test-only'});
const team=await post('register',{name:'Local Test Team '+Date.now(),division:'Main league',ownerName:'Test Owner',ownerDiscord:'test.owner',ownerPassword:'local-owner-test-only',teamPassword:'local-team-test-only',ownerPIN:'123456',players:[{name:'Alex Test',discord:'alex.test'},{name:'Jordan Test',discord:'jordan.test'},{name:'Taylor Test',discord:'taylor.test'},{name:'Sam Test',discord:'sam.test'}]});
await post(`team/${team.id}/availability`,{slots:[17,18,19,41,42,43],timezone:'America/Los_Angeles',version:0});
console.log(JSON.stringify({teamId:team.id,url:origin+'/?team='+team.id}));
