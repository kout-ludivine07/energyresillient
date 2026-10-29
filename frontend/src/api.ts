const BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
export type Profile = {display_name:string;grid:string;region:string;city:string;household_type:string;solar_capacity_wh:number;battery_capacity_wh:number;reserve_percent:number}
export type Risk = {level:string;score:number|null;score_type:string;grid:string;region:string;recent_distinct_reporters:number;historical_events:number;active_events:number;explanation:string;actions:string[];model:{status:string;version?:string;sample_count?:number;silhouette_score?:number|null}}
export type Report = {id?:number;kind:'outage'|'restored';grid:string;region:string;city:string;latitude:number|null;longitude:number|null;accuracy_m:number|null;location_consent:boolean;note:string;client_report_id:string;created_at?:string}
export function token(){return localStorage.getItem('er_access')||''}
export function setTokens(a:string,r:string){localStorage.setItem('er_access',a);localStorage.setItem('er_refresh',r)}
export function clearTokens(){localStorage.removeItem('er_access');localStorage.removeItem('er_refresh')}
export async function api<T>(path:string, init:RequestInit={}) : Promise<T> {
  const headers = new Headers(init.headers)
  if (!(init.body instanceof FormData)) headers.set('Content-Type','application/json')
  if (token()) headers.set('Authorization',`Bearer ${token()}`)
  let res = await fetch(`${BASE}${path}`, {...init,headers})
  if (res.status===401 && localStorage.getItem('er_refresh')) {
    const rr=await fetch(`${BASE}/auth/token/refresh/`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refresh:localStorage.getItem('er_refresh')})})
    if (rr.ok) { const data=await rr.json(); localStorage.setItem('er_access',data.access); headers.set('Authorization',`Bearer ${data.access}`); res=await fetch(`${BASE}${path}`,{...init,headers}) }
    else clearTokens()
  }
  if (!res.ok) { const message=await res.text(); throw new Error(`${res.status}: ${message.slice(0,220)}`) }
  return res.status===204 ? undefined as T : res.json()
}
export async function queueReport(report:Report){
  const {default:Dexie}=await import('dexie')
  class QueueDB extends Dexie { reports:any; constructor(){super('er-offline');this.version(1).stores({reports:'client_report_id,created_at'})} }
  const db=new QueueDB()
  await db.table('reports').put(report)
}
export async function pendingReports():Promise<Report[]>{
  const {default:Dexie}=await import('dexie')
  class QueueDB extends Dexie { reports:any; constructor(){super('er-offline');this.version(1).stores({reports:'client_report_id,created_at'})} }
  const db=new QueueDB()
  return db.table('reports').toArray()
}
export async function syncReports(){
  const {default:Dexie}=await import('dexie')
  class QueueDB extends Dexie { reports:any; constructor(){super('er-offline');this.version(1).stores({reports:'client_report_id,created_at'})} }
  const db=new QueueDB()
  const items:Report[]=await db.table('reports').toArray()
  for(const item of items){
    try { await api('/reports/',{method:'POST',body:JSON.stringify(item)}); await db.table('reports').delete(item.client_report_id) }
    catch { break }
  }
}
