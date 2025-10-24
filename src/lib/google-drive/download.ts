import { google } from 'googleapis'

interface DownloadParams {
  fileId: string
  accessToken: string
  refreshToken: string
}

export async function downloadFromGoogleDrive({
  fileId,
  accessToken,
  refreshToken,
}: DownloadParams): Promise<{ buffer: Buffer; name: string }> {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )

  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  })

  const drive = google.drive({ version: 'v3', auth: oauth2Client })

  // Get metadata
  const metadata = await drive.files.get({
    fileId,
    fields: 'name',
  })

  // Download file
  const response = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  )

  return {
    buffer: Buffer.from(response.data as ArrayBuffer),
    name: metadata.data.name || 'download',
  }
}
