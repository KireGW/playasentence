export function normalizeAudioBlobBaseUrl(baseUrl) {
  return baseUrl?.trim()?.replace(/\/$/, '') || ''
}

export function getAcceptedOrderKey(order) {
  return order.join('-')
}

export function appendAudioVersion(audioUrl, audioVersion) {
  if (!audioUrl || !audioVersion) {
    return audioUrl
  }

  const separator = audioUrl.includes('?') ? '&' : '?'
  return `${audioUrl}${separator}v=${encodeURIComponent(audioVersion)}`
}

export function buildPuzzleAudioPath({
  languageId,
  level,
  puzzleId,
  segmentIndex = null,
  isFullSentence = false,
  acceptedOrderKey = '',
}) {
  const normalizedLevel = level.toLowerCase()

  if (isFullSentence) {
    if (acceptedOrderKey) {
      return `audio/${languageId}/${normalizedLevel}/${puzzleId}_full_${acceptedOrderKey}.mp3`
    }

    return `audio/${languageId}/${normalizedLevel}/${puzzleId}_full.mp3`
  }

  if (!Number.isInteger(segmentIndex) || segmentIndex < 1) {
    throw new Error('segmentIndex must be a positive integer for segment audio paths.')
  }

  return `audio/${languageId}/${normalizedLevel}/${puzzleId}_${segmentIndex}.mp3`
}

export function buildPuzzleAudioUrl(baseUrl, options) {
  const normalizedBaseUrl = normalizeAudioBlobBaseUrl(baseUrl)
  if (!normalizedBaseUrl) {
    return null
  }

  return `${normalizedBaseUrl}/${buildPuzzleAudioPath(options)}`
}

export function buildCsvAudioConfig(
  baseUrl,
  languageId,
  level,
  puzzleId,
  segmentCount,
  acceptedOrders = [],
  audioVersion = '',
) {
  const normalizedBaseUrl = normalizeAudioBlobBaseUrl(baseUrl)

  if (!normalizedBaseUrl) {
    return {
      fullAudioUrl: null,
      fullAudioUrlsByOrder: {},
      segmentAudioUrls: [],
    }
  }

  const fullAudioUrlsByOrder = Object.fromEntries(
    acceptedOrders.map((order, index) => [
      getAcceptedOrderKey(order.map((segmentIndex) => segmentIndex + 1)),
      appendAudioVersion(
        buildPuzzleAudioUrl(normalizedBaseUrl, {
          languageId,
          level,
          puzzleId,
          isFullSentence: true,
          acceptedOrderKey:
            index === 0 ? '' : getAcceptedOrderKey(order.map((segmentIndex) => segmentIndex + 1)),
        }),
        audioVersion,
      ),
    ]),
  )

  return {
    fullAudioUrl: appendAudioVersion(
      buildPuzzleAudioUrl(normalizedBaseUrl, {
        languageId,
        level,
        puzzleId,
        isFullSentence: true,
      }),
      audioVersion,
    ),
    fullAudioUrlsByOrder,
    segmentAudioUrls: Array.from({ length: segmentCount }, (_, index) =>
      appendAudioVersion(
        buildPuzzleAudioUrl(normalizedBaseUrl, {
          languageId,
          level,
          puzzleId,
          segmentIndex: index + 1,
        }),
        audioVersion,
      ),
    ),
  }
}

export function inferAudioBlobBaseUrl(blobUrl) {
  if (typeof blobUrl !== 'string') {
    return ''
  }

  const marker = '/audio/'
  const markerIndex = blobUrl.indexOf(marker)
  if (markerIndex < 0) {
    return blobUrl.replace(/\/$/, '')
  }

  return blobUrl.slice(0, markerIndex)
}
