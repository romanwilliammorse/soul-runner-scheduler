const encoder=new TextEncoder();
export function randomToken(){return Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');}
const hex=(a:ArrayBuffer)=>Array.from(new Uint8Array(a),b=>b.toString(16).padStart(2,'0')).join('');
export async function digest(value:string){return hex(await crypto.subtle.digest('SHA-256',encoder.encode(value)));}
export async function hashSecret(secret:string,salt=randomToken()){
 const key=await crypto.subtle.importKey('raw',encoder.encode(secret),'PBKDF2',false,['deriveBits']);
 return `pbkdf2$100000$${salt}$${hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:encoder.encode(salt),iterations:100000},key,256))}`;
}
export async function verifySecret(secret:string,stored:string|null){
 if(!stored||secret.length>200)return false;const parts=stored.split('$');if(parts.length!==4||parts[0]!=='pbkdf2'||parts[1]!=='100000')return false;
 const actual=await hashSecret(secret,parts[2]);let difference=actual.length^stored.length;for(let i=0;i<actual.length;i++)difference|=actual.charCodeAt(i)^(stored.charCodeAt(i)||0);return difference===0;
}
export function validTimezone(zone:unknown):zone is string{if(typeof zone!=='string'||zone.length>100)return false;try{new Intl.DateTimeFormat('en-US',{timeZone:zone}).format();return true;}catch{return false;}}
export function validateSlots(value:unknown):number[]{if(!Array.isArray(value)||value.length>168||value.some(n=>!Number.isInteger(n)||n<0||n>167)||new Set(value).size!==value.length)throw Error('Choose valid hourly blocks.');return [...value].sort((a,b)=>a-b);}
