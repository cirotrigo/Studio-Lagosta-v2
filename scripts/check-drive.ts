import { googleDriveService } from '../src/server/google-drive-service'

async function main() {
  try {
    const result = await googleDriveService.listFiles({ folderId: process.argv[2], mode: 'images' })
    console.log(result)
  } catch (error) {
    console.error(error)
  }
}

main()
