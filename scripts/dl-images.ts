import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const client = new google.auth.OAuth2(
  process.env.GOOGLE_DRIVE_CLIENT_ID,
  process.env.GOOGLE_DRIVE_CLIENT_SECRET,
);
client.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN });
const drive = google.drive({ version: 'v3', auth: client });

const args = process.argv.slice(2);
// Usage: npx tsx dl-images.ts <outDir> <id1:name1> <id2:name2> ...
const outDir = args[0] || '/tmp/images';
const images = args.slice(1).map(a => { const [id, name] = a.split(':'); return { id, name }; });

fs.mkdirSync(outDir, { recursive: true });

async function main() {
  for (const img of images) {
    try {
      const resp = await drive.files.get(
        { fileId: img.id, alt: 'media' },
        { responseType: 'arraybuffer' },
      );
      const buf = Buffer.from(resp.data as ArrayBuffer);
      const fpath = path.join(outDir, img.name);
      fs.writeFileSync(fpath, buf);
      console.log(`${img.name}: ${buf.length} bytes OK`);
    } catch (e: any) {
      console.error(`${img.name}: ERROR ${e.message}`);
    }
  }
}
main();
