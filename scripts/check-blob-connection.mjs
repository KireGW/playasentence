import fs from 'node:fs/promises'
import { put } from '@vercel/blob'

async function loadLocalEnv() {
  const envText = await fs.readFile('.env.local', 'utf8')

  for (const line of envText.split(/\r?\n/)) {
    if (!line.trim()) {
      continue
    }

    const separatorIndex = line.indexOf('=')
    if (separatorIndex < 0) {
      continue
    }

    const key = line.slice(0, separatorIndex)
    const value = line.slice(separatorIndex + 1).replace(/^"|"$/g, '')

    if (!(key in process.env)) {
      process.env[key] = value
    }
  }
}

async function main() {
  await loadLocalEnv()

  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      voice: 'marin',
      input: 'kopplingstest',
      instructions:
        'Speak clear standard Swedish in a calm, natural, highly intelligible teaching voice.',
      response_format: 'mp3',
    }),
  })

  console.log('openai_status', response.status)

  if (!response.ok) {
    console.log(await response.text())
    process.exitCode = 1
    return
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  const blob = await put('audio/test/connection-check.mp3', buffer, {
    access: 'public',
    contentType: 'audio/mpeg',
    addRandomSuffix: false,
    token: process.env.BLOB_READ_WRITE_TOKEN,
    allowOverwrite: true,
  })

  console.log(
    JSON.stringify(
      {
        blobUrl: blob.url,
        pathname: blob.pathname,
        size: buffer.length,
      },
      null,
      2,
    ),
  )

  const head = await fetch(blob.url, { method: 'HEAD' })
  console.log('blob_head_status', head.status)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
