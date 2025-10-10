export type GoogleDriveBrowserMode = 'folders' | 'images' | 'videos'

export interface GoogleDriveListRequest {
  folderId?: string
  search?: string
  pageToken?: string
  mode?: GoogleDriveBrowserMode
}

export interface GoogleDriveItem {
  id: string
  name: string
  mimeType: string
  kind: 'folder' | 'file'
  size?: number
  modifiedTime?: string
  iconLink?: string | null
  thumbnailLink?: string | null
  webViewLink?: string | null
  webContentLink?: string | null
}

export interface GoogleDriveListResponse {
  items: GoogleDriveItem[]
  nextPageToken?: string
}

export interface GoogleDriveUploadResult {
  fileId: string
  webViewLink?: string | null
  webContentLink?: string | null
  publicUrl: string
}

