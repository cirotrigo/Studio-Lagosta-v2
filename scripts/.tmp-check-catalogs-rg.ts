import 'dotenv/config'
import { google } from 'googleapis'
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
function drive(){const c=new google.auth.OAuth2(process.env.GOOGLE_DRIVE_CLIENT_ID,process.env.GOOGLE_DRIVE_CLIENT_SECRET);c.setCredentials({refresh_token:process.env.GOOGLE_DRIVE_REFRESH_TOKEN});return google.drive({version:'v3',auth:c})}
async function main(){
  for (const pid of [1,2]) {
    const p:any = await prisma.project.findUnique({where:{id:pid}})
    const folder = p.googleDriveImagesFolderId ?? p.googleDriveFolderId
    const d = drive()
    const r = await d.files.list({q:`'${folder}' in parents and name = '_image-catalog.json' and trashed = false`,fields:'files(id,name,createdTime,modifiedTime,size)',pageSize:1})
    const f = r.data.files?.[0]
    console.log(`\n=== Project ${pid}: ${p.name} (folder ${folder}) ===`)
    if(!f){console.log('  NO CATALOG FILE'); continue}
    console.log(`  catalog fileId=${f.id} created=${f.createdTime} modified=${f.modifiedTime} size=${f.size}`)
    const cat:any = (await d.files.get({fileId:f.id!,alt:'media'},{responseType:'json'})).data
    console.log(`  catalog.projectId=${cat.projectId} projectName=${cat.projectName} images=${cat.images?.length} lastUpdated=${cat.lastUpdated}`)
    const folders = new Map<string,number>()
    for(const im of (cat.images||[])) folders.set(im.folder||'?', (folders.get(im.folder||'?')||0)+1)
    console.log('  folders:', JSON.stringify([...folders.entries()].slice(0,12)))
    console.log('  sample:', JSON.stringify((cat.images||[]).slice(0,2),null,1).slice(0,700))
  }
  process.exit(0)
}
main()
