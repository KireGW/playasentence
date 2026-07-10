import fs from 'node:fs/promises'
import { execFile } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { put } from '@vercel/blob'
import {
  buildPuzzleAudioPath,
  getAcceptedOrderKey,
  inferAudioBlobBaseUrl,
} from '../src/audioPaths.js'

const ROOT_DIR = path.resolve(import.meta.dirname, '..')
const DEFAULT_OUTPUT_DIR = path.join(ROOT_DIR, 'generated')
const DEFAULT_MODEL = 'gpt-4o-mini-tts'
const AUDIO_SIGNAL_SCRIPT = path.join(ROOT_DIR, 'scripts', 'analyze-audio-signal.swift')
const DEFAULT_AUDIO_TARGET_RMS_DB = -24
const DEFAULT_AUDIO_PEAK_CEILING_DB = -1
const DEFAULT_AUDIO_NORMALIZATION_TOLERANCE_DB = 2
const DEFAULT_AUDIO_MAX_GAIN_DB = 9
const DEFAULT_AUDIO_MIN_GAIN_DB = -9
const DEFAULT_SILENCE_PEAK_DB = -55
const DEFAULT_SILENCE_RMS_DB = -60
const DEFAULT_AUDIO_RETRIES = 3
const MP3_GAIN_STEP_DB = 1.5

const execFileAsync = promisify(execFile)

const LANGUAGE_AUDIO_PRESETS = {
  swedish: {
    language: 'sv',
    defaultVoice: 'marin',
    instructions:
      'Speak clear standard Swedish (sv-SE) in a calm, natural, highly intelligible teaching voice. Treat all words as Swedish unless pronunciation guidance says otherwise. Keep a steady pace, crisp consonants, and short natural pauses. Avoid exaggerated emotion and avoid sounding robotic.',
  },
}

function parseArgs(argv) {
  const options = {
    language: '',
    level: '',
    puzzle: '',
    segment: null,
    voice: '',
    model: DEFAULT_MODEL,
    outDir: DEFAULT_OUTPUT_DIR,
    dryRun: false,
    skipUpload: false,
    overwrite: false,
    fullSentencesOnly: false,
    cleanOrphans: false,
    validateAudio: true,
    normalizeAudio: true,
    audioTargetRmsDb: DEFAULT_AUDIO_TARGET_RMS_DB,
    audioPeakCeilingDb: DEFAULT_AUDIO_PEAK_CEILING_DB,
    audioNormalizationToleranceDb: DEFAULT_AUDIO_NORMALIZATION_TOLERANCE_DB,
    audioMaxGainDb: DEFAULT_AUDIO_MAX_GAIN_DB,
    audioMinGainDb: DEFAULT_AUDIO_MIN_GAIN_DB,
    silencePeakDb: DEFAULT_SILENCE_PEAK_DB,
    silenceRmsDb: DEFAULT_SILENCE_RMS_DB,
    maxAudioRetries: DEFAULT_AUDIO_RETRIES,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    const nextValue = argv[index + 1]

    if (argument === '--language') {
      options.language = nextValue ?? ''
      index += 1
      continue
    }

    if (argument === '--level') {
      options.level = nextValue ?? ''
      index += 1
      continue
    }

    if (argument === '--voice') {
      options.voice = nextValue ?? ''
      index += 1
      continue
    }

    if (argument === '--puzzle') {
      options.puzzle = nextValue ?? ''
      index += 1
      continue
    }

    if (argument === '--segment') {
      const segment = Number.parseInt(nextValue ?? '', 10)
      options.segment = Number.isInteger(segment) && segment > 0 ? segment : null
      index += 1
      continue
    }

    if (argument === '--model') {
      options.model = nextValue ?? DEFAULT_MODEL
      index += 1
      continue
    }

    if (argument === '--out-dir') {
      options.outDir = path.resolve(ROOT_DIR, nextValue ?? 'generated')
      index += 1
      continue
    }

    if (argument === '--dry-run') {
      options.dryRun = true
      continue
    }

    if (argument === '--skip-upload') {
      options.skipUpload = true
      continue
    }

    if (argument === '--overwrite') {
      options.overwrite = true
      continue
    }

    if (argument === '--full-sentences-only') {
      options.fullSentencesOnly = true
      continue
    }

    if (argument === '--clean-orphans') {
      options.cleanOrphans = true
      continue
    }

    if (argument === '--no-audio-validation') {
      options.validateAudio = false
      continue
    }

    if (argument === '--no-normalize-audio') {
      options.normalizeAudio = false
      continue
    }

    if (argument === '--target-rms-db') {
      const value = Number.parseFloat(nextValue ?? '')
      if (Number.isFinite(value)) {
        options.audioTargetRmsDb = value
      }
      index += 1
      continue
    }

    if (argument === '--peak-ceiling-db') {
      const value = Number.parseFloat(nextValue ?? '')
      if (Number.isFinite(value)) {
        options.audioPeakCeilingDb = value
      }
      index += 1
      continue
    }

    if (argument === '--normalization-tolerance-db') {
      const value = Number.parseFloat(nextValue ?? '')
      if (Number.isFinite(value) && value >= 0) {
        options.audioNormalizationToleranceDb = value
      }
      index += 1
      continue
    }

    if (argument === '--max-normalization-gain-db') {
      const value = Number.parseFloat(nextValue ?? '')
      if (Number.isFinite(value) && value >= 0) {
        options.audioMaxGainDb = value
      }
      index += 1
      continue
    }

    if (argument === '--min-normalization-gain-db') {
      const value = Number.parseFloat(nextValue ?? '')
      if (Number.isFinite(value) && value <= 0) {
        options.audioMinGainDb = value
      }
      index += 1
      continue
    }

    if (argument === '--silent-peak-db') {
      const value = Number.parseFloat(nextValue ?? '')
      if (Number.isFinite(value)) {
        options.silencePeakDb = value
      }
      index += 1
      continue
    }

    if (argument === '--silent-rms-db') {
      const value = Number.parseFloat(nextValue ?? '')
      if (Number.isFinite(value)) {
        options.silenceRmsDb = value
      }
      index += 1
      continue
    }

    if (argument === '--max-audio-retries') {
      const value = Number.parseInt(nextValue ?? '', 10)
      if (Number.isInteger(value) && value > 0) {
        options.maxAudioRetries = value
      }
      index += 1
    }
  }

  return options
}

