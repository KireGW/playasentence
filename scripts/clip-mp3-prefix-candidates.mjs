import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { put } from '@vercel/blob'

const ROOT_DIR = path.resolve(import.meta.dirname, '..')

function parseArgs(argv) {
  const options = {
    input: '',
    localDir: '',
    blobPrefix: '',
    namePrefix: '',
    starts: [],
    durations: [],
    upload: true,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    const nextValue = argv[index + 1]

    if (argument === '--input') {
      options.input = nextValue ?? ''
      index += 1
      continue
    }

    if (argument === '--local-dir') {
      options.localDir = nextValue ?? ''
      index += 1
      continue
    }

    if (argument === '--blob-prefix') {
      options.blobPrefix = nextValue ?? ''
      index += 1
      continue
    }

    if (argument === '--name-prefix') {
      options.namePrefix = nextValue ?? ''
      index += 1
      continue
    }

    if (argument === '--durations') {
      options.durations = (nextValue ?? '')
        .split(',')
        .map((value) => Number.parseFloat(value.trim()))
        .filter((value) => Number.isFinite(value) && value > 0)
      index += 1
      continue
    }

    if (argument === '--starts') {
      options.starts = (nextValue ?? '')
        .split(',')
        .map((value) => Number.parseFloat(value.trim()))
        .filter((value) => Number.isFinite(value) && value >= 0)
      index += 1
      continue
    }

    if (argument === '--skip-upload') {
      options.upload = false
    }
  }

  return options
}

function loadDotEnvFile(contents) {
  for (const line of contents.split(/\r?\n/)) {
    const trimmedLine = line.trim()

    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue
    }

    const separatorIndex = trimmedLine.indexOf('=')
    if (separatorIndex < 0) {
      continue
    }

    const key = trimmedLine.slice(0, separatorIndex).trim()
    const rawValue = trimmedLine.slice(separatorIndex + 1).trim()
    const normalizedValue = rawValue.replace(/^['"]|['"]$/g, '')

    if (!(key in process.env)) {
      process.env[key] = normalizedValue
    }
  }
}

async function loadLocalEnv() {
  for (const envPath of [path.join(ROOT_DIR, '.env.local'), path.join(ROOT_DIR, '.env')]) {
    try {
      const contents = await fs.readFile(envPath, 'utf8')
      loadDotEnvFile(contents)
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw error
      }
    }
  }
}

function getId3v2Size(buffer) {
  if (buffer.length < 10 || buffer.toString('latin1', 0, 3) !== 'ID3') {
    return 0
  }

  return (
    10 +
    ((buffer[6] & 0x7f) << 21) +
    ((buffer[7] & 0x7f) << 14) +
    ((buffer[8] & 0x7f) << 7) +
    (buffer[9] & 0x7f)
  )
}

const MPEG1_LAYER3_BITRATES = [
  null,
  32,
  40,
  48,
  56,
  64,
  80,
  96,
  112,
  128,
  160,
  192,
  224,
  256,
  320,
  null,
]
const MPEG2_LAYER3_BITRATES = [
  null,
  8,
  16,
  24,
  32,
  40,
  48,
  56,
  64,
  80,
  96,
  112,
  128,
  144,
  160,
  null,
]
const MPEG_SAMPLE_RATES = {
  0: [11025, 12000, 8000, null],
  2: [22050, 24000, 16000, null],
  3: [44100, 48000, 32000, null],
}

function parseMp3FrameHeader(buffer, offset) {
  if (
    offset + 4 > buffer.length ||
    buffer[offset] !== 0xff ||
    (buffer[offset + 1] & 0xe0) !== 0xe0
  ) {
    return null
  }

  const header = buffer.readUInt32BE(offset)
  const versionBits = (header >> 19) & 0x03
  const layerBits = (header >> 17) & 0x03
  const bitrateIndex = (header >> 12) & 0x0f
  const sampleRateIndex = (header >> 10) & 0x03
  const paddingBit = (header >> 9) & 0x01

  if (versionBits === 1 || layerBits !== 1) {
    return null
  }

  const bitrateTable =
    versionBits === 3 ? MPEG1_LAYER3_BITRATES : MPEG2_LAYER3_BITRATES
  const bitrateKbps = bitrateTable[bitrateIndex]
  const sampleRate = MPEG_SAMPLE_RATES[versionBits]?.[sampleRateIndex]

  if (!bitrateKbps || !sampleRate) {
    return null
  }

  const isMpeg1 = versionBits === 3
  const frameLength = Math.floor(
    ((isMpeg1 ? 144 : 72) * bitrateKbps * 1000) / sampleRate + paddingBit,
  )

  return {
    frameLength,
    sampleCount: isMpeg1 ? 1152 : 576,
    sampleRate,
  }
}

