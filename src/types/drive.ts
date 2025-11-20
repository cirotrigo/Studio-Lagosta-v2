import type { GoogleDriveItem } from '@/types/google-drive'

export type DriveFolderType = 'images' | 'videos'

export interface DriveProjectInfo {
  id: number
  name: string
  googleDriveFolderId: string | null
  googleDriveFolderName: string | null
  googleDriveImagesFolderId: string | null
  googleDriveImagesFolderName: string | null
  googleDriveVideosFolderId: string | null
  googleDriveVideosFolderName: string | null
}

export interface DriveListResponse {
  items: GoogleDriveItem[]
  nextPageToken?: string
  currentFolderId: string
  folderType: DriveFolderType
  folderName?: string | null
  project: DriveProjectInfo
}

export interface DriveDownloadFileMeta {
  id: string
  name: string
  url: string
  size?: number
  mimeType: string
}

export interface DriveDownloadResponse {
  folderId: string
  folderName?: string | null
  files: DriveDownloadFileMeta[]
}

export interface DriveBreadcrumbEntry {
  id: string
  name: string
}