function parseCsvLine(line) {
  const values = []
  let current = ''
  let insideQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]

    if (character === '"') {
      if (insideQuotes && line[index + 1] === '"') {
        current += '"'
        index += 1
      } else {
        insideQuotes = !insideQuotes
      }
      continue
    }

    if (character === ',' && !insideQuotes) {
      values.push(current)
      current = ''
      continue
    }

    current += character
  }

  values.push(current)
  return values
}

function parsePuzzleCsv(rawCsv) {
  const [headerLine, ...rowLines] = rawCsv.trim().split(/\r?\n/)
  const headers = parseCsvLine(headerLine)

  return rowLines
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const values = parseCsvLine(line)
      return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']))
    })
}

function loadDotEnvFile(fileContents) {
  for (const line of fileContents.split(/\r?\n/)) {
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
  const envPaths = [
    path.join(ROOT_DIR, '.env.local'),
    path.join(ROOT_DIR, '.env'),
  ]

  for (const envPath of envPaths) {
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

async function readPuzzles(languageId, level) {
  const csvPath = path.join(ROOT_DIR, 'src', 'data', 'puzzles', `${languageId}.csv`)
  const rawCsv = await fs.readFile(csvPath, 'utf8')
  const rows = parsePuzzleCsv(rawCsv)

  return rows
    .filter((row) => row.active?.toUpperCase() === 'TRUE' && row.level === level)
    .map((row) => ({
      id: row.id,
      level: row.level,
      fullSpeechText: row.full_speech?.trim() || '',
      fullSpeechInstruction: row.full_speech_instruction?.trim() || '',
      acceptedOrderSentences: row.accepted_order_sentences
        ?.split('|')
        .map((sentence) => sentence.trim()) ?? [],
      acceptedOrders: row.accepted_orders
        ?.split('|')
        .map((order) =>
          order
            .split('-')
            .map((value) => Number.parseInt(value, 10) - 1)
            .filter((value) => Number.isInteger(value) && value >= 0),
        )
        .filter((order) => order.length > 0) ?? [],
      segments: Array.from({ length: 8 }, (_, index) => index + 1)
        .map((position) => {
          const text = row[`segment_${position}`]?.trim()
          if (!text) {
            return null
          }

          const speechText = row[`speech_${position}`]?.trim()
          const speechInstruction = row[`speech_instruction_${position}`]?.trim()
          return {
            position,
            text,
            speechText: speechText || text,
            speechInstruction: speechInstruction || '',
          }
        })
        .filter(Boolean),
    }))
}

function formatSentenceForSpeech(segments) {
  const endingPunctuation =
    segments
      .slice()
      .reverse()
      .map((segment) => segment.text.trim().match(/[.!?]+$/)?.[0])
      .find(Boolean) ?? '.'
  const rawSentence = segments
    .map((segment) => segment.text.replace(/[.!?]+$/g, ''))
    .join(' ')
    .replace(/,+$/g, '')
    .trim()
  if (!rawSentence) {
    return ''
  }

  const sentence = rawSentence.charAt(0).toUpperCase() + rawSentence.slice(1)
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}${endingPunctuation}`
}

function buildSegmentInstructions(
  baseInstructions,
  sentenceText,
  segmentText,
  speechInstruction = '',
) {
  const contextualInstruction = `You are recording one isolated segment from the full sentence "${sentenceText}". Pronounce only the target segment "${segmentText}", but use the full sentence to infer the correct language, meaning, and pronunciation. Do not say any extra words before or after the target segment.`
  const explicitInstruction = speechInstruction
    ? ` Additional pronunciation guidance for this segment: ${speechInstruction}`
    : ''

  return `${baseInstructions} ${contextualInstruction}${explicitInstruction}`
}

function buildFullSentenceInstructions(
  baseInstructions,
  sentenceText,
  speechInstruction = '',
) {
  const contextualInstruction = `You are recording the full Swedish sentence "${sentenceText}".`
  const explicitInstruction = speechInstruction
    ? ` Additional pronunciation guidance for this full sentence: ${speechInstruction}`
    : ''

  return `${baseInstructions} ${contextualInstruction}${explicitInstruction}`
}

async function synthesizeSpeechMp3({ apiKey, model, voice, language = '', instructions, input }) {
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      voice,
      ...(language ? { language } : {}),
      input,
      instructions,
      response_format: 'mp3',
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenAI TTS failed (${response.status}): ${errorText}`)
  }

  return Buffer.from(await response.arrayBuffer())
}

