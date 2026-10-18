import { afterAll, beforeEach, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { GlobalFonts } from '@napi-rs/canvas'
vi.mock('@/lib/db', () => ({ db: {} }))
const state=vi.hoisted(()=>({bytes:Buffer.alloc(0),calls:0}))
function get(_url:string,cb:(r:Readable & {statusCode:number;headers:object})=>void){
 const req=Object.assign(new EventEmitter(),{setTimeout(){return this},destroy(){return this}})
 state.calls++;setImmediate(()=>cb(Object.assign(Readable.from([state.bytes]),{statusCode:200,headers:{}})))
 return req
}
vi.mock('https', async(original)=>({...await original<typeof import('https')>(),get}))
import { registerProjectFonts, familiasNaoCarregadas } from '@/lib/posts/register-project-fonts'
const projectId=923800001
const dir=`/tmp/studio-lagosta-fonts/${projectId}`
const real=readFileSync('assets/fonts/montserrat/Montserrat-400.ttf')
beforeEach(()=>{rmSync(dir,{recursive:true,force:true});mkdirSync(dir,{recursive:true});state.calls=0;state.bytes=real})
afterAll(()=>rmSync(dir,{recursive:true,force:true}))
const run=(fontFamily:string)=>registerProjectFonts(projectId,{cliente:{customFont:{findMany:async()=>[{fontFamily,fileUrl:'https://synthetic.invalid/font.ttf'}]}},timeoutMs:1000})
it('valid cached synthetic family loads without download',async()=>{
 const family='PR238SyntheticValid';writeFileSync(`${dir}/${family}.ttf`,real);await run(family)
 expect(state.calls).toBe(0);expect(GlobalFonts.has(family)).toBe(true)
 expect([...await familiasNaoCarregadas([family])]).toEqual([])
})
it('corrupt cache is replaced once with local bundled font bytes via fake transport',async()=>{
 const family='PR238SyntheticRetry';writeFileSync(`${dir}/${family}.ttf`,'invalid');await run(family)
 expect(state.calls).toBe(1);expect(GlobalFonts.has(family)).toBe(true)
})
it('invalid retry never becomes a registered family',async()=>{
 const family='PR238SyntheticRejected';writeFileSync(`${dir}/${family}.ttf`,'invalid');state.bytes=Buffer.alloc(2048);state.bytes[1]=1
 const warn=vi.spyOn(console,'error').mockImplementation(()=>{})
 await run(family)
 expect(state.calls).toBe(1);expect(GlobalFonts.has(family)).toBe(false)
 expect([...await familiasNaoCarregadas([family])]).toEqual([family]);expect(warn).toHaveBeenCalled();warn.mockRestore()
})
