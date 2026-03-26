import { useEffect, useRef, useState } from 'react'
import './App.css'
import {
  CEFR_LEVELS,
  DEFAULT_LANGUAGE,
  LANGUAGE_OPTIONS,
  generateRound,
  getLanguageConfig,
} from './gameData.js'

const speechSupported =
  typeof window !== 'undefined' && 'speechSynthesis' in window

const VOICE_GENDERS = [
  { id: 'female', label: 'Female' },
  { id: 'male', label: 'Male' },
]

const REVEAL_MODES = [
  { id: 'off', label: 'Off' },
  { id: 'on', label: 'On' },
]

const STORAGE_KEY = 'playasentence-settings'
const ATTEMPT_RESET_DELAY = 2400

function loadSavedSettings() {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const rawSettings = window.localStorage.getItem(STORAGE_KEY)
    if (!rawSettings) {
      return null
    }

    return JSON.parse(rawSettings)
  } catch {
    return null
  }
}

function normalizeVoiceText(value) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fff\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function voiceNameMatches(voiceName, preferredNames) {
  const normalizedVoiceName = normalizeVoiceText(voiceName)
  return preferredNames.some((preferredName) =>
    normalizedVoiceName.includes(normalizeVoiceText(preferredName)),
  )
}

function getGenderHintScore(voice, language, voiceGender) {
  const genderMatches = language.voicePreferences?.[voiceGender] ?? []
  const oppositeGender = voiceGender === 'female' ? 'male' : 'female'
  const oppositeMatches = language.voicePreferences?.[oppositeGender] ?? []

  let score = 0

  if (voiceNameMatches(voice.name, genderMatches)) {
    score += 120
  }

  if (voiceNameMatches(voice.name, oppositeMatches)) {
    score -= 45
  }

  return score
}

function scoreVoice(voice, language, voiceGender) {
  const name = normalizeVoiceText(voice.name)
  const lang = voice.lang.toLowerCase()

  if (!language.voicePrefixes.some((prefix) => lang.startsWith(prefix))) {
    return -100
  }

  let score = 0

  if (lang === language.speechLang.toLowerCase()) {
    score += 40
  } else {
    score += 25
  }

  if (voice.localService) {
    score += 20
  }

  if (voice.default) {
    score += 10
  }

  if (voiceNameMatches(voice.name, language.preferredVoiceNames)) {
    score += 80
  }

  score += getGenderHintScore(voice, language, voiceGender)

  if (name.includes('natural')) {
    score += 30
  }

  if (name.includes('enhanced') || name.includes('premium')) {
    score += 20
  }

  if (name.includes('compact') || name.includes('espeak')) {
    score -= 60
  }

  return score
}

function getPreferredVoice(language, voiceGender) {
  if (!speechSupported) {
    return null
  }

  const voices = window.speechSynthesis
    .getVoices()
    .filter((voice) =>
      language.voicePrefixes.some((prefix) =>
        voice.lang.toLowerCase().startsWith(prefix),
      ),
    )

  if (voices.length === 0) {
    return null
  }

  const rankedVoices = [...voices]
    .map((voice) => ({
      voice,
      score: scoreVoice(voice, language, voiceGender),
      genderHintScore: getGenderHintScore(voice, language, voiceGender),
    }))
    .sort((first, second) => second.score - first.score)

  const clearlyMatchedVoice = rankedVoices.find(
    ({ genderHintScore }) => genderHintScore > 0,
  )?.voice

  if (clearlyMatchedVoice) {
    return clearlyMatchedVoice
  }

  if (rankedVoices.length === 1) {
    return rankedVoices[0].voice
  }

  return voiceGender === 'male'
    ? rankedVoices[1].voice
    : rankedVoices[0].voice
}

function getLanguageVoices(language) {
  if (!speechSupported) {
    return []
  }

  return window.speechSynthesis
    .getVoices()
    .filter((voice) =>
      language.voicePrefixes.some((prefix) =>
        voice.lang.toLowerCase().startsWith(prefix),
      ),
    )
}

function getAvailableVoiceGenders(language) {
  if (!speechSupported) {
    return VOICE_GENDERS.map((voiceGender) => voiceGender.id)
  }

  const voices = getLanguageVoices(language)

  if (voices.length === 0) {
    return []
  }

  const availableGenders = VOICE_GENDERS.filter((voiceGender) =>
    voices.some((voice) => getGenderHintScore(voice, language, voiceGender.id) > 0),
  ).map((voiceGender) => voiceGender.id)

  return availableGenders.length > 0
    ? availableGenders
    : [VOICE_GENDERS[0].id]
}