function roundAudioMetric(value, decimals = 3) {
  if (!Number.isFinite(value)) {
    return value
  }

  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function formatAudioDb(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)} dB` : 'n/a'
}

function getAudioAnalysisForManifest(analysis, normalizationGainDb = 0) {
  if (!analysis) {
    return null
  }

  return {
    duration: roundAudioMetric(analysis.duration, 3),
    peakDb: roundAudioMetric(analysis.peakDb, 1),
    rmsDb: roundAudioMetric(analysis.rmsDb, 1),
    normalizationGainDb: roundAudioMetric(normalizationGainDb, 1),
  }
}

async function analyzeAudioFiles(filePaths) {
  const { stdout } = await execFileAsync('swift', [AUDIO_SIGNAL_SCRIPT, ...filePaths], {
    maxBuffer: 1024 * 1024 * 10,
  })
  const results = JSON.parse(stdout)
  const erroredResult = results.find((result) => result.error)

  if (erroredResult) {
    throw new Error(`Audio analysis failed for ${erroredResult.path}: ${erroredResult.error}`)
  }

  return results
}

async function analyzeAudioBuffer(buffer) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'playasentence-audio-'))
  const tmpPath = path.join(tmpDir, 'audio.mp3')

  try {
    await fs.writeFile(tmpPath, buffer)
    const [analysis] = await analyzeAudioFiles([tmpPath])
    return analysis
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true })
  }
}

function isNearSilentAudio(analysis, options) {
  return (
    analysis.peakDb < options.silencePeakDb ||
    analysis.rmsDb < options.silenceRmsDb
  )
}

function getId3v2Size(buffer) {
  if (
    buffer.length < 10 ||
    buffer[0] !== 0x49 ||
    buffer[1] !== 0x44 ||
    buffer[2] !== 0x33
  ) {
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

function readBits(buffer, bitOffset, bitLength) {
  let value = 0

  for (let bitIndex = 0; bitIndex < bitLength; bitIndex += 1) {
    const absoluteBitOffset = bitOffset + bitIndex
    const byte = buffer[absoluteBitOffset >> 3]
    const bit = (byte >> (7 - (absoluteBitOffset & 7))) & 1
    value = (value << 1) | bit
  }

  return value
}

function writeBits(buffer, bitOffset, bitLength, value) {
  for (let bitIndex = 0; bitIndex < bitLength; bitIndex += 1) {
    const absoluteBitOffset = bitOffset + bitIndex
    const byteOffset = absoluteBitOffset >> 3
    const bitMask = 1 << (7 - (absoluteBitOffset & 7))
    const bit = (value >> (bitLength - bitIndex - 1)) & 1

    if (bit) {
      buffer[byteOffset] |= bitMask
    } else {
      buffer[byteOffset] &= ~bitMask
    }
  }
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
  const protectionBit = (header >> 16) & 0x01
  const bitrateIndex = (header >> 12) & 0x0f
  const sampleRateIndex = (header >> 10) & 0x03
  const paddingBit = (header >> 9) & 0x01
  const channelMode = (header >> 6) & 0x03

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
  const channels = channelMode === 3 ? 1 : 2
  const crcBytes = protectionBit === 0 ? 2 : 0
  const sideInfoStart = offset + 4 + crcBytes
  const sideInfoSize = isMpeg1
    ? channels === 1
      ? 17
      : 32
    : channels === 1
      ? 9
      : 17

  return {
    channels,
    frameLength,
    isMpeg1,
    sideInfoSize,
    sideInfoStart,
  }
}

function adjustMp3GlobalGain(buffer, gainDb) {
  const gainSteps = Math.round(gainDb / MP3_GAIN_STEP_DB)

  if (gainSteps === 0) {
    return {
      buffer,
      appliedGainDb: 0,
      framesAdjusted: 0,
    }
  }

  const output = Buffer.from(buffer)
  let offset = getId3v2Size(output)
  let framesAdjusted = 0
  let sawFrame = false

  while (offset + 4 <= output.length) {
    const frame = parseMp3FrameHeader(output, offset)

    if (!frame) {
      offset += 1
      continue
    }

    sawFrame = true

    if (
      frame.frameLength <= 0 ||
      offset + frame.frameLength > output.length ||
      frame.sideInfoStart + frame.sideInfoSize > offset + frame.frameLength
    ) {
      throw new Error('Unsupported or truncated MP3 frame while normalizing audio.')
    }

    const frameBitStart = frame.sideInfoStart * 8

    if (frame.isMpeg1) {
      const privateBits = frame.channels === 1 ? 5 : 3
      const scfsiBits = frame.channels * 4
      const channelInfoBits = 59
      const firstChannelBitOffset = frameBitStart + 9 + privateBits + scfsiBits

      for (let granuleIndex = 0; granuleIndex < 2; granuleIndex += 1) {
        for (let channelIndex = 0; channelIndex < frame.channels; channelIndex += 1) {
          const globalGainBitOffset =
            firstChannelBitOffset +
            (granuleIndex * frame.channels + channelIndex) * channelInfoBits +
            21
          const currentGain = readBits(output, globalGainBitOffset, 8)
          const nextGain = Math.max(0, Math.min(255, currentGain + gainSteps))
          writeBits(output, globalGainBitOffset, 8, nextGain)
        }
      }
    } else {
      const privateBits = frame.channels === 1 ? 1 : 2
      const channelInfoBits = 63
      const firstChannelBitOffset = frameBitStart + 8 + privateBits

      for (let channelIndex = 0; channelIndex < frame.channels; channelIndex += 1) {
        const globalGainBitOffset =
          firstChannelBitOffset + channelIndex * channelInfoBits + 21
        const currentGain = readBits(output, globalGainBitOffset, 8)
        const nextGain = Math.max(0, Math.min(255, currentGain + gainSteps))
        writeBits(output, globalGainBitOffset, 8, nextGain)
      }
    }

    framesAdjusted += 1
    offset += frame.frameLength
  }

  if (!sawFrame || framesAdjusted === 0) {
    throw new Error('No MP3 frames found while normalizing audio.')
  }

  return {
    buffer: output,
    appliedGainDb: gainSteps * MP3_GAIN_STEP_DB,
    framesAdjusted,
  }
}

function calculateNormalizationGainDb(analysis, options) {
  const desiredGainDb = options.audioTargetRmsDb - analysis.rmsDb
  const peakLimitedGainDb = Math.min(
    desiredGainDb,
    options.audioPeakCeilingDb - analysis.peakDb,
  )
  const clampedGainDb = Math.max(
    options.audioMinGainDb,
    Math.min(options.audioMaxGainDb, peakLimitedGainDb),
  )

  if (Math.abs(clampedGainDb) < options.audioNormalizationToleranceDb) {
    return 0
  }

  return Math.round(clampedGainDb / MP3_GAIN_STEP_DB) * MP3_GAIN_STEP_DB
}

async function processGeneratedAudioBuffer(buffer, options) {
  if (!options.validateAudio && !options.normalizeAudio) {
    return {
      buffer,
      analysis: null,
      normalizationGainDb: 0,
    }
  }

  const initialAnalysis = await analyzeAudioBuffer(buffer)

  if (options.validateAudio && isNearSilentAudio(initialAnalysis, options)) {
    throw new Error(
      `Generated audio is near-silent (peak ${formatAudioDb(
        initialAnalysis.peakDb,
      )}, rms ${formatAudioDb(initialAnalysis.rmsDb)}).`,
    )
  }

  if (!options.normalizeAudio) {
    return {
      buffer,
      analysis: initialAnalysis,
      normalizationGainDb: 0,
    }
  }

  const normalizationGainDb = calculateNormalizationGainDb(initialAnalysis, options)

  if (normalizationGainDb === 0) {
    return {
      buffer,
      analysis: initialAnalysis,
      normalizationGainDb: 0,
    }
  }

  const normalized = adjustMp3GlobalGain(buffer, normalizationGainDb)
  const normalizedAnalysis = await analyzeAudioBuffer(normalized.buffer)

  if (options.validateAudio && isNearSilentAudio(normalizedAnalysis, options)) {
    throw new Error(
      `Normalized audio is near-silent (peak ${formatAudioDb(
        normalizedAnalysis.peakDb,
      )}, rms ${formatAudioDb(normalizedAnalysis.rmsDb)}).`,
    )
  }

  return {
    buffer: normalized.buffer,
    analysis: normalizedAnalysis,
    normalizationGainDb: normalized.appliedGainDb,
  }
}

async function synthesizeValidatedSpeechMp3(synthesisOptions, options) {
  const attempts = options.validateAudio ? options.maxAudioRetries : 1
  let lastError = null

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const buffer = await synthesizeSpeechMp3(synthesisOptions)
      const processed = await processGeneratedAudioBuffer(buffer, options)

      if (processed.normalizationGainDb !== 0) {
        console.log(
          `    normalized ${processed.normalizationGainDb > 0 ? '+' : ''}${processed.normalizationGainDb.toFixed(
            1,
          )} dB (rms ${formatAudioDb(processed.analysis.rmsDb)})`,
        )
      }

      return processed
    } catch (error) {
      lastError = error

      if (attempt < attempts) {
        console.warn(`    retrying audio (${attempt}/${attempts}): ${error.message}`)
      }
    }
  }

  throw lastError
}

async function writeLocalAudioFile(filePath, buffer) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, buffer)
}

async function uploadAudioFile(pathname, buffer, token, overwrite) {
  return put(pathname, buffer, {
    access: 'public',
    contentType: 'audio/mpeg',
    addRandomSuffix: false,
    token,
    ...(overwrite ? { allowOverwrite: true } : {}),
  })
}

async function writeManifest(manifestPath, manifest) {
  await fs.mkdir(path.dirname(manifestPath), { recursive: true })
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')
}

function getPuzzleAcceptedOrders(puzzle) {
  return puzzle.acceptedOrders.length > 0
    ? puzzle.acceptedOrders
    : [puzzle.segments.map((_, index) => index)]
}

function buildExpectedAudioPathnames(puzzles, languageId, level) {
  const expectedPathnames = new Set()

  for (const puzzle of puzzles) {
    for (const segment of puzzle.segments) {
      expectedPathnames.add(
        buildPuzzleAudioPath({
          languageId,
          level,
          puzzleId: puzzle.id,
          segmentIndex: segment.position,
        }),
      )
    }

    for (const [orderIndex, acceptedOrder] of getPuzzleAcceptedOrders(puzzle).entries()) {
      const orderedSegments = acceptedOrder
        .map((segmentIndex) => puzzle.segments[segmentIndex])
        .filter(Boolean)

      if (orderedSegments.length !== puzzle.segments.length) {
        continue
      }

      expectedPathnames.add(
        buildPuzzleAudioPath({
          languageId,
          level,
          puzzleId: puzzle.id,
          isFullSentence: true,
          acceptedOrderKey:
            orderIndex === 0
              ? ''
              : getAcceptedOrderKey(acceptedOrder.map((segmentIndex) => segmentIndex + 1)),
        }),
      )
    }
  }

  return expectedPathnames
}

async function cleanLocalOrphanAudioFiles(outDir, languageId, level, expectedPathnames) {
  const normalizedLevel = level.toLowerCase()
  const audioDir = path.join(outDir, 'audio', languageId, normalizedLevel)
  let entries = []

  try {
    entries = await fs.readdir(audioDir, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return []
    }
    throw error
  }

  const removedPathnames = []

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.mp3')) {
      continue
    }

    const pathname = `audio/${languageId}/${normalizedLevel}/${entry.name}`
    if (expectedPathnames.has(pathname)) {
      continue
    }

    await fs.rm(path.join(audioDir, entry.name))
    removedPathnames.push(pathname)
  }

  return removedPathnames
}

function collectGeneratedAudioQuality(manifest) {
  const files = []

  for (const puzzle of manifest.puzzles) {
    for (const segment of puzzle.segments ?? []) {
      if (segment.audioAnalysis) {
        files.push({
          kind: `segment ${segment.position}`,
          puzzleId: puzzle.id,
          pathname: segment.pathname,
          audioAnalysis: segment.audioAnalysis,
        })
      }
    }

    for (const fullSentence of puzzle.fullSentences ?? []) {
      if (fullSentence.audioAnalysis) {
        files.push({
          kind: fullSentence.orderKey
            ? `full sentence ${fullSentence.orderKey}`
            : 'full sentence',
          puzzleId: puzzle.id,
          pathname: fullSentence.pathname,
          audioAnalysis: fullSentence.audioAnalysis,
        })
      }
    }
  }

  const normalizedFiles = files.filter(
    (file) => file.audioAnalysis.normalizationGainDb !== 0,
  )
  const warningFiles = files.filter(
    (file) =>
      file.audioAnalysis.peakDb < manifest.audioQuality.silencePeakDb + 6 ||
      file.audioAnalysis.rmsDb < manifest.audioQuality.silenceRmsDb + 6,
  )

  return {
    files,
    normalizedFiles,
    warningFiles,
  }
}

function printGeneratedAudioQualitySummary(manifest) {
  const { files, normalizedFiles, warningFiles } = collectGeneratedAudioQuality(manifest)

  if (files.length === 0) {
    return
  }

  console.log(
    `\nAudio quality checked for ${files.length} file(s); ${normalizedFiles.length} normalized.`,
  )

  if (normalizedFiles.length > 0) {
    normalizedFiles.slice(0, 20).forEach((file) => {
      const gainDb = file.audioAnalysis.normalizationGainDb
      console.log(
        `  ${gainDb > 0 ? '+' : ''}${gainDb.toFixed(1)} dB ${file.pathname}`,
      )
    })

    if (normalizedFiles.length > 20) {
      console.log(`  ...and ${normalizedFiles.length - 20} more normalized file(s).`)
    }
  }

  if (warningFiles.length > 0) {
    console.warn('\nAudio quality warnings:')
    warningFiles.forEach((file) => {
      console.warn(
        `  ${file.pathname} (${file.kind}) peak ${formatAudioDb(
          file.audioAnalysis.peakDb,
        )}, rms ${formatAudioDb(file.audioAnalysis.rmsDb)}`,
      )
    })
  }
}

async function main() {
  await loadLocalEnv()

  const options = parseArgs(process.argv.slice(2))
  if (!options.language || !options.level) {
    throw new Error(
      'Usage: npm run audio:csv -- --language swedish --level A1 [--puzzle sv_a1_010] [--segment 5] [--full-sentences-only] [--clean-orphans] [--dry-run] [--skip-upload] [--overwrite] [--voice marin] [--no-audio-validation] [--no-normalize-audio] [--target-rms-db -24]',
    )
  }

  if (options.segment && options.fullSentencesOnly) {
    throw new Error('--segment cannot be combined with --full-sentences-only.')
  }

  const preset = LANGUAGE_AUDIO_PRESETS[options.language]
  if (!preset) {
    throw new Error(`No audio preset is configured for language "${options.language}".`)
  }

  const allPuzzles = await readPuzzles(options.language, options.level)
  const puzzles = options.puzzle
    ? allPuzzles.filter((puzzle) => puzzle.id === options.puzzle)
    : allPuzzles
  if (puzzles.length === 0) {
    throw new Error(
      options.puzzle
        ? `No active puzzle "${options.puzzle}" found for ${options.language}/${options.level}.`
        : `No active puzzles found for ${options.language}/${options.level}.`,
    )
  }

  const apiKey = process.env.OPENAI_API_KEY
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN
  const shouldUpload = !options.skipUpload && Boolean(blobToken)
  const selectedVoice = options.voice || preset.defaultVoice

  if (!options.dryRun && !apiKey) {
    throw new Error('OPENAI_API_KEY is required to generate audio.')
  }

  const manifest = {
    language: options.language,
    level: options.level,
    model: options.model,
    voice: selectedVoice,
    uploaded: shouldUpload,
    audioQuality: {
      validated: options.validateAudio,
      normalized: options.normalizeAudio,
      targetRmsDb: options.audioTargetRmsDb,
      peakCeilingDb: options.audioPeakCeilingDb,
      normalizationToleranceDb: options.audioNormalizationToleranceDb,
      maxGainDb: options.audioMaxGainDb,
      minGainDb: options.audioMinGainDb,
      silencePeakDb: options.silencePeakDb,
      silenceRmsDb: options.silenceRmsDb,
      maxRetries: options.maxAudioRetries,
    },
    generatedAt: new Date().toISOString(),
    puzzles: [],
  }

  console.log(
    `Preparing ${puzzles.length} puzzle(s) for ${options.language}/${options.level} with voice "${selectedVoice}".`,
  )

  let inferredBaseUrl = ''

  for (const puzzle of puzzles) {
    const canonicalSentenceText = formatSentenceForSpeech(puzzle.segments)
    const puzzleManifest = {
      id: puzzle.id,
      segments: [],
      fullSentence: null,
      fullSentences: [],
    }

    console.log(`\n${puzzle.id}`)

    if (!options.fullSentencesOnly) {
      for (const segment of puzzle.segments) {
        const pathname = buildPuzzleAudioPath({
          languageId: options.language,
          level: options.level,
          puzzleId: puzzle.id,
          segmentIndex: segment.position,
        })
        const localFilePath = path.join(options.outDir, pathname)

        if (options.segment && segment.position !== options.segment) {
          continue
        }

        console.log(`  segment ${segment.position}: ${segment.speechText}`)

        if (!options.dryRun) {
          const processedAudio = await synthesizeValidatedSpeechMp3(
            {
              apiKey,
              model: options.model,
              voice: selectedVoice,
              language: preset.language,
              instructions: buildSegmentInstructions(
                preset.instructions,
                canonicalSentenceText,
                segment.text,
                segment.speechInstruction,
              ),
              input: segment.speechText,
            },
            options,
          )
          const { buffer } = processedAudio
          const audioAnalysis = getAudioAnalysisForManifest(
            processedAudio.analysis,
            processedAudio.normalizationGainDb,
          )

          await writeLocalAudioFile(localFilePath, buffer)

          if (shouldUpload) {
            const blob = await uploadAudioFile(pathname, buffer, blobToken, options.overwrite)
            inferredBaseUrl ||= inferAudioBlobBaseUrl(blob.url)
            puzzleManifest.segments.push({
              position: segment.position,
              text: segment.text,
              speechText: segment.speechText,
              pathname,
              url: blob.url,
              ...(audioAnalysis ? { audioAnalysis } : {}),
            })
          } else {
            puzzleManifest.segments.push({
              position: segment.position,
              text: segment.text,
              speechText: segment.speechText,
              pathname,
              localFilePath,
              ...(audioAnalysis ? { audioAnalysis } : {}),
            })
          }
        } else {
          puzzleManifest.segments.push({
            position: segment.position,
            text: segment.text,
            speechText: segment.speechText,
            pathname,
            localFilePath,
          })
        }
      }
    }

    const acceptedOrders = getPuzzleAcceptedOrders(puzzle)

    for (const [orderIndex, acceptedOrder] of acceptedOrders.entries()) {
      if (options.segment) {
        break
      }

      const orderedSegments = acceptedOrder
        .map((segmentIndex) => puzzle.segments[segmentIndex])
        .filter(Boolean)

      if (orderedSegments.length !== puzzle.segments.length) {
        continue
      }

      const configuredSentenceText = puzzle.acceptedOrderSentences[orderIndex]?.trim()
      const sentenceText = configuredSentenceText || formatSentenceForSpeech(orderedSegments)
      const speechSentenceText =
        orderIndex === 0 && puzzle.fullSpeechText ? puzzle.fullSpeechText : sentenceText
      const orderKey = getAcceptedOrderKey(
        acceptedOrder.map((segmentIndex) => segmentIndex + 1),
      )
      const fullSentencePathname = buildPuzzleAudioPath({
        languageId: options.language,
        level: options.level,
        puzzleId: puzzle.id,
        isFullSentence: true,
        acceptedOrderKey: orderIndex === 0 ? '' : orderKey,
      })
      const fullSentenceLocalPath = path.join(options.outDir, fullSentencePathname)

      console.log(
        `  full sentence${orderIndex === 0 ? '' : ` (${orderKey})`}: ${speechSentenceText}`,
      )

      if (!options.dryRun) {
        const processedAudio = await synthesizeValidatedSpeechMp3(
          {
            apiKey,
            model: options.model,
            voice: selectedVoice,
            language: preset.language,
            instructions: buildFullSentenceInstructions(
              preset.instructions,
              sentenceText,
              orderIndex === 0 ? puzzle.fullSpeechInstruction : '',
            ),
            input: speechSentenceText,
          },
          options,
        )
        const { buffer } = processedAudio
        const audioAnalysis = getAudioAnalysisForManifest(
          processedAudio.analysis,
          processedAudio.normalizationGainDb,
        )

        await writeLocalAudioFile(fullSentenceLocalPath, buffer)

        if (shouldUpload) {
          const blob = await uploadAudioFile(
            fullSentencePathname,
            buffer,
            blobToken,
            options.overwrite,
          )
          inferredBaseUrl ||= inferAudioBlobBaseUrl(blob.url)
          puzzleManifest.fullSentences.push({
            orderKey,
            text: sentenceText,
            pathname: fullSentencePathname,
            url: blob.url,
            ...(audioAnalysis ? { audioAnalysis } : {}),
          })
        } else {
          puzzleManifest.fullSentences.push({
            orderKey,
            text: sentenceText,
            pathname: fullSentencePathname,
            localFilePath: fullSentenceLocalPath,
            ...(audioAnalysis ? { audioAnalysis } : {}),
          })
        }
      } else {
        puzzleManifest.fullSentences.push({
          orderKey,
          text: sentenceText,
          pathname: fullSentencePathname,
          localFilePath: fullSentenceLocalPath,
        })
      }

      if (orderIndex === 0) {
        puzzleManifest.fullSentence = puzzleManifest.fullSentences.at(-1)
      }
    }

    manifest.puzzles.push(puzzleManifest)
  }

  const manifestPath = path.join(
    options.outDir,
    'manifests',
    `${options.language}-${options.level.toLowerCase()}.json`,
  )

  if (options.dryRun) {
    console.log('\nDry run complete. No audio or manifest files were written.')
  } else {
    await writeManifest(manifestPath, manifest)

    console.log(`\nManifest written to ${manifestPath}`)
    printGeneratedAudioQualitySummary(manifest)
  }

  if (!options.dryRun && shouldUpload && inferredBaseUrl) {
    console.log('\nSuggested environment variable:')
    console.log(`VITE_AUDIO_BLOB_BASE_URL=${inferredBaseUrl}`)
  } else if (!options.dryRun && !blobToken) {
    console.log('\nNo BLOB_READ_WRITE_TOKEN found, so files were kept local only.')
  }

  if (options.cleanOrphans && !options.dryRun) {
    const expectedPathnames = buildExpectedAudioPathnames(
      allPuzzles,
      options.language,
      options.level,
    )
    const removedPathnames = await cleanLocalOrphanAudioFiles(
      options.outDir,
      options.language,
      options.level,
      expectedPathnames,
    )

    if (removedPathnames.length > 0) {
      console.log('\nRemoved local orphan audio files:')
      removedPathnames.forEach((pathname) => console.log(`  ${pathname}`))
    } else {
      console.log('\nNo local orphan audio files found.')
    }
  }
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}

export {
  adjustMp3GlobalGain,
  analyzeAudioBuffer,
  calculateNormalizationGainDb,
  processGeneratedAudioBuffer,
}
