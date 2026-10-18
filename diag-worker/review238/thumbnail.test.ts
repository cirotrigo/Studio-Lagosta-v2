import { expect, it } from 'vitest'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { generateThumbnail } from '@/lib/render-engine'
import type { DesignData } from '@/types/template'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
it('cold thumbnail and initialized thumbnail: synthetic accent and weight measurements', async () => {
 const dir = process.env.REVIEW_OUTPUT!
 mkdirSync(dir, { recursive: true })
 const measure = () => {
  const ctx = createCanvas(8,8).getContext('2d')
  return ['400 40px sans-serif','700 40px sans-serif','400 40px Montserrat','700 40px Montserrat','40px serif','40px NoSuchSyntheticFont'].map(font => {
   ctx.font=font; return {font, accent:ctx.measureText('Ç').width, tofu:ctx.measureText('\u0378').width, phrase:ctx.measureText('ALMOÇO às 12h').width}
  })
 }
 const design = {canvas:{width:600,height:150,backgroundColor:'#ffffff'},layers:[{id:'synthetic',name:'Synthetic',type:'text',visible:true,position:{x:20,y:20},size:{width:560,height:110},content:'ALMOÇO às 12h',style:{fontFamily:'sans-serif',fontSize:40,fontWeight:700,fill:'#000000'}}]} as DesignData
 const cold=measure()
 const a=await generateThumbnail(design,{}, {width:600,height:150})
 const { garantirFontesPadrao }=await import('@/lib/canvas-renderer')
 garantirFontesPadrao()
 const warm=measure()
 const b=await generateThumbnail(design,{}, {width:600,height:150})
 const pixels=async (bytes:Buffer) => {const image=await loadImage(bytes); const ctx=createCanvas(600,150).getContext('2d');ctx.drawImage(image,0,0);return ctx.getImageData(0,0,600,150).data}
 const pa=await pixels(a),pb=await pixels(b);let changed=0
 for(let i=0;i<pa.length;i+=4) if(pa.slice(i,i+4).some((v,j)=>v!==pb[i+j])) changed++
 const result={cold,warm,changedPixels:changed,totalPixels:90000}
 writeFileSync(join(dir,'thumbnail-metrics.json'),JSON.stringify(result,null,2))
 writeFileSync(join(dir,'thumbnail-cold.png'),a);writeFileSync(join(dir,'thumbnail-warm.png'),b)
 console.log('THUMBNAIL_SYNTHETIC',JSON.stringify(result))
 expect(a.subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a')
 expect(b.subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a')
 expect(warm.every(x=>x.accent!==x.tofu)).toBe(true)
})
