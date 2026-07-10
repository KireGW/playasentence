# Play a Sentence

Drag the audio pieces into the correct sentence order.

## Audio from Vercel Blob

The app can now read pre-generated audio for CSV-backed puzzles before falling
back to browser speech synthesis.

Set a public Blob base URL in `.env.local`:

```bash
VITE_AUDIO_BLOB_BASE_URL=https://your-public-blob-prefix-here
```

Expected naming pattern for Swedish CSV puzzles:

```text
audio/swedish/a1/sv_a1_001_1.mp3
audio/swedish/a1/sv_a1_001_2.mp3
audio/swedish/a1/sv_a1_001_full.mp3
```

The app tries:

- segment audio file on tile click
- full sentence audio file when the current line matches the canonical solved order
- browser TTS as fallback if no audio file is available

During Vite dev mode, audio playback bypasses the browser/app audio cache on
each click so freshly regenerated MP3 files are easier to verify. Set
`VITE_AUDIO_CACHE_BYPASS=false` to test production-style caching locally.

## Generate Swedish CSV audio

The Swedish CSV can now be turned into real MP3 assets and uploaded to Vercel Blob.

Dry run:

```bash
npm run audio:csv -- --language swedish --level A1 --dry-run
```

Dry runs print what would be generated, but do not write audio files or manifests.

Dry run one puzzle:

```bash
npm run audio:csv -- --language swedish --level A1 --puzzle sv_a1_010 --dry-run
```

Regenerate one segment only:

```bash
npm run audio:csv -- --language swedish --level A1 --puzzle sv_a1_010 --segment 5 --overwrite
```

Regenerate full-sentence audio for every accepted CSV order and clean local
orphaned generated audio:

```bash
npm run audio:csv -- --language swedish --level A1 --full-sentences-only --overwrite --clean-orphans
```

Generate local MP3 files only:

```bash
npm run audio:csv -- --language swedish --level A1 --skip-upload
```

Generate and upload to Blob:

```bash
npm run audio:csv -- --language swedish --level A1
```

The script:

- reads `src/data/puzzles/swedish.csv`
- generates one MP3 per segment plus one full-sentence MP3 per puzzle
- rejects near-silent generated audio and retries before writing or uploading
- normalizes MP3 loudness toward a target RMS level so files play at a steadier perceived volume
- writes the files into `generated/audio/...`
- uploads to Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set
- prints the Blob base URL you should copy into `VITE_AUDIO_BLOB_BASE_URL`

Audio quality checks are on by default. The default target is `-24 dB` RMS with
a small tolerance, a `-1 dB` peak ceiling, and up to three TTS attempts when a
file comes back near-silent. The signal analysis uses the local macOS
Swift/AVFoundation runtime. To tune or disable this during experiments:

```bash
npm run audio:csv -- --language swedish --level A1 --target-rms-db -24
npm run audio:csv -- --language swedish --level A1 --no-normalize-audio
npm run audio:csv -- --language swedish --level A1 --no-audio-validation
```

For isolated-word pronunciation fixes, keep the visible word in `segment_*` and
put guidance in the matching `speech_instruction_*` column. If the model still
needs a phonetic nudge, use the matching `speech_*` column as segment-audio-only
input while keeping the learner-facing text unchanged in `segment_*`. Full
sentence files continue to use the visible `segment_*` text so normal sentence
prosody is preserved.

This pipeline is intentionally single-voice only, so Blob-backed puzzles use one consistent recorded voice instead of separate male/female variants.
