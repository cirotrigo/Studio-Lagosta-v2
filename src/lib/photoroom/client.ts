const PHOTOROOM_API_BASE = 'https://sdk.photoroom.com/v1'

export class PhotoroomAPIError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public details?: unknown
  ) {
    super(message)
    this.name = 'PhotoroomAPIError'
  }
}

export class PhotoroomClient {
  constructor(private apiKey: string) {}

  /**
   * Remove background from image
   * @param imageUrl - URL of image to process
   * @returns Blob of processed image (PNG with transparency)
   */
  async removeBackground(imageUrl: string): Promise<Blob> {
    // Fetch image from URL
    const imageResponse = await fetch(imageUrl)
    if (!imageResponse.ok) {
      throw new PhotoroomAPIError('Failed to fetch image', imageResponse.status)
    }
    const imageBlob = await imageResponse.blob()

    // Prepare form data
    const formData = new FormData()
    formData.append('image_file', imageBlob, 'image.png')
    formData.append('format', 'png')
    formData.append('size', 'full')

    // Call Photoroom API
    const response = await fetch(`${PHOTOROOM_API_BASE}/segment`, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
      },
      body: formData,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }))
      throw new PhotoroomAPIError(
        error.message || `HTTP ${response.status}`,
        response.status,
        error
      )
    }

    return response.blob()
  }
}

export function getPhotoroomClient(): PhotoroomClient {
  const apiKey = process.env.PHOTOROOM_API_KEY
  if (!apiKey) {
    throw new Error('PHOTOROOM_API_KEY not configured')
  }
  return new PhotoroomClient(apiKey)
}
