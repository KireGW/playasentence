import { useEffect, useRef, useState } from 'react'
import './App.css'
import {
  CEFR_LEVELS,
  DEFAULT_LANGUAGE,
  LANGUAGE_OPTIONS,
  generateRound,
  getLanguageConfig,
} from './gameData.js'

const TOUCH_DRAG_HOLD_MS = 500

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

function getSpeechSettings() {
  return {
    rate: 0.67,
    pitch: 1,
  }
}

function formatSolvedDisplayTexts(languageId, segments) {
  const nextTexts = segments.map((segment) => {
    if (!segment) {
      return ''
    }

    if (languageId === 'english' && segment.text === 'i') {
      return 'I'
    }

    return segment.text
  })

  const firstIndex = nextTexts.findIndex(Boolean)
  if (firstIndex >= 0) {
    const firstText = nextTexts[firstIndex]
    nextTexts[firstIndex] = firstText.charAt(0).toUpperCase() + firstText.slice(1)
  }

  for (let index = nextTexts.length - 1; index >= 0; index -= 1) {
    if (!nextTexts[index]) {
      continue
    }

    if (!/[.!?]$/.test(nextTexts[index])) {
      nextTexts[index] = `${nextTexts[index]}.`
    }
    break
  }

  return nextTexts
}

function createEmptySlots(length) {
  return Array.from({ length }, () => null)
}