function clipMp3Range(buffer, startSeconds, targetSeconds) {
  const id3Size = getId3v2Size(buffer)
  let offset = id3Size
  let startOffset = id3Size
  let endOffset = id3Size
  let elapsed = 0
  let actualStart = 0
  let duration = 0
  let frameCount = 0
  let foundStart = false

  while (offset + 4 <= buffer.length) {
    const frame = parseMp3FrameHeader(buffer, offset)

    if (!frame) {
      offset += 1
      continue
    }

    if (offset + frame.frameLength > buffer.length) {
      break
    }

    const frameDuration = frame.sampleCount / frame.sampleRate

    if (!foundStart && elapsed + frameDuration <= startSeconds) {
      elapsed += frameDuration
      offset += frame.frameLength
      continue
    }

    if (!foundStart) {
      foundStart = true
      startOffset = offset
      endOffset = offset
      actualStart = elapsed
    }

    if (duration >= targetSeconds) {
      break
    }

    endOffset = offset + frame.frameLength
    duration += frameDuration
    elapsed += frameDuration
    offset = endOffset
    frameCount += 1
  }

  if (frameCount === 0) {
    throw new Error('No MP3 frames found in input file.')
  }

  return {
    buffer: Buffer.concat([
      buffer.subarray(0, id3Size),
      buffer.subarray(startOffset, endOffset),
    ]),
    actualStart,
    duration,
    frameCount,
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))

  if (!options.input || !options.localDir || !options.blobPrefix || !options.namePrefix) {
    throw new Error(
      'Usage: node scripts/clip-mp3-prefix-candidates.mjs --input file.mp3 --local-dir dir --blob-prefix audio/... --name-prefix name [--starts 0.24,0.288] --durations 0.36,0.408',
    )
  }

  if (options.durations.length === 0) {
    throw new Error('--durations must contain at least one positive duration in seconds.')
  }

  await loadLocalEnv()

  const token = process.env.BLOB_READ_WRITE_TOKEN
  const shouldUpload = options.upload && Boolean(token)
  const input = await fs.readFile(options.input)
  const localDir = path.resolve(options.localDir)
  const starts = options.starts.length > 0 ? options.starts : [0]
  const includeStartInName = starts.length > 1 || starts[0] > 0

  await fs.mkdir(localDir, { recursive: true })

  const results = []

  for (const start of starts) {
    for (const targetDuration of options.durations) {
      const clip = clipMp3Range(input, start, targetDuration)
      const startMilliseconds = Math.round(clip.actualStart * 1000)
      const durationMilliseconds = Math.round(clip.duration * 1000)
      const filename = includeStartInName
        ? `${options.namePrefix}_${startMilliseconds}ms_start_${durationMilliseconds}ms.mp3`
        : `${options.namePrefix}_${durationMilliseconds}ms.mp3`
      const localPath = path.join(localDir, filename)
      const pathname = `${options.blobPrefix.replace(/\/$/, '')}/${filename}`

      await fs.writeFile(localPath, clip.buffer)

      let url = ''
      if (shouldUpload) {
        const blob = await put(pathname, clip.buffer, {
          access: 'public',
          contentType: 'audio/mpeg',
          addRandomSuffix: false,
          allowOverwrite: true,
          token,
        })
        url = blob.url
      }

      results.push({
        requestedStart: start,
        actualStart: clip.actualStart,
        requestedDuration: targetDuration,
        actualDuration: clip.duration,
        frameCount: clip.frameCount,
        localPath,
        pathname,
        url,
      })
    }
  }

  console.log(JSON.stringify(results, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