function formatSolvedSentence(languageId, sentence) {
  let formatted = sentence

  if (languageId === 'english') {
    formatted = formatted.replace(/\bi\b/g, 'I')
  }

  const trimmed = formatted.trim()
  if (!trimmed) {
    return trimmed
  }

  const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
  return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`
}

function getSpeechSettings() {
  return {
    rate: 0.67,
    pitch: 1,
  }
}

function App() {
  const savedSettings = loadSavedSettings()
  const initialLanguage =
    LANGUAGE_OPTIONS.find((language) => language.id === savedSettings?.selectedLanguage)
      ?.id ?? DEFAULT_LANGUAGE
  const initialLevel = CEFR_LEVELS.includes(savedSettings?.selectedLevel)
    ? savedSettings.selectedLevel
    : 'A1'
  const initialVoiceGender =
    VOICE_GENDERS.find((voiceGender) => voiceGender.id === savedSettings?.selectedVoiceGender)
      ?.id ?? 'female'
  const initialRevealWhilePlaying = Boolean(savedSettings?.revealWhilePlaying)

  const [selectedLanguage, setSelectedLanguage] = useState(initialLanguage)
  const [selectedLevel, setSelectedLevel] = useState(initialLevel)
  const [selectedVoiceGender, setSelectedVoiceGender] = useState(initialVoiceGender)
  const [revealWhilePlaying, setRevealWhilePlaying] = useState(initialRevealWhilePlaying)
  const [round, setRound] = useState(() => generateRound(initialLanguage, initialLevel))
  const [activeTileId, setActiveTileId] = useState(null)
  const [recentTileIds, setRecentTileIds] = useState([])
  const [showRoundChange, setShowRoundChange] = useState(false)
  const [solvedSentence, setSolvedSentence] = useState('')
  const roundChangeTimeoutRef = useRef(null)
  const activeTileTimeoutRef = useRef(null)
  const recentTileTimeoutsRef = useRef({})
  const attemptResetTimeoutRef = useRef(null)
  const [voiceInventoryReady, setVoiceInventoryReady] = useState(false)
  const pickedIdsRef = useRef([])
  const solvedSentenceRef = useRef('')

  const currentLanguage = getLanguageConfig(selectedLanguage)
  const ui = currentLanguage.ui
  const isComplete = solvedSentence.length > 0
  const tileColumns = Math.ceil(round.shuffledSegments.length / 2)
  const [availableVoiceGenders, setAvailableVoiceGenders] = useState(() =>
    VOICE_GENDERS.map((voiceGender) => voiceGender.id),
  )
  const hasLanguageVoice = availableVoiceGenders.length > 0

  useEffect(() => {
    if (!speechSupported) {
      return undefined
    }

    const updateVoice = () => {
      const nextAvailableVoiceGenders = getAvailableVoiceGenders(currentLanguage)
      setVoiceInventoryReady(true)
      setAvailableVoiceGenders(nextAvailableVoiceGenders)
      if (
        nextAvailableVoiceGenders.length > 0 &&
        !nextAvailableVoiceGenders.includes(selectedVoiceGender)
      ) {
        setSelectedVoiceGender(nextAvailableVoiceGenders[0])
      }
      getPreferredVoice(currentLanguage, selectedVoiceGender)
    }

    updateVoice()
    window.speechSynthesis.onvoiceschanged = updateVoice

    return () => {
      window.speechSynthesis?.cancel()
      window.speechSynthesis.onvoiceschanged = null
      window.clearTimeout(roundChangeTimeoutRef.current)
      window.clearTimeout(activeTileTimeoutRef.current)
      window.clearTimeout(attemptResetTimeoutRef.current)
      Object.values(recentTileTimeoutsRef.current).forEach((timeoutId) => {
        window.clearTimeout(timeoutId)
      })
    }
  }, [currentLanguage, selectedVoiceGender])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        selectedLanguage,
        selectedLevel,
        selectedVoiceGender,
        revealWhilePlaying,
      }),
    )
  }, [
    revealWhilePlaying,
    selectedLanguage,
    selectedLevel,
    selectedVoiceGender,
  ])

  useEffect(() => {
    solvedSentenceRef.current = solvedSentence
  }, [solvedSentence])

  function speakText(text, tileId = null) {
    if (!speechSupported || (voiceInventoryReady && !hasLanguageVoice)) {
      return
    }

    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = currentLanguage.speechLang
    utterance.volume = 1

    const preferredVoice = getPreferredVoice(currentLanguage, selectedVoiceGender)
    if (preferredVoice) {
      utterance.voice = preferredVoice
      utterance.lang = preferredVoice.lang
    }

    const speechSettings = getSpeechSettings(
      currentLanguage,
      selectedVoiceGender,
      preferredVoice,
    )
    utterance.rate = speechSettings.rate
    utterance.pitch = speechSettings.pitch

    utterance.onstart = () => {
      window.clearTimeout(activeTileTimeoutRef.current)
      setActiveTileId(tileId)
    }
    utterance.onend = () => {
      window.clearTimeout(activeTileTimeoutRef.current)
      activeTileTimeoutRef.current = window.setTimeout(() => {
        setActiveTileId(null)
      }, 450)
    }
    utterance.onerror = () => {
      window.clearTimeout(activeTileTimeoutRef.current)
      setActiveTileId(null)
    }
    window.speechSynthesis.speak(utterance)
  }

  function clearAttemptProgress() {
    pickedIdsRef.current = []
    window.clearTimeout(attemptResetTimeoutRef.current)
  }

  function scheduleAttemptReset() {
    window.clearTimeout(attemptResetTimeoutRef.current)
    attemptResetTimeoutRef.current = window.setTimeout(() => {
      pickedIdsRef.current = []
    }, ATTEMPT_RESET_DELAY)
  }

  function startNewRound(languageId, level) {
    const nextRound = generateRound(languageId, level)
    setRound(nextRound)
    clearAttemptProgress()
    setRecentTileIds([])
    setSolvedSentence('')
    solvedSentenceRef.current = ''
    setActiveTileId(null)
    setShowRoundChange(true)
    window.clearTimeout(roundChangeTimeoutRef.current)
    window.clearTimeout(activeTileTimeoutRef.current)
    window.clearTimeout(attemptResetTimeoutRef.current)
    Object.values(recentTileTimeoutsRef.current).forEach((timeoutId) => {
      window.clearTimeout(timeoutId)
    })
    recentTileTimeoutsRef.current = {}
    roundChangeTimeoutRef.current = window.setTimeout(() => {
      setShowRoundChange(false)
    }, 1400)
    window.speechSynthesis?.cancel()
  }

  function handleLevelChange(level) {
    setSelectedLevel(level)
    startNewRound(selectedLanguage, level)
  }

  function handleLanguageChange(languageId) {
    setSelectedLanguage(languageId)
    startNewRound(languageId, selectedLevel)
  }

  function handleVoiceGenderChange(voiceGender) {
    if (!availableVoiceGenders.includes(voiceGender)) {
      return
    }

    setSelectedVoiceGender(voiceGender)
    window.speechSynthesis?.cancel()
    window.clearTimeout(activeTileTimeoutRef.current)
    setActiveTileId(null)
  }

  function handleRevealModeChange(mode) {
    setRevealWhilePlaying(mode === 'on')
  }

  function handleTileClick(segment) {
    setRecentTileIds((currentIds) => [
      ...currentIds.filter((currentId) => currentId !== segment.id),
      segment.id,
    ])
    window.clearTimeout(recentTileTimeoutsRef.current[segment.id])
    recentTileTimeoutsRef.current[segment.id] = window.setTimeout(() => {
      setRecentTileIds((currentIds) =>
        currentIds.filter((currentId) => currentId !== segment.id),
      )
      delete recentTileTimeoutsRef.current[segment.id]
    }, 1800)

    speakText(segment.speechText ?? segment.text, segment.id)

    if (solvedSentenceRef.current.length > 0) {
      return
    }

    const nextPickedIds = [...pickedIdsRef.current, segment.id]
    const matchingOrders = round.acceptedOrders.filter((acceptedOrder) =>
      nextPickedIds.every((pickedId, index) => acceptedOrder[index] === pickedId),
    )

    if (matchingOrders.length === 0) {
      clearAttemptProgress()
      return
    }

    pickedIdsRef.current = nextPickedIds
    scheduleAttemptReset()

    const solvedOrder = matchingOrders.find(
      (acceptedOrder) => acceptedOrder.length === nextPickedIds.length,
    )

    if (!solvedOrder) {
      return
    }

    const nextSolvedSentence = solvedOrder
      .map((segmentId) =>
        round.orderedSegments.find((roundSegment) => roundSegment.id === segmentId)?.text,
      )
      .filter(Boolean)
      .join(round.language.joiner)

    window.clearTimeout(attemptResetTimeoutRef.current)
    solvedSentenceRef.current = nextSolvedSentence
    setSolvedSentence(nextSolvedSentence)
  }

  return (
    <main className="game-shell">
      <aside className="sidebar">
        <p className="eyebrow">{ui.eyebrow}</p>
        <h1>{ui.title}</h1>
        <p className="intro">{ui.intro}</p>

        <section className="panel language-panel" aria-label={ui.practiceLanguages}>
          <div className="language-list" role="list" aria-label={ui.practiceLanguages}>
            {LANGUAGE_OPTIONS.map((language) => (
              <button
                key={language.id}
                type="button"
                className={`level-button ${language.id === selectedLanguage ? 'selected' : ''}`}
                onClick={() => handleLanguageChange(language.id)}
              >
                <strong>
                  {language.flag} {language.label}
                </strong>
              </button>
            ))}
          </div>
        </section>

        <div className="control-grid">
          <section className="panel level-panel" aria-labelledby="level-heading">
            <div className="panel-heading">
              <h2 id="level-heading">{ui.cefrLevel}</h2>
              <span>{selectedLevel}</span>
            </div>
            <div className="level-list" role="list" aria-label={ui.cefrLevels}>
              {CEFR_LEVELS.map((level) => (
                <button
                  key={level}
                  type="button"
                  className={`level-button ${level === selectedLevel ? 'selected' : ''}`}
                  onClick={() => handleLevelChange(level)}
                >
                  <strong>{level}</strong>
                  <span>{round.levelDescriptions[level]}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="panel voice-panel" aria-labelledby="voice-heading">
            <div className="panel-heading">
              <h2 id="voice-heading">{ui.voice}</h2>
            </div>
            <div className="voice-list" role="list" aria-label={ui.voiceGender}>
              {VOICE_GENDERS.map((voiceGender) => (
                <button
                  key={voiceGender.id}
                  type="button"
                  disabled={
                    voiceInventoryReady &&
                    !availableVoiceGenders.includes(voiceGender.id)
                  }
                  aria-disabled={
                    voiceInventoryReady &&
                    !availableVoiceGenders.includes(voiceGender.id)
                  }
                  className={`level-button ${voiceGender.id === selectedVoiceGender ? 'selected' : ''} ${
                    voiceInventoryReady &&
                    !availableVoiceGenders.includes(voiceGender.id)
                      ? 'disabled'
                      : ''
                  }`}
                  onClick={() => handleVoiceGenderChange(voiceGender.id)}
                >
                  <strong>{voiceGender.id === 'female' ? ui.female : ui.male}</strong>
                </button>
              ))}
            </div>
            {voiceInventoryReady && !hasLanguageVoice ? (
              <p className="panel-note">{ui.voiceUnavailable}</p>
            ) : null}
          </section>

            <section className="panel voice-panel" aria-labelledby="reveal-heading">
              <div className="panel-heading">
                <h2 id="reveal-heading">{ui.reveal}</h2>
              </div>
              <div className="voice-list" role="list" aria-label={ui.revealModes}>
              {REVEAL_MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  className={`level-button ${
                    (revealWhilePlaying ? 'on' : 'off') === mode.id ? 'selected' : ''
                  }`}
                  onClick={() => handleRevealModeChange(mode.id)}
                >
                  <strong>{mode.id === 'on' ? ui.on : ui.off}</strong>
                </button>
              ))}
            </div>
          </section>
        </div>

      </aside>

      <section className={`board ${showRoundChange ? 'board-switched' : ''}`}>
        <div className="status-bar" aria-live="polite">
          <span>{ui.instruction}</span>
        </div>

        <div className="round-banner-slot" aria-live="polite">
          <div className={`round-banner ${showRoundChange ? 'visible' : ''}`}>
            {ui.newPuzzleLoaded}
          </div>
        </div>

        {!speechSupported ? (
          <div className="status-bar" aria-live="polite">
            <strong>{ui.speechUnavailable}</strong>
          </div>
        ) : null}

        <section
          className="tile-grid"
          aria-label={ui.shuffledButtons}
          style={{
            gridTemplateColumns: `repeat(${tileColumns}, minmax(110px, 1fr))`,
          }}
        >
          {round.shuffledSegments.map((segment) => (
            <button
              key={segment.id}
              type="button"
              disabled={voiceInventoryReady && !hasLanguageVoice}
              className={`sound-tile ${activeTileId === segment.id ? 'playing' : ''} ${
                revealWhilePlaying && activeTileId === segment.id ? 'revealed' : ''
              } ${recentTileIds.includes(segment.id) ? 'recent' : ''}`}
              onClick={() => handleTileClick(segment)}
              aria-label={`${ui.playSegment} ${segment.position + 1}`}
            >
              <span className="tile-face tile-front" aria-hidden="true">
                <span className="tile-mark">{activeTileId === segment.id ? '...' : ' '}</span>
              </span>
              <span className="tile-face tile-back">{segment.text}</span>
            </button>
          ))}
        </section>

        <div className="toolbar">
          <button
            type="button"
            className="ghost-button"
            disabled={voiceInventoryReady && !hasLanguageVoice}
            onClick={() => speakText(round.fullSentence)}
          >
            {ui.playFullSentence}
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={() => startNewRound(selectedLanguage, selectedLevel)}
          >
            {ui.newPuzzle}
          </button>
        </div>

        {isComplete ? (
          <section className="answer-panel">
            <p className="eyebrow">{ui.solved}</p>
            <p>{formatSolvedSentence(selectedLanguage, solvedSentence)}</p>
          </section>
        ) : null}
      </section>
    </main>
  )
}

export default App