function shuffleItems(items) {
  const nextItems = [...items]

  for (let index = nextItems.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[nextItems[index], nextItems[swapIndex]] = [nextItems[swapIndex], nextItems[index]]
  }

  return nextItems
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
  const [placedSegments, setPlacedSegments] = useState(() =>
    createEmptySlots(round.orderedSegments.length),
  )
  const [selectedSlotIndex, setSelectedSlotIndex] = useState(null)
  const [hoveredSlotIndex, setHoveredSlotIndex] = useState(null)
  const [bankHovered, setBankHovered] = useState(false)
  const [pointerDragTile, setPointerDragTile] = useState(null)
  const [draggingSlotIndex, setDraggingSlotIndex] = useState(null)
  const [suppressPlacedText, setSuppressPlacedText] = useState(false)
  const [activeTileId, setActiveTileId] = useState(null)
  const [recentTileIds, setRecentTileIds] = useState([])
  const [showRoundChange, setShowRoundChange] = useState(false)
  const [solvedSentence, setSolvedSentence] = useState('')
  const [touchInteractionLocked, setTouchInteractionLocked] = useState(false)
  const roundChangeTimeoutRef = useRef(null)
  const activeTileTimeoutRef = useRef(null)
  const suppressPlacedTextTimeoutRef = useRef(null)
  const solveFrameRef = useRef(null)
  const recentTileTimeoutsRef = useRef({})
  const [voiceInventoryReady, setVoiceInventoryReady] = useState(false)
  const solvedSentenceRef = useRef('')
  const pointerDragIndexRef = useRef(null)
  const pointerDragOriginRef = useRef(null)
  const pointerDragOffsetRef = useRef({ x: 0, y: 0 })
  const pendingPointerDragRef = useRef(null)
  const touchHoldTimeoutRef = useRef(null)
  const suppressSlotClickRef = useRef(false)
  const suppressTileClickRef = useRef(false)

  const currentLanguage = getLanguageConfig(selectedLanguage)
  const ui = currentLanguage.ui
  const isComplete = solvedSentence.length > 0
  const isBuilderFilled = placedSegments.every(Boolean)
  const builderStatus = isComplete
    ? 'solved'
    : isBuilderFilled
      ? 'incorrect'
      : 'building'
  const [availableVoiceGenders, setAvailableVoiceGenders] = useState(() =>
    VOICE_GENDERS.map((voiceGender) => voiceGender.id),
  )
  const hasLanguageVoice = availableVoiceGenders.length > 0
  const placedIds = placedSegments
    .filter(Boolean)
    .map((segment) => segment.id)
  const segmentById = Object.fromEntries(
    round.orderedSegments.map((segment) => [segment.id, segment]),
  )
  const bankSegments = round.shuffledSegments.map((segment) =>
    placedIds.includes(segment.id) ? null : segment,
  )
  const solvedDisplayTexts = isComplete
    ? formatSolvedDisplayTexts(selectedLanguage, placedSegments)
    : []

  function activatePendingDrag(pendingDrag, clientX, clientY) {
    pointerDragIndexRef.current =
      pendingDrag.origin.type === 'slot' ? pendingDrag.origin.index : null
    pointerDragOriginRef.current = pendingDrag.origin
    pointerDragOffsetRef.current = {
      x: Math.min(
        Math.max(clientX - pendingDrag.tileRect.left, 0),
        pendingDrag.tileRect.width,
      ),
      y: Math.min(
        Math.max(clientY - pendingDrag.tileRect.top, 0),
        pendingDrag.tileRect.height,
      ),
    }
    setHoveredSlotIndex(
      pendingDrag.origin.type === 'slot' ? pendingDrag.origin.index : null,
    )
    setDraggingSlotIndex(
      pendingDrag.origin.type === 'slot' ? pendingDrag.origin.index : null,
    )
    setSuppressPlacedText(pendingDrag.origin.type === 'slot')
    suppressTileClickRef.current = true
    setPointerDragTile({
      text: pendingDrag.segment.text,
      id: pendingDrag.segment.id,
      x: pendingDrag.tileRect.left,
      y: pendingDrag.tileRect.top,
      width: pendingDrag.tileRect.width,
      height: pendingDrag.tileRect.height,
    })
    pendingPointerDragRef.current = null
  }

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
      window.clearTimeout(touchHoldTimeoutRef.current)
      window.speechSynthesis?.cancel()
      window.speechSynthesis.onvoiceschanged = null
      window.clearTimeout(roundChangeTimeoutRef.current)
      window.clearTimeout(activeTileTimeoutRef.current)
      window.clearTimeout(suppressPlacedTextTimeoutRef.current)
      window.cancelAnimationFrame(solveFrameRef.current)
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

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined
    }

    const html = window.document.documentElement
    const body = window.document.body
    const previousHtmlOverflow = html.style.overflow
    const previousHtmlOverscroll = html.style.overscrollBehavior
    const previousBodyOverflow = body.style.overflow
    const previousBodyOverscroll = body.style.overscrollBehavior

    if (touchInteractionLocked) {
      html.style.overflow = 'hidden'
      html.style.overscrollBehavior = 'none'
      body.style.overflow = 'hidden'
      body.style.overscrollBehavior = 'none'
    }

    return () => {
      html.style.overflow = previousHtmlOverflow
      html.style.overscrollBehavior = previousHtmlOverscroll
      body.style.overflow = previousBodyOverflow
      body.style.overscrollBehavior = previousBodyOverscroll
    }
  }, [touchInteractionLocked])

  useEffect(() => {
    function updatePointerDragPosition(event) {
      if (
        pointerDragIndexRef.current === null &&
        pendingPointerDragRef.current
      ) {
        const pendingDrag = pendingPointerDragRef.current
        const movedX = event.clientX - pendingDrag.startX
        const movedY = event.clientY - pendingDrag.startY
        const distance = Math.hypot(movedX, movedY)

        if (pendingDrag.pointerType === 'touch' && distance >= 18) {
          window.clearTimeout(touchHoldTimeoutRef.current)
          pendingPointerDragRef.current = null
          setTouchInteractionLocked(false)
        }
      }

      if (!pointerDragOriginRef.current) {
        return
      }

      setPointerDragTile((currentTile) =>
        currentTile
          ? {
              ...currentTile,
              x: event.clientX - pointerDragOffsetRef.current.x,
              y: event.clientY - pointerDragOffsetRef.current.y,
            }
          : currentTile,
      )
    }

    function clearPointerDrag() {
      window.clearTimeout(touchHoldTimeoutRef.current)
      pendingPointerDragRef.current = null
      pointerDragIndexRef.current = null
      pointerDragOriginRef.current = null
      setHoveredSlotIndex(null)
      setBankHovered(false)
      setPointerDragTile(null)
      setDraggingSlotIndex(null)
      setTouchInteractionLocked(false)
      window.setTimeout(() => {
        suppressSlotClickRef.current = false
        suppressTileClickRef.current = false
      }, 0)
    }

    window.addEventListener('pointermove', updatePointerDragPosition)
    window.addEventListener('pointerup', clearPointerDrag)
    window.addEventListener('pointercancel', clearPointerDrag)

    return () => {
      window.removeEventListener('pointermove', updatePointerDragPosition)
      window.removeEventListener('pointerup', clearPointerDrag)
      window.removeEventListener('pointercancel', clearPointerDrag)
    }
  }, [])

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

  function getSolvedSentenceFromIds(segmentIds) {
    return segmentIds
      .map((segmentId) =>
        round.orderedSegments.find((roundSegment) => roundSegment.id === segmentId)?.text,
      )
      .filter(Boolean)
      .join(round.language.joiner)
  }

  function getCurrentLineSpeechText() {
    const lineSegments = placedSegments
      .filter(Boolean)
      .map((segment) => segmentById[segment.id] ?? segment)

    if (lineSegments.length === 0) {
      return round.fullSentence
    }

    return lineSegments
      .map((segment) => segment.speechText ?? segment.text)
      .join(round.language.joiner)
  }

  function updateSolvedState(nextPlacedSegments) {
    window.cancelAnimationFrame(solveFrameRef.current)
    const nextPlacedIds = nextPlacedSegments
      .filter(Boolean)
      .map((segment) => segment.id)

    if (nextPlacedIds.length !== round.orderedSegments.length) {
      if (solvedSentenceRef.current.length > 0) {
        solvedSentenceRef.current = ''
        setSolvedSentence('')
      }
      return
    }

    const solvedOrder = round.acceptedOrders.find((acceptedOrder) =>
      acceptedOrder.every((segmentId, index) => nextPlacedIds[index] === segmentId),
    )

    if (!solvedOrder) {
      if (solvedSentenceRef.current.length > 0) {
        solvedSentenceRef.current = ''
        setSolvedSentence('')
      }
      return
    }

    const nextSolvedSentence = getSolvedSentenceFromIds(solvedOrder)
    solveFrameRef.current = window.requestAnimationFrame(() => {
      solvedSentenceRef.current = nextSolvedSentence
      setSolvedSentence(nextSolvedSentence)
      speakText(nextSolvedSentence)
    })
  }

  function setPlacedSegmentsWithSolve(nextPlacedSegments) {
    setPlacedSegments(nextPlacedSegments)
    updateSolvedState(nextPlacedSegments)
  }

  function startNewRound(languageId, level) {
    const nextRound = generateRound(languageId, level)
    setRound(nextRound)
    setPlacedSegments(createEmptySlots(nextRound.orderedSegments.length))
    setRecentTileIds([])
    setSolvedSentence('')
    solvedSentenceRef.current = ''
    setSelectedSlotIndex(null)
    setHoveredSlotIndex(null)
    setBankHovered(false)
    setPointerDragTile(null)
    setDraggingSlotIndex(null)
    setSuppressPlacedText(false)
    setActiveTileId(null)
    setTouchInteractionLocked(false)
    pendingPointerDragRef.current = null
    pointerDragOriginRef.current = null
    window.clearTimeout(touchHoldTimeoutRef.current)
    setShowRoundChange(true)
    window.clearTimeout(roundChangeTimeoutRef.current)
    window.clearTimeout(activeTileTimeoutRef.current)
    window.clearTimeout(suppressPlacedTextTimeoutRef.current)
    window.cancelAnimationFrame(solveFrameRef.current)
    Object.values(recentTileTimeoutsRef.current).forEach((timeoutId) => {
      window.clearTimeout(timeoutId)
    })
    recentTileTimeoutsRef.current = {}
    roundChangeTimeoutRef.current = window.setTimeout(() => {
      setShowRoundChange(false)
    }, 1400)
    window.speechSynthesis?.cancel()
  }

  function restartCurrentRound() {
    setRound((currentRound) => ({
      ...currentRound,
      shuffledSegments: shuffleItems(currentRound.orderedSegments),
    }))
    setPlacedSegments(createEmptySlots(round.orderedSegments.length))
    setRecentTileIds([])
    setSolvedSentence('')
    solvedSentenceRef.current = ''
    setSelectedSlotIndex(null)
    setHoveredSlotIndex(null)
    setBankHovered(false)
    setPointerDragTile(null)
    setDraggingSlotIndex(null)
    setActiveTileId(null)
    setTouchInteractionLocked(false)
    pendingPointerDragRef.current = null
    pointerDragIndexRef.current = null
    pointerDragOriginRef.current = null
    window.clearTimeout(touchHoldTimeoutRef.current)
    suppressSlotClickRef.current = false
    suppressTileClickRef.current = false
    window.clearTimeout(activeTileTimeoutRef.current)
    window.cancelAnimationFrame(solveFrameRef.current)
    Object.values(recentTileTimeoutsRef.current).forEach((timeoutId) => {
      window.clearTimeout(timeoutId)
    })
    recentTileTimeoutsRef.current = {}
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
  }

  function handleTileKeyDown(event, segment) {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return
    }

    event.preventDefault()
    handleTileClick(segment)
  }

  function handlePlacedSlotKeyDown(event, segment, index) {
    const currentSegment = getPlacedSegmentAtIndex(index) ?? segment

    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault()
      handleSlotClear(index)
      return
    }

    handleTileKeyDown(event, currentSegment)
  }

  function getPlacedSegmentAtIndex(index) {
    const placedSegment = placedSegments[index]
    if (!placedSegment) {
      return null
    }

    return segmentById[placedSegment.id] ?? placedSegment
  }

  function handleSlotClear(slotIndex) {
    if (!placedSegments[slotIndex]) {
      return
    }

    const nextPlacedSegments = [...placedSegments]
    nextPlacedSegments[slotIndex] = null
    if (selectedSlotIndex === slotIndex) {
      setSelectedSlotIndex(null)
    }
    setPlacedSegmentsWithSolve(nextPlacedSegments)
  }

  function movePlacedSegmentByPointer(fromIndex, toIndex) {
    if (fromIndex === toIndex) {
      return
    }

    const nextPlacedSegments = [...placedSegments]
    const movingSegment = nextPlacedSegments[fromIndex]
    const targetSegment = nextPlacedSegments[toIndex]
    nextPlacedSegments[toIndex] = movingSegment
    nextPlacedSegments[fromIndex] = targetSegment ?? null
    setSelectedSlotIndex(null)
    setPlacedSegmentsWithSolve(nextPlacedSegments)
  }

  function handleSlotClick(index) {
    const currentSegment = getPlacedSegmentAtIndex(index)
    if (!currentSegment) {
      return
    }
    handleTileClick(currentSegment)
  }

  function handleEmptySlotClick() {}

  function handleSlotPointerDown(event, index, segment) {
    if (!segment || (voiceInventoryReady && !hasLanguageVoice)) {
      return
    }

    window.clearTimeout(touchHoldTimeoutRef.current)
    const placedCard = event.currentTarget.querySelector('.placed-card')
    const tileRect = placedCard?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect()
    if (event.pointerType !== 'touch') {
      activatePendingDrag(
        {
          origin: { type: 'slot', index },
          pointerType: event.pointerType,
          segment,
          tileRect,
        },
        event.clientX,
        event.clientY,
      )
      suppressSlotClickRef.current = false
      return
    }

    pendingPointerDragRef.current = {
      origin: { type: 'slot', index },
      pointerType: event.pointerType,
      segment,
      tileRect,
      startX: event.clientX,
      startY: event.clientY,
    }
    suppressSlotClickRef.current = false
    if (event.pointerType === 'touch') {
      setTouchInteractionLocked(true)
      touchHoldTimeoutRef.current = window.setTimeout(() => {
        const pendingDrag = pendingPointerDragRef.current
        if (!pendingDrag) {
          return
        }
        activatePendingDrag(pendingDrag, pendingDrag.startX, pendingDrag.startY)
      }, TOUCH_DRAG_HOLD_MS)
    }
  }

  function handleBankTilePointerDown(event, segment) {
    if (!segment || (voiceInventoryReady && !hasLanguageVoice)) {
      return
    }

    window.clearTimeout(touchHoldTimeoutRef.current)
    const tileRect = event.currentTarget.getBoundingClientRect()
    if (event.pointerType !== 'touch') {
      activatePendingDrag(
        {
          origin: { type: 'bank' },
          pointerType: event.pointerType,
          segment,
          tileRect,
        },
        event.clientX,
        event.clientY,
      )
      suppressTileClickRef.current = false
      return
    }

    pendingPointerDragRef.current = {
      origin: { type: 'bank' },
      pointerType: event.pointerType,
      segment,
      tileRect,
      startX: event.clientX,
      startY: event.clientY,
    }
    suppressTileClickRef.current = false
    if (event.pointerType === 'touch') {
      setTouchInteractionLocked(true)
      touchHoldTimeoutRef.current = window.setTimeout(() => {
        const pendingDrag = pendingPointerDragRef.current
        if (!pendingDrag) {
          return
        }
        activatePendingDrag(pendingDrag, pendingDrag.startX, pendingDrag.startY)
      }, TOUCH_DRAG_HOLD_MS)
    }
  }

  function handleSlotPointerEnter(index) {
    if (!pointerDragOriginRef.current && !pointerDragTile) {
      return
    }

    setHoveredSlotIndex(index)
    setBankHovered(false)
  }

  function handleSlotPointerUp(index) {
    const dragOrigin = pointerDragOriginRef.current
    if (!dragOrigin || !pointerDragTile) {
      return
    }

    if (dragOrigin.type === 'slot') {
      const fromIndex = dragOrigin.index

      if (fromIndex !== index) {
        suppressSlotClickRef.current = true
        movePlacedSegmentByPointer(fromIndex, index)
      }
    } else {
      const movingSegment =
        round.orderedSegments.find((segment) => segment.id === pointerDragTile.id) ?? null

      if (movingSegment) {
        const nextPlacedSegments = [...placedSegments]
        const existingIndex = nextPlacedSegments.findIndex(
          (placedSegment) => placedSegment?.id === movingSegment.id,
        )

        if (existingIndex >= 0) {
          nextPlacedSegments[existingIndex] = null
        }

        nextPlacedSegments[index] = movingSegment
        suppressTileClickRef.current = true
        setPlacedSegmentsWithSolve(nextPlacedSegments)
      }
    }

    pointerDragOriginRef.current = null
    pointerDragIndexRef.current = null
    setPointerDragTile(null)
    setDraggingSlotIndex(null)
    setHoveredSlotIndex(null)
    setBankHovered(false)
    setTouchInteractionLocked(false)
    window.clearTimeout(touchHoldTimeoutRef.current)
    window.clearTimeout(suppressPlacedTextTimeoutRef.current)
    suppressPlacedTextTimeoutRef.current = window.setTimeout(() => {
      setSuppressPlacedText(false)
    }, 120)
  }

  function handleBankPointerEnter() {
    if (!pointerDragOriginRef.current || !pointerDragTile) {
      return
    }

    setHoveredSlotIndex(null)
    setBankHovered(true)
  }

  function handleBankPointerLeave() {
    if (!pointerDragOriginRef.current || !pointerDragTile) {
      return
    }

    setBankHovered(false)
  }

  function handleBankPointerUp() {
    const dragOrigin = pointerDragOriginRef.current
    if (!dragOrigin || !pointerDragTile) {
      return
    }

    if (dragOrigin.type === 'slot') {
      suppressSlotClickRef.current = true
      handleSlotClear(dragOrigin.index)
    }

    pointerDragOriginRef.current = null
    pointerDragIndexRef.current = null
    setPointerDragTile(null)
    setDraggingSlotIndex(null)
    setHoveredSlotIndex(null)
    setBankHovered(false)
    setTouchInteractionLocked(false)
    window.clearTimeout(touchHoldTimeoutRef.current)
    window.clearTimeout(suppressPlacedTextTimeoutRef.current)
    suppressPlacedTextTimeoutRef.current = window.setTimeout(() => {
      setSuppressPlacedText(false)
    }, 120)
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
          className={`builder-line ${builderStatus} ${
            pointerDragTile || suppressPlacedText ? 'pointer-dragging' : ''
          }`}
          aria-label={ui.solved}
          style={{
            gridTemplateColumns: `repeat(${round.orderedSegments.length}, minmax(110px, 1fr))`,
          }}
        >
          {placedSegments.map((segment, index) => (
            (() => {
              const isDraggingOrigin = draggingSlotIndex === index && pointerDragTile
              const visibleSegment = isDraggingOrigin ? null : segment

              return (
            <div
              key={`slot-${index}`}
              role={visibleSegment ? 'button' : undefined}
              tabIndex={!(voiceInventoryReady && !hasLanguageVoice) ? 0 : undefined}
              draggable={false}
              aria-disabled={visibleSegment && voiceInventoryReady && !hasLanguageVoice}
              aria-label={visibleSegment ? `${ui.playSegment} ${index + 1}` : undefined}
              className={`drop-slot ${visibleSegment ? 'filled' : 'empty'} ${
                visibleSegment && activeTileId === visibleSegment.id ? 'playing' : ''
              } ${
                visibleSegment &&
                revealWhilePlaying &&
                activeTileId === visibleSegment.id
                  ? 'revealed'
                  : ''
              } ${
                visibleSegment && recentTileIds.includes(visibleSegment.id) ? 'recent' : ''
              } ${selectedSlotIndex === index ? 'selected' : ''} ${
                hoveredSlotIndex === index ? 'hovered' : ''
              }`}
              onClick={
                visibleSegment
                  ? () => {
                      if (suppressSlotClickRef.current || suppressTileClickRef.current) {
                        return
                      }
                      handleSlotClick(index)
                    }
                  : () => handleEmptySlotClick(index)
              }
              onDoubleClick={visibleSegment ? () => handleSlotClear(index) : undefined}
              onPointerDown={
                visibleSegment
                  ? (event) => handleSlotPointerDown(event, index, visibleSegment)
                  : undefined
              }
              onPointerEnter={() => handleSlotPointerEnter(index)}
              onPointerUp={() => handleSlotPointerUp(index)}
              onKeyDown={
                visibleSegment
                  ? (event) => handlePlacedSlotKeyDown(event, visibleSegment, index)
                  : undefined
              }
            >
              {visibleSegment ? (
                <div
                  className={`placed-card sound-tile ${
                    activeTileId === visibleSegment.id ? 'playing' : ''
                  } ${
                    !isComplete &&
                    revealWhilePlaying &&
                    activeTileId === visibleSegment.id
                      ? 'revealed'
                      : ''
                  } ${recentTileIds.includes(visibleSegment.id) ? 'recent' : ''} ${
                    isComplete ? 'solved-revealed' : ''
                  }`}
                  aria-hidden="true"
                >
                  <span className="tile-face tile-front" aria-hidden="true">
                    <span className="tile-speaker">🔊</span>
                    <span className="tile-mark">
                      {activeTileId === visibleSegment.id ? '...' : ' '}
                    </span>
                  </span>
                  <span className="tile-face tile-back">
                    {isComplete ? solvedDisplayTexts[index] : visibleSegment.text}
                  </span>
                </div>
              ) : (
                <div className="drop-slot-placeholder" aria-hidden="true">
                  <span className="drop-slot-index">{index + 1}</span>
                  <span className="drop-slot-dots" />
                </div>
              )}
            </div>
              )
            })()
          ))}
        </section>

        {isComplete ? (
          <div className="solved-banner" aria-live="polite">
            <span>{`${ui.solved}!`}</span>
          </div>
        ) : null}

        {builderStatus === 'incorrect' ? (
          <div className="retry-banner" aria-live="polite">
            <span>{ui.tryAgain}</span>
          </div>
        ) : null}

        <section
          className={`tile-grid tile-bank ${bankHovered ? 'hovered' : ''}`}
          aria-label={ui.shuffledButtons}
          style={{
            gridTemplateColumns: `repeat(${round.orderedSegments.length}, minmax(110px, 1fr))`,
          }}
          onPointerEnter={handleBankPointerEnter}
          onPointerLeave={handleBankPointerLeave}
          onPointerUp={handleBankPointerUp}
        >
          {bankSegments.map((segment, index) =>
            segment ? (
              <div
                key={segment.id}
                role="button"
                tabIndex={voiceInventoryReady && !hasLanguageVoice ? -1 : 0}
                aria-disabled={voiceInventoryReady && !hasLanguageVoice}
                className={`sound-tile ${activeTileId === segment.id ? 'playing' : ''} ${
                  revealWhilePlaying && activeTileId === segment.id ? 'revealed' : ''
                } ${recentTileIds.includes(segment.id) ? 'recent' : ''}`}
                onClick={() => {
                  if (suppressTileClickRef.current) {
                    return
                  }
                  handleTileClick(segment)
                }}
                onKeyDown={(event) => handleTileKeyDown(event, segment)}
                onPointerDown={(event) => handleBankTilePointerDown(event, segment)}
                aria-label={`${ui.playSegment} ${segment.position + 1}`}
              >
                <span className="tile-face tile-front" aria-hidden="true">
                  <span className="tile-speaker">🔊</span>
                  <span className="tile-mark">{activeTileId === segment.id ? '...' : ' '}</span>
                </span>
                <span className="tile-face tile-back">{segment.text}</span>
              </div>
            ) : (
              <div
                key={`bank-placeholder-${index}`}
                className="bank-placeholder"
                aria-hidden="true"
              />
            ),
          )}
        </section>

        <div className="toolbar">
          <button
            type="button"
            className="ghost-button"
            onClick={restartCurrentRound}
          >
            {ui.restart}
          </button>
          <button
            type="button"
            className="ghost-button"
            disabled={voiceInventoryReady && !hasLanguageVoice}
            onClick={() => speakText(getCurrentLineSpeechText())}
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

        {pointerDragTile ? (
          <div
            className="drag-ghost"
            aria-hidden="true"
            style={{
              left: `${pointerDragTile.x}px`,
              top: `${pointerDragTile.y}px`,
              width: `${pointerDragTile.width}px`,
              height: `${pointerDragTile.height}px`,
            }}
          >
            <span className="tile-face tile-front" aria-hidden="true">
              <span className="tile-speaker">🔊</span>
              <span className="tile-mark"> </span>
            </span>
          </div>
        ) : null}
      </section>
    </main>
  )
}

export default App
