import 'dotenv/config'
import { google } from 'googleapis'
function drive(){const c=new google.auth.OAuth2(process.env.GOOGLE_DRIVE_CLIENT_ID,process.env.GOOGLE_DRIVE_CLIENT_SECRET);c.setCredentials({refresh_token:process.env.GOOGLE_DRIVE_REFRESH_TOKEN});return google.drive({version:'v3',auth:c})}
const d = drive()
async function subs(parent:string, depth=4, prefix=''):Promise<{id:string,name:string,depth:number}[]>{
  const out:{id:string,name:string,depth:number}[]=[]
  let tok:string|undefined
  do{
    const r=await d.files.list({q:`'${parent}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,fields:'files(id,name),nextPageToken',pageSize:100,pageToken:tok})
    for(const f of r.data.files??[]){
      const full=prefix?`${prefix}/${f.name}`:f.name!
      out.push({id:f.id!,name:full,depth:5-depth})
      if(depth>1) out.push(...await subs(f.id!,depth-1,full))
    }
    tok=r.data.nextPageToken??undefined
  }while(tok)
  return out
}
async function imgs(folder:string, cutoff?:string){
  let n=0, tok:string|undefined
  const q=`'${folder}' in parents and mimeType contains 'image/' and trashed=false`+(cutoff?` and createdTime > '${cutoff}'`:'')
  do{const r=await d.files.list({q,fields:'files(id),nextPageToken',pageSize:1000,pageToken:tok});n+=(r.data.files??[]).length;tok=r.data.nextPageToken??undefined}while(tok)
  return n
}
async function main(){
  const root='1FoSfWt0bJIaeJ77wyNssjXZPW0W0JtRI'
  const cutoff=new Date(); cutoff.setMonth(cutoff.getMonth()-120)
  const c=cutoff.toISOString()
  const all=await subs(root)
  console.log('subfolders found (paginated, depth4):', all.length)
  const rootImgs=await imgs(root)
  const rootImgsCut=await imgs(root,c)
  console.log('images DIRECTLY in root folder:', rootImgs, '(within cutoff:',rootImgsCut,')')
  let tot=0, totCut=0
  for(const f of all){ const a=await imgs(f.id); const b=await imgs(f.id,c); tot+=a; totCut+=b }
  console.log('images in subfolders: total',tot,' within cutoff',totCut)
  console.log('GRAND TOTAL (root+subs):', rootImgs+tot, ' within cutoff:', rootImgsCut+totCut)
  // check any folder with >50 children (pagination bug impact)
  process.exit(0)
}
main()
