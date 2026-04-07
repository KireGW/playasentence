function pick(items) {
  return items[Math.floor(Math.random() * items.length)]
}

function shuffle(items) {
  const next = [...items]
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[next[index], next[swapIndex]] = [next[swapIndex], next[index]]
  }
  return next
}

function buildSentence(builders) {
  return pick(builders)()
}

const RECENT_SENTENCE_MEMORY = new Map()
const RECENT_SENTENCE_LIMIT = 6
const ROUND_GENERATION_ATTEMPTS = 24

const LANGUAGE_RULES = {
  english: {
    movableTailSegments: [
      'today',
      'tonight',
      'tomorrow',
      'now',
      'again',
      'this morning',
      'after school',
      'for later',
      'outside',
      'inside',
      'here',
    ],
    speechOverrides: {},
  },
  spanish: {
    movableTailSegments: [
      'hoy',
      'mañana',
      'ahora',
      'afuera',
      'esta mañana',
      'después de clase',
      'para después',
    ],
    speechOverrides: {},
  },
  french: {
    movableTailSegments: [
      "aujourd'hui",
      'demain',
      'ici',
      'dehors',
      'ce matin',
      'ce soir',
      'après la classe',
      'pour plus tard',
    ],
    speechOverrides: {
      à: 'a',
    },
  },
  italian: {
    movableTailSegments: [
      'oggi',
      'domani',
      'adesso',
      'fuori',
      'stasera',
      'stamattina',
      'per dopo',
    ],
    speechOverrides: {},
  },
  german: {
    movableTailSegments: [
      'heute',
      'morgen',
      'hier',
      'draußen',
      'heute Morgen',
      'heute Abend',
      'für später',
    ],
    speechOverrides: {},
  },
  mandarin: {
    movableTailSegments: [
      '今天',
      '明天',
      '这里',
      '外面',
      '今天早上',
      '今晚',
      '在身边',
      '留到以后',
    ],
    speechOverrides: {},
  },
  swedish: {
    movableTailSegments: [
      'idag',
      'imorgon',
      'nu',
      'här',
      'ute',
      'ikväll',
      'i morse',
      'till senare',
    ],
    frontedTailInversionSubjects: ['jag', 'du', 'han', 'hon', 'vi', 'ni', 'de'],
    speechOverrides: {},
  },
}

function getLanguageRules(languageId) {
  return (
    LANGUAGE_RULES[languageId] ?? {
      movableTailSegments: [],
      frontedTailInversionSubjects: [],
      speechOverrides: {},
    }
  )
}

function normalizeSegment(languageId, entry) {
  const languageRules = getLanguageRules(languageId)

  if (typeof entry === 'string') {
    return {
      text: entry,
      speechText: languageRules.speechOverrides[entry] ?? entry,
    }
  }

  return {
    text: entry.text,
    speechText:
      entry.speechText ??
      languageRules.speechOverrides[entry.text] ??
      entry.text,
  }
}

function uniqueOrders(orders) {
  const seen = new Set()
  return orders.filter((order) => {
    const key = order.join('|')
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

function createAcceptedOrders(languageId, orderedSegments) {
  const baseOrder = orderedSegments.map((segment) => segment.id)
  const orders = [baseOrder]
  const {
    movableTailSegments,
    frontedTailInversionSubjects = [],
  } =
    getLanguageRules(languageId)

  orderedSegments.forEach((segment, index) => {
    if (
      movableTailSegments.includes(segment.text) &&
      orderedSegments.length >= 4 &&
      index > 0
    ) {
      orders.push([
        segment.id,
        ...orderedSegments
          .filter((orderedSegment) => orderedSegment.id !== segment.id)
          .map((orderedSegment) => orderedSegment.id),
      ])

      // Also keep a variant where a movable adverb can return to the end.
      orders.push([
        ...orderedSegments
          .filter((orderedSegment) => orderedSegment.id !== segment.id)
          .map((orderedSegment) => orderedSegment.id),
        segment.id,
      ])

      const remainingSegments = orderedSegments.filter(
        (orderedSegment) => orderedSegment.id !== segment.id,
      )
      const [subjectSegment, verbSegment, ...restSegments] = remainingSegments

      if (
        index === orderedSegments.length - 1 &&
        subjectSegment &&
        verbSegment &&
        frontedTailInversionSubjects.includes(subjectSegment.text)
      ) {
        orders.push([
          segment.id,
          verbSegment.id,
          subjectSegment.id,
          ...restSegments.map((restSegment) => restSegment.id),
        ])
      }
    }
  })

  return uniqueOrders(orders)
}

function englishBuilders() {
  return {
    A1: [
      () => {
        return pick([
          ['i', 'carry', 'my', 'bag'],
          ['we', 'open', 'the', 'window'],
          ['you', 'read', 'this', 'book'],
          ['they', 'watch', 'the', 'screen'],
          ['she', 'keeps', 'the', 'map'],
          ['he', 'closes', 'the', 'door'],
        ])
      },
      () => {
        return pick([
          ['i', 'wash', 'the', 'cup', 'today'],
          ['we', 'clean', 'the', 'desk', 'today'],
          ['they', 'move', 'the', 'chairs', 'inside'],
          ['she', 'closes', 'the', 'window', 'now'],
          ['you', 'carry', 'the', 'coat', 'inside'],
          ['he', 'opens', 'the', 'box', 'here'],
        ])
      },
      () => {
        return pick([
          ['i', 'like', 'this', 'song'],
          ['we', 'bring', 'our', 'books'],
          ['they', 'bring', 'the', 'cake', 'now'],
          ['you', 'take', 'this', 'note'],
          ['i', 'go', 'home', 'now'],
          ['we', 'carry', 'our', 'bags', 'here'],
        ])
      },
      () => {
        return pick([
          ['she', 'reads', 'at', 'home'],
          ['he', 'waits', 'near', 'school'],
          ['they', 'listen', 'in', 'class'],
          ['we', 'meet', 'after', 'school'],
          ['i', 'study', 'at', 'home'],
          ['you', 'wait', 'outside', 'school'],
        ])
      },
    ],
    A2: [
      () => {
        return pick([
          ['i', 'prepare', 'a', 'ticket', 'for', 'tonight'],
          ['we', 'collect', 'the', 'books', 'after', 'class'],
          ['they', 'deliver', 'the', 'package', 'before', 'lunch'],
          ['you', 'choose', 'a', 'gift', 'for', 'your friend'],
          ['i', 'write', 'a', 'message', 'after', 'work'],
          ['we', 'pack', 'our', 'bags', 'before', 'dinner'],
        ])
      },
      () => {
        return pick([
          ['i', 'visit', 'my', 'cousins', 'tomorrow'],
          ['we', 'meet', 'our', 'friends', 'after school'],
          ['they', 'call', 'their', 'neighbors', 'this morning'],
          ['you', 'help', 'your', 'teacher', 'after class'],
          ['we', 'visit', 'our', 'grandparents', 'on Sunday'],
          ['i', 'meet', 'my', 'friends', 'outside'],
        ])
      },
      () => {
        return pick([
          ['she', 'finishes', 'her', 'project', 'before', 'lunch'],
          ['he', 'starts', 'the', 'lesson', 'after', 'breakfast'],
          ['they', 'review', 'the', 'schedule', 'before', 'practice'],
          ['we', 'organize', 'our', 'emails', 'after', 'work'],
          ['she', 'checks', 'the', 'plan', 'before', 'class'],
          ['he', 'updates', 'the', 'list', 'after', 'dinner'],
        ])
      },
      () => {
        return pick([
          ['i', 'keep', 'my', 'notes', 'with me'],
          ['you', 'bring', 'your', 'keys', 'with you'],
          ['we', 'leave', 'the', 'tickets', 'at home'],
          ['they', 'carry', 'their', 'photos', 'for later'],
          ['i', 'save', 'the', 'message', 'for later'],
          ['we', 'bring', 'our', 'tickets', 'to school'],
        ])
      },
    ],
    B1: [
      () => {
        return pick([
          ['i', 'review', 'the', 'report', 'with', 'care', 'today'],
          ['we', 'compare', 'our', 'plans', 'with', 'care', 'tonight'],
          ['they', 'discuss', 'the', 'route', 'without', 'haste', 'today'],
          ['she', 'explains', 'this', 'idea', 'without', 'stress', 'today'],
          ['i', 'check', 'the', 'plan', 'with', 'care', 'tonight'],
          ['we', 'review', 'this', 'report', 'without', 'rush', 'today'],
        ])
      },
      () => {
        return pick([
          ['we', 'present', 'a', 'solution', 'during', 'the', 'meeting'],
          ['they', 'outline', 'the', 'strategy', 'before', 'the', 'workshop'],
          ['she', 'describes', 'the', 'problem', 'after', 'the', 'session'],
          ['he', 'summarizes', 'the', 'proposal', 'during', 'our', 'meeting'],
          ['we', 'present', 'the', 'plan', 'after', 'the', 'workshop'],
          ['they', 'explain', 'a', 'solution', 'during', 'the', 'session'],
        ])
      },
      () => {
        return pick([
          ['i', 'rewrite', 'this', 'draft', 'for', 'the team'],
          ['we', 'update', 'the', 'outline', 'for', 'more clarity'],
          ['they', 'improve', 'the', 'document', 'with', 'better timing'],
          ['you', 'check', 'that', 'message', 'for', 'the team'],
          ['i', 'revise', 'the', 'outline', 'with', 'more detail'],
          ['we', 'improve', 'this', 'document', 'for', 'the class'],
        ])
      },
      () => {
        return pick([
          ['she', 'guides', 'the', 'group', 'through', 'this', 'activity'],
          ['he', 'supports', 'our', 'team', 'during', 'the', 'discussion'],
          ['they', 'prepare', 'the', 'class', 'for', 'the', 'review'],
          ['we', 'organize', 'the', 'team', 'during', 'this', 'discussion'],
          ['she', 'guides', 'our', 'class', 'through', 'the', 'review'],
          ['he', 'supports', 'the', 'group', 'during', 'the', 'activity'],
        ])
      },
    ],
    B2: [
      () => {
        return pick([
          ['i', 'reconsider', 'this', 'strategy', 'after', 'the', 'review'],
          ['we', 'analyze', 'our', 'response', 'under', 'real', 'pressure'],
          ['they', 'clarify', 'the', 'method', 'after', 'the', 'discussion'],
          ['she', 'develops', 'the', 'argument', 'before', 'the', 'review'],
          ['i', 'analyze', 'the', 'response', 'after', 'the', 'discussion'],
          ['we', 'clarify', 'this', 'method', 'before', 'the', 'presentation'],
        ])
      },
      () => {
        return pick([
          ['we', 'reframe', 'the', 'proposal', 'before', 'the', 'decision'],
          ['they', 'question', 'each', 'assumption', 'during', 'the', 'evaluation'],
          ['she', 'balances', 'every', 'detail', 'before', 'the', 'presentation'],
          ['he', 'strengthens', 'the', 'argument', 'during', 'the', 'evaluation'],
          ['we', 'review', 'each', 'constraint', 'before', 'the', 'decision'],
          ['they', 'address', 'every', 'objection', 'during', 'the', 'discussion'],
        ])
      },
      () => {
        return pick([
          ['i', 'structure', 'this', 'analysis', 'for', 'greater precision'],
          ['we', 'review', 'the', 'proposal', 'with', 'better evidence'],
          ['they', 'revise', 'the', 'summary', 'for', 'a demanding audience'],
          ['she', 'defends', 'the', 'position', 'with', 'better evidence'],
          ['i', 'revise', 'the', 'proposal', 'for', 'greater precision'],
          ['we', 'structure', 'the', 'summary', 'for', 'the audience'],
        ])
      },
      () => {
        return pick([
          ['we', 'coordinate', 'the', 'schedule', 'before', 'the', 'deadline'],
          ['they', 'reorganize', 'our', 'approach', 'after', 'the', 'review'],
          ['she', 'refines', 'the', 'framework', 'during', 'the', 'session'],
          ['i', 'reassess', 'the', 'schedule', 'after', 'the', 'discussion'],
          ['we', 'refine', 'our', 'approach', 'before', 'the', 'session'],
          ['they', 'coordinate', 'the', 'framework', 'after', 'the', 'meeting'],
        ])
      },
    ],
  }
}

function spanishBuilders() {
  return {
    A1: [
      () =>
        pick([
          ['yo', 'llevo', 'mi', 'libro'],
          ['nosotros', 'abrimos', 'la', 'ventana'],
          ['ella', 'guarda', 'la', 'foto'],
          ['ellos', 'miran', 'la', 'pantalla'],
          ['tú', 'cierras', 'la', 'puerta'],
          ['yo', 'leo', 'esta', 'nota'],
        ]),
      () =>
        pick([
          ['yo', 'lavo', 'la', 'taza', 'hoy'],
          ['nosotros', 'limpiamos', 'la', 'mesa', 'hoy'],
          ['ellos', 'mueven', 'las', 'sillas', 'adentro'],
          ['ella', 'cierra', 'la', 'ventana', 'ahora'],
          ['tú', 'llevas', 'la', 'chaqueta', 'afuera'],
          ['él', 'abre', 'la', 'caja', 'aquí'],
        ]),
      () =>
        pick([
          ['ella', 'lee', 'en', 'casa'],
          ['él', 'espera', 'cerca de', 'la escuela'],
          ['ellos', 'escuchan', 'en', 'clase'],
          ['nosotros', 'nos vemos', 'después de', 'clase'],
          ['yo', 'estudio', 'en', 'casa'],
          ['tú', 'esperas', 'afuera', 'de la escuela'],
        ]),
      () =>
        pick([
          ['me gusta', 'esta', 'canción'],
          ['nosotros', 'traemos', 'nuestros', 'libros'],
          ['ellos', 'traen', 'el', 'pastel', 'ahora'],
          ['tú', 'tomas', 'esta', 'nota'],
          ['yo', 'voy', 'a casa', 'ahora'],
          ['nosotros', 'llevamos', 'nuestras', 'bolsas', 'aquí'],
        ]),
    ],
    A2: [
      () =>
        pick([
          ['yo', 'preparo', 'un', 'boleto', 'para', 'esta noche'],
          ['nosotros', 'recogemos', 'los', 'libros', 'después de', 'clase'],
          ['ellos', 'entregan', 'el', 'paquete', 'antes de', 'almorzar'],
          ['tú', 'eliges', 'un', 'regalo', 'para', 'tu amiga'],
          ['yo', 'escribo', 'un', 'mensaje', 'después del', 'trabajo'],
          ['nosotros', 'guardamos', 'las', 'bolsas', 'antes de', 'cenar'],
        ]),
      () =>
        pick([
          ['yo', 'visito', 'a mis', 'primos', 'mañana'],
          ['nosotros', 'vemos', 'a nuestros', 'amigos', 'después de clase'],
          ['ellos', 'llaman', 'a sus', 'vecinos', 'esta mañana'],
          ['usted', 'ayuda', 'a su', 'profesor', 'después de clase'],
          ['nosotros', 'visitamos', 'a nuestros', 'abuelos', 'el domingo'],
          ['yo', 'veo', 'a mis', 'amigos', 'afuera'],
        ]),
      () =>
        pick([
          ['ella', 'termina', 'su', 'proyecto', 'antes de', 'almorzar'],
          ['él', 'empieza', 'la', 'clase', 'después del', 'desayuno'],
          ['ellos', 'revisan', 'el', 'horario', 'antes de', 'la práctica'],
          ['nosotros', 'ordenamos', 'nuestros', 'correos', 'después del', 'trabajo'],
          ['ella', 'revisa', 'el', 'plan', 'antes de', 'clase'],
          ['él', 'actualiza', 'la', 'lista', 'después de', 'cenar'],
        ]),
      () =>
        pick([
          ['yo', 'guardo', 'mis', 'notas', 'conmigo'],
          ['usted', 'trae', 'sus', 'llaves', 'con usted'],
          ['nosotros', 'dejamos', 'las', 'entradas', 'en casa'],
          ['ellos', 'llevan', 'sus', 'fotos', 'para después'],
          ['yo', 'guardo', 'el', 'mensaje', 'para después'],
          ['nosotros', 'traemos', 'nuestros', 'boletos', 'a la escuela'],
        ]),
    ],
    B1: [
      () =>
        pick([
          ['yo', 'reviso', 'el', 'informe', 'con', 'calma', 'hoy'],
          ['nosotros', 'comparamos', 'nuestros', 'planes', 'con', 'cuidado', 'esta noche'],
          ['ellos', 'discuten', 'la', 'ruta', 'sin', 'prisa', 'hoy'],
          ['ella', 'explica', 'esta', 'idea', 'sin', 'estrés', 'hoy'],
          ['yo', 'reviso', 'el', 'plan', 'con', 'atención', 'esta noche'],
          ['nosotros', 'leemos', 'esta', 'propuesta', 'sin', 'prisa', 'hoy'],
        ]),
      () =>
        pick([
          ['nosotros', 'presentamos', 'una', 'solución', 'durante', 'la', 'reunión'],
          ['ellos', 'resumen', 'la', 'estrategia', 'antes del', 'taller'],
          ['ella', 'describe', 'el', 'problema', 'después de', 'la sesión'],
          ['él', 'organiza', 'la', 'propuesta', 'durante', 'nuestra', 'reunión'],
          ['nosotros', 'presentamos', 'el', 'plan', 'después del', 'taller'],
          ['ellos', 'explican', 'una', 'respuesta', 'durante', 'la', 'sesión'],
        ]),
      () =>
        pick([
          ['yo', 'reescribo', 'este', 'borrador', 'para', 'el equipo'],
          ['nosotros', 'actualizamos', 'el', 'esquema', 'para', 'más claridad'],
          ['ellos', 'mejoran', 'el', 'documento', 'con', 'mejor ritmo'],
          ['usted', 'revisa', 'ese', 'mensaje', 'para', 'el equipo'],
          ['yo', 'corrijo', 'el', 'esquema', 'con', 'más detalle'],
          ['nosotros', 'mejoramos', 'este', 'documento', 'para', 'la clase'],
        ]),
      () =>
        pick([
          ['ella', 'guía', 'al', 'grupo', 'durante', 'esta', 'actividad'],
          ['él', 'apoya', 'al', 'equipo', 'durante', 'la', 'discusión'],
          ['ellos', 'preparan', 'al', 'curso', 'para', 'la', 'revisión'],
          ['nosotros', 'organizamos', 'al', 'equipo', 'durante', 'esta', 'discusión'],
          ['ella', 'guía', 'al', 'curso', 'durante', 'la', 'revisión'],
          ['él', 'apoya', 'al', 'grupo', 'durante', 'la', 'actividad'],
        ]),
    ],
    B2: [
      () =>
        pick([
          ['yo', 'reconsidero', 'esta', 'estrategia', 'después de', 'la revisión'],
          ['nosotros', 'analizamos', 'nuestra', 'respuesta', 'bajo', 'presión real'],
          ['ellos', 'aclaran', 'el', 'método', 'después de', 'la discusión'],
          ['ella', 'desarrolla', 'el', 'argumento', 'antes de', 'la revisión'],
          ['yo', 'analizo', 'la', 'respuesta', 'después de', 'la discusión'],
          ['nosotros', 'aclaramos', 'este', 'método', 'antes de', 'la presentación'],
        ]),
      () =>
        pick([
          ['nosotros', 'replanteamos', 'la', 'propuesta', 'antes de', 'la decisión'],
          ['ellos', 'cuestionan', 'cada', 'suposición', 'durante', 'la evaluación'],
          ['ella', 'equilibra', 'cada', 'detalle', 'antes de', 'la presentación'],
          ['él', 'fortalece', 'el', 'argumento', 'durante', 'la evaluación'],
          ['nosotros', 'revisamos', 'cada', 'restricción', 'antes de', 'la decisión'],
          ['ellos', 'responden', 'a cada', 'objeción', 'durante', 'la discusión'],
        ]),
      () =>
        pick([
          ['yo', 'estructuro', 'este', 'análisis', 'para', 'más precisión'],
          ['nosotros', 'revisamos', 'la', 'propuesta', 'con', 'mejores pruebas'],
          ['ellos', 'corrigen', 'la', 'síntesis', 'para', 'un público exigente'],
          ['ella', 'defiende', 'la', 'postura', 'con', 'mejores pruebas'],
          ['yo', 'corrijo', 'la', 'propuesta', 'para', 'más precisión'],
          ['nosotros', 'estructuramos', 'la', 'síntesis', 'para', 'el público'],
        ]),
      () =>
        pick([
          ['nosotros', 'coordinamos', 'el', 'calendario', 'antes de', 'la fecha límite'],
          ['ellos', 'reorganizan', 'nuestro', 'enfoque', 'después de', 'la revisión'],
          ['ella', 'refina', 'el', 'marco', 'durante', 'la sesión'],
          ['yo', 'revalúo', 'el', 'calendario', 'después de', 'la discusión'],
          ['nosotros', 'afinamos', 'nuestro', 'enfoque', 'antes de', 'la sesión'],
          ['ellos', 'coordinan', 'el', 'marco', 'después de', 'la reunión'],
        ]),
    ],
  }
}

function frenchBuilders() {
  return {
    A1: [
      () =>
        pick([
          ['je', 'porte', 'mon', 'livre'],
          ['nous', 'ouvrons', 'la', 'fenêtre'],
          ['elle', 'garde', 'la', 'photo'],
          ['ils', 'regardent', "l'écran"],
          ['tu', 'fermes', 'la', 'porte'],
          ['je', 'lis', 'cette', 'note'],
        ]),
      () =>
        pick([
          ['je', 'lave', 'la', 'tasse', "aujourd'hui"],
          ['nous', 'nettoyons', 'la', 'table', "aujourd'hui"],
          ['ils', 'bougent', 'les', 'chaises', 'dedans'],
          ['elle', 'ferme', 'la', 'fenêtre', 'maintenant'],
          ['tu', 'portes', 'la', 'veste', 'dehors'],
          ['il', 'ouvre', 'la', 'boîte', 'ici'],
        ]),
      () =>
        pick([
          ['elle', 'lit', 'à', 'la maison'],
          ['il', 'attend', 'près de', "l'école"],
          ['ils', 'écoutent', 'en', 'classe'],
          ['nous', 'nous voyons', 'après', 'la classe'],
          ["j'étudie", 'à', 'la maison'],
          ['tu', 'attends', 'devant', "l'école"],
        ]),
      () =>
        pick([
          ["j'aime", 'cette', 'chanson'],
          ['nous', 'apportons', 'nos', 'livres'],
          ['ils', 'apportent', 'le', 'gâteau', 'maintenant'],
          ['tu', 'prends', 'cette', 'note'],
          ['je', 'rentre', 'maintenant'],
          ['nous', 'portons', 'nos', 'sacs', 'ici'],
        ]),
    ],
    A2: [
      () =>
        pick([
          ['je', 'prépare', 'un', 'billet', 'pour', 'demain'],
          ['nous', 'portons', 'le', 'colis', 'après', 'le travail'],
          ['ils', 'livrent', 'un', 'message', 'avant', 'le dîner'],
          ['vous', 'choisissez', 'un', 'cadeau', 'pour', 'le cours'],
          ['je', 'prépare', 'un', 'message', 'pour', 'le travail'],
          ['vous', 'choisissez', 'le', 'billet', 'pour', 'demain'],
        ]),
      () =>
        pick([
          ['je', 'visite', 'mes', 'cousins', 'demain'],
          ['nous', 'voyons', 'nos', 'amis', 'dehors'],
          ['ils', 'appellent', 'leurs', 'voisins', 'ce matin'],
          ['vous', 'aidez', 'vos', 'professeurs', 'après la classe'],
          ['je', 'vois', 'mes', 'amis', 'après la classe'],
          ['nous', 'visitons', 'nos', 'voisins', 'demain'],
        ]),
      () =>
        pick([
          ['elle', 'termine', 'son', 'projet', 'avant', 'le déjeuner'],
          ['il', 'commence', 'le', 'cours', 'après', 'le déjeuner'],
          ['ils', 'revoient', 'le', 'planning', 'avant', 'la répétition'],
          ['nous', 'rangeons', 'nos', 'courriels', 'après', 'le travail'],
          ['elle', 'termine', 'le', 'travail', 'avant', 'le dîner'],
          ['nous', 'rangeons', 'le', 'bureau', 'après', 'le cours'],
        ]),
      () =>
        pick([
          ['je', 'garde', 'mes', 'notes', 'à la maison'],
          ['vous', 'apportez', 'vos', 'clés', 'avec vous'],
          ['nous', 'laissons', 'nos', 'billets', "à l'école"],
          ['ils', 'portent', 'leurs', 'photos', 'pour plus tard'],
          ['je', 'garde', 'mes', 'billets', 'avec moi'],
          ['nous', 'apportons', 'nos', 'notes', "à l'école"],
        ]),
    ],
    B1: [
      () =>
        pick([
          ['je', 'relis', 'le', 'rapport', 'avec', 'calme', "aujourd'hui"],
          ['nous', 'comparons', 'nos', 'plans', 'avec', 'soin', 'ce soir'],
          ['ils', 'discutent', 'de la', 'route', 'sans', 'hâte', "aujourd'hui"],
          ['elle', 'explique', 'cette', 'idée', 'sans', 'stress', "aujourd'hui"],
          ['je', 'vérifie', 'le', 'plan', 'avec', 'attention', 'ce soir'],
          ['nous', 'lisons', 'cette', 'proposition', 'sans', 'hâte', "aujourd'hui"],
        ]),
      () =>
        pick([
          ['nous', 'présentons', 'une', 'solution', 'pendant', 'la', 'réunion'],
          ['ils', 'résument', 'la', 'stratégie', 'avant', "l'atelier"],
          ['elle', 'décrit', 'le', 'problème', 'après', 'la séance'],
          ['il', 'organise', 'la', 'proposition', 'pendant', 'notre', 'réunion'],
          ['nous', 'présentons', 'le', 'plan', 'après', "l'atelier"],
          ['ils', 'expliquent', 'une', 'réponse', 'pendant', 'la', 'séance'],
        ]),
      () =>
        pick([
          ['je', 'réécris', 'ce', 'brouillon', 'pour', "l'équipe"],
          ['nous', 'mettons à jour', 'le', 'plan', 'pour', 'plus de clarté'],
          ['ils', 'améliorent', 'le', 'document', 'avec', 'un meilleur rythme'],
          ['vous', 'vérifiez', 'ce', 'message', 'pour', "l'équipe"],
          ['je', 'corrige', 'le', 'plan', 'avec', 'plus de détail'],
          ['nous', 'améliorons', 'ce', 'document', 'pour', 'la classe'],
        ]),
      () =>
        pick([
          ['elle', 'guide', 'le', 'groupe', 'pendant', 'cette', 'activité'],
          ['il', 'soutient', "l'équipe", 'pendant', 'la', 'discussion'],
          ['ils', 'préparent', 'le', 'cours', 'pour', 'la', 'révision'],
          ['nous', 'organisons', "l'équipe", 'pendant', 'cette', 'discussion'],
          ['elle', 'guide', 'la', 'classe', 'pendant', 'la', 'révision'],
          ['il', 'soutient', 'le', 'groupe', 'pendant', "l'activité"],
        ]),
    ],
    B2: [
      () =>
        pick([
          ['je', 'reconsidère', 'cette', 'stratégie', 'après', 'la discussion'],
          ['nous', 'analysons', 'notre', 'réponse', 'sous', 'pression réelle'],
          ['ils', 'clarifient', 'la', 'position', 'après', 'la révision'],
          ['elle', 'développe', 'son', 'argumentation', 'avant', 'la réunion'],
          ['je', 'analyse', 'la', 'réponse', 'après', 'la séance'],
          ['nous', 'clarifions', 'la', 'méthode', 'avant', 'la présentation'],
        ]),
      () =>
        pick([
          ['nous', 'reformulons', 'la', 'proposition', 'avant', 'la décision'],
          ['ils', 'questionnent', 'chaque', 'hypothèse', 'pendant', "l'évaluation"],
          ['elle', 'équilibre', 'chaque', 'détail', 'avant', 'la présentation'],
          ['il', 'renforce', 'la', 'position', 'pendant', 'la discussion'],
          ['nous', 'reformulons', 'chaque', 'objection', 'avant', 'la réunion'],
          ['ils', 'questionnent', 'la', 'contrainte', 'pendant', 'le débat'],
        ]),
      () =>
        pick([
          ['je', 'structure', 'cette', 'analyse', 'pour', 'plus de précision'],
          ['nous', 'revoyons', 'la', 'synthèse', 'avec', 'de meilleures preuves'],
          ['ils', 'corrigent', 'la', 'proposition', 'pour', 'un public exigeant'],
          ['elle', 'défend', 'la', 'position', 'avec', 'des preuves solides'],
          ['je', 'corrige', 'la', 'synthèse', 'pour', 'plus de clarté'],
          ['nous', 'structurons', 'la', 'proposition', 'avec', 'plus de rigueur'],
        ]),
      () =>
        pick([
          ['nous', 'coordonnons', 'le', 'calendrier', 'avant', "l'échéance"],
          ['ils', 'réorganisent', 'notre', 'approche', 'après', 'la révision'],
          ['elle', 'affine', 'le', 'cadre', 'pendant', 'la séance'],
          ['je', 'réévalue', 'la', 'méthode', 'après', 'la discussion'],
          ['nous', 'coordonnons', 'notre', 'approche', 'avant', 'la réunion'],
          ['ils', 'affinent', 'le', 'cadre', 'après', 'la séance'],
        ]),
    ],
  }
}

function italianBuilders() {
  return {
    A1: [
      () =>
        pick([
          ['io', 'porto', 'il', 'libro'],
          ['noi', 'apriamo', 'la', 'finestra'],
          ['lei', 'tiene', 'la', 'foto'],
          ['loro', 'guardano', 'lo', 'schermo'],
          ['tu', 'chiudi', 'la', 'porta'],
          ['io', 'leggo', 'questa', 'nota'],
        ]),
      () =>
        pick([
          ['io', 'lavo', 'la', 'tazza', 'oggi'],
          ['noi', 'puliamo', 'il', 'tavolo', 'oggi'],
          ['loro', 'spostano', 'le', 'sedie', 'dentro'],
          ['lei', 'chiude', 'la', 'finestra', 'adesso'],
          ['tu', 'porti', 'la', 'giacca', 'fuori'],
          ['lui', 'apre', 'la', 'scatola', 'qui'],
        ]),
      () =>
        pick([
          ['lei', 'legge', 'a', 'casa'],
          ['lui', 'aspetta', 'vicino alla', 'scuola'],
          ['loro', 'ascoltano', 'in', 'classe'],
          ['noi', 'ci vediamo', 'dopo', 'scuola'],
          ['io', 'studio', 'a', 'casa'],
          ['tu', 'aspetti', 'fuori', 'da scuola'],
        ]),
      () =>
        pick([
          ['mi piace', 'questa', 'canzone'],
          ['noi', 'portiamo', 'i nostri', 'libri'],
          ['loro', 'portano', 'la', 'torta', 'adesso'],
          ['tu', 'prendi', 'questa', 'nota'],
          ['io', 'vado', 'a casa', 'adesso'],
          ['noi', 'portiamo', 'le nostre', 'borse', 'qui'],
        ]),
    ],
    A2: [
      () =>
        pick([
          ['io', 'preparo', 'un', 'biglietto', 'per', 'domani'],
          ['noi', 'portiamo', 'il', 'pacco', 'dopo', 'il lavoro'],
          ['loro', 'consegnano', 'un', 'messaggio', 'prima di', 'cena'],
          ['voi', 'scegliete', 'un', 'regalo', 'per', 'la lezione'],
          ['io', 'preparo', 'un', 'messaggio', 'per', 'il lavoro'],
          ['voi', 'scegliete', 'il', 'biglietto', 'per', 'domani'],
        ]),
      () =>
        pick([
          ['io', 'visito', 'i miei', 'cugini', 'domani'],
          ['noi', 'vediamo', 'i nostri', 'amici', 'fuori'],
          ['loro', 'chiamano', 'i loro', 'vicini', 'stamattina'],
          ['voi', 'aiutate', 'i vostri', 'docenti', 'dopo scuola'],
          ['io', 'vedo', 'i miei', 'amici', 'dopo scuola'],
          ['noi', 'visitiamo', 'i nostri', 'vicini', 'domani'],
        ]),
      () =>
        pick([
          ['lei', 'finisce', 'il', 'progetto', 'prima di', 'pranzo'],
          ['lui', 'inizia', 'il', 'corso', 'dopo', 'pranzo'],
          ['loro', 'rivedono', "l'orario", 'prima della', 'prova'],
          ['noi', 'ordiniamo', 'i nostri', 'messaggi', 'dopo', 'il lavoro'],
          ['lei', 'finisce', 'il', 'lavoro', 'prima di', 'cena'],
          ['noi', 'ordiniamo', 'la', 'scrivania', 'dopo', 'la lezione'],
        ]),
      () =>
        pick([
          ['io', 'tengo', 'gli', 'appunti', 'a casa'],
          ['voi', 'portate', 'i vostri', 'documenti', 'con voi'],
          ['noi', 'lasciamo', 'i nostri', 'biglietti', 'a scuola'],
          ['loro', 'conservano', 'le', 'foto', 'per dopo'],
          ['io', 'tengo', 'le', 'chiavi', 'con me'],
          ['noi', 'portiamo', 'i nostri', 'appunti', 'a scuola'],
        ]),
    ],
    B1: [
      () =>
        pick([
          ['io', 'rileggo', 'il', 'rapporto', 'con', 'calma', 'oggi'],
          ['noi', 'confrontiamo', 'i nostri', 'piani', 'con', 'cura', 'stasera'],
          ['loro', 'discutono', 'del', 'percorso', 'senza', 'fretta', 'oggi'],
          ['lei', 'spiega', 'questa', 'idea', 'senza', 'stress', 'oggi'],
          ['io', 'controllo', 'il', 'piano', 'con', 'attenzione', 'stasera'],
          ['noi', 'leggiamo', 'questa', 'proposta', 'senza', 'fretta', 'oggi'],
        ]),
      () =>
        pick([
          ['noi', 'presentiamo', 'una', 'soluzione', 'durante', 'la', 'riunione'],
          ['loro', 'riassumono', 'la', 'strategia', 'prima del', 'laboratorio'],
          ['lei', 'descrive', 'il', 'problema', 'dopo', 'la sessione'],
          ['lui', 'organizza', 'la', 'proposta', 'durante', 'la nostra', 'riunione'],
          ['noi', 'presentiamo', 'il', 'piano', 'dopo', 'il laboratorio'],
          ['loro', 'spiegano', 'una', 'risposta', 'durante', 'la', 'sessione'],
        ]),
      () =>
        pick([
          ['io', 'riscrivo', 'questa', 'bozza', 'per', 'il gruppo'],
          ['noi', 'aggiorniamo', 'il', 'piano', 'per', 'più chiarezza'],
          ['loro', 'migliorano', 'il', 'documento', 'con', 'un ritmo migliore'],
          ['voi', 'controllate', 'quel', 'messaggio', 'per', 'il gruppo'],
          ['io', 'correggo', 'il', 'piano', 'con', 'più dettaglio'],
          ['noi', 'miglioriamo', 'questo', 'documento', 'per', 'la classe'],
        ]),
      () =>
        pick([
          ['lei', 'guida', 'il', 'gruppo', 'durante', 'questa', 'attività'],
          ['lui', 'sostiene', 'il', 'team', 'durante', 'la', 'discussione'],
          ['loro', 'preparano', 'il', 'corso', 'per', 'la', 'revisione'],
          ['noi', 'organizziamo', 'il', 'team', 'durante', 'questa', 'discussione'],
          ['lei', 'guida', 'la', 'classe', 'durante', 'la', 'revisione'],
          ['lui', 'sostiene', 'il', 'gruppo', 'durante', 'l', 'attività'],
        ]),
    ],
    B2: [
      () =>
        pick([
          ['io', 'riconsidero', 'questa', 'strategia', 'dopo', 'la discussione'],
          ['noi', 'analizziamo', 'la', 'risposta', 'sotto', 'pressione reale'],
          ['loro', 'chiariscono', 'la', 'posizione', 'dopo', 'la revisione'],
          ['lei', 'sviluppa', "l'analisi", 'prima della', 'riunione'],
          ['io', 'analizzo', 'la', 'risposta', 'dopo', 'la sessione'],
          ['noi', 'chiarifichiamo', 'il', 'metodo', 'prima della', 'presentazione'],
        ]),
      () =>
        pick([
          ['noi', 'riformuliamo', 'la', 'proposta', 'prima della', 'decisione'],
          ['loro', 'mettono in dubbio', 'ogni', 'ipotesi', 'durante', 'la valutazione'],
          ['lei', 'equilibra', 'ogni', 'dettaglio', 'prima della', 'presentazione'],
          ['lui', 'rafforza', 'la', 'posizione', 'durante', 'la discussione'],
          ['noi', 'riformuliamo', 'ogni', 'obiezione', 'prima della', 'riunione'],
          ['loro', 'mettono in dubbio', 'il', 'vincolo', 'durante', 'il dibattito'],
        ]),
      () =>
        pick([
          ['io', 'strutturo', 'questa', 'analisi', 'per', 'più precisione'],
          ['noi', 'rivediamo', 'la', 'sintesi', 'con', 'prove migliori'],
          ['loro', 'correggono', 'la', 'proposta', 'per', 'un pubblico esigente'],
          ['lei', 'difende', 'la', 'posizione', 'con', 'prove solide'],
          ['io', 'correggo', 'la', 'sintesi', 'per', 'più chiarezza'],
          ['noi', 'strutturiamo', 'la', 'proposta', 'con', 'più rigore'],
        ]),
      () =>
        pick([
          ['noi', 'coordiniamo', 'il', 'calendario', 'prima della', 'scadenza'],
          ['loro', 'riorganizzano', 'il nostro', 'approccio', 'dopo', 'la revisione'],
          ['lei', 'affina', 'il', 'quadro', 'durante', 'la sessione'],
          ['io', 'rivaluto', 'il', 'metodo', 'dopo', 'la discussione'],
          ['noi', 'coordiniamo', 'il nostro', 'approccio', 'prima della', 'riunione'],
          ['loro', 'affinano', 'il', 'quadro', 'dopo', 'la sessione'],
        ]),
    ],
  }
}

function germanBuilders() {
  return {
    A1: [
      () => pick([['ich', 'trage', 'mein', 'Buch'], ['wir', 'öffnen', 'das', 'Fenster'], ['du', 'schließt', 'die', 'Tür'], ['sie', 'sehen', 'das', 'Bild'], ['ich', 'lese', 'diese', 'Notiz'], ['sie', 'halten', 'die', 'Karte']]),
      () => pick([['ich', 'wasche', 'die', 'Tasse', 'heute'], ['wir', 'putzen', 'den', 'Tisch', 'heute'], ['sie', 'bewegen', 'die', 'Stühle', 'nach drinnen'], ['sie', 'schließt', 'das', 'Fenster', 'jetzt'], ['du', 'trägst', 'die', 'Jacke', 'nach draußen'], ['er', 'öffnet', 'die', 'Box', 'hier']]),
      () => pick([['sie', 'liest', 'zu', 'Hause'], ['er', 'wartet', 'bei', 'der Schule'], ['sie', 'hören', 'im', 'Unterricht'], ['wir', 'treffen', 'uns', 'nach', 'der Schule'], ['ich', 'lerne', 'zu', 'Hause'], ['du', 'wartest', 'vor', 'der Schule']]),
      () => pick([['ich', 'mag', 'dieses', 'Lied'], ['wir', 'bringen', 'unsere', 'Bücher'], ['sie', 'bringen', 'den', 'Kuchen', 'jetzt'], ['du', 'nimmst', 'diese', 'Notiz'], ['ich', 'gehe', 'nach Hause', 'jetzt'], ['wir', 'tragen', 'unsere', 'Taschen', 'hierher']]),
    ],
    A2: [
      () => pick([['ich', 'bereite', 'ein', 'Ticket', 'für', 'heute Abend'], ['wir', 'holen', 'die', 'Bücher', 'nach', 'dem Unterricht'], ['sie', 'liefern', 'das', 'Paket', 'vor', 'dem Mittagessen'], ['ihr', 'wählt', 'ein', 'Geschenk', 'für', 'eure Freundin'], ['ich', 'schreibe', 'eine', 'Nachricht', 'nach', 'der Arbeit'], ['wir', 'packen', 'unsere', 'Taschen', 'vor', 'dem Essen']]),
      () => pick([['ich', 'besuche', 'meine', 'Cousins', 'morgen'], ['wir', 'treffen', 'unsere', 'Freunde', 'nach der Schule'], ['sie', 'rufen', 'ihre', 'Nachbarn', 'heute Morgen'], ['ihr', 'helft', 'eurem', 'Lehrer', 'nach dem Unterricht'], ['wir', 'besuchen', 'unsere', 'Großeltern', 'am Sonntag'], ['ich', 'treffe', 'meine', 'Freunde', 'draußen']]),
      () => pick([['sie', 'beendet', 'ihr', 'Projekt', 'vor', 'dem Mittagessen'], ['er', 'beginnt', 'den', 'Unterricht', 'nach', 'dem Frühstück'], ['sie', 'prüfen', 'den', 'Plan', 'vor', 'dem Training'], ['wir', 'ordnen', 'unsere', 'E Mails', 'nach', 'der Arbeit'], ['sie', 'aktualisiert', 'die', 'Liste', 'nach', 'dem Abendessen'], ['er', 'überprüft', 'das', 'Dokument', 'vor', 'dem Meeting']]),
      () => pick([['ich', 'behalte', 'meine', 'Notizen', 'bei mir'], ['ihr', 'tragt', 'eure', 'Schlüssel', 'bei euch'], ['wir', 'lassen', 'die', 'Tickets', 'zu Hause'], ['sie', 'nehmen', 'ihre', 'Fotos', 'für später'], ['ich', 'speichere', 'die', 'Nachricht', 'für später'], ['wir', 'bringen', 'unsere', 'Tickets', 'zur Schule']]),
    ],
    B1: [
      () => pick([['ich', 'prüfe', 'den', 'Bericht', 'mit', 'Ruhe', 'heute'], ['wir', 'vergleichen', 'unsere', 'Pläne', 'mit', 'Sorgfalt', 'heute Abend'], ['sie', 'besprechen', 'die', 'Route', 'ohne', 'Eile', 'heute'], ['sie', 'erklärt', 'diese', 'Idee', 'ohne', 'Stress', 'heute'], ['ich', 'überprüfe', 'den', 'Plan', 'mit', 'Aufmerksamkeit', 'heute Abend'], ['wir', 'lesen', 'diesen', 'Vorschlag', 'ohne', 'Eile', 'heute']]),
      () => pick([['wir', 'präsentieren', 'eine', 'Lösung', 'während', 'des', 'Treffens'], ['sie', 'skizzieren', 'die', 'Strategie', 'vor', 'dem Workshop'], ['sie', 'beschreibt', 'das', 'Problem', 'nach', 'dem Gespräch'], ['er', 'ordnet', 'den', 'Vorschlag', 'während', 'unseres', 'Treffens'], ['wir', 'präsentieren', 'den', 'Plan', 'nach', 'dem Workshop'], ['sie', 'erläutern', 'eine', 'Antwort', 'während', 'des', 'Gesprächs']]),
      () => pick([['ich', 'überarbeite', 'diesen', 'Entwurf', 'für', 'das Team'], ['wir', 'aktualisieren', 'den', 'Plan', 'für', 'mehr Klarheit'], ['sie', 'verbessern', 'den', 'Bericht', 'mit', 'besserer Struktur'], ['ihr', 'kontrolliert', 'diese', 'Nachricht', 'für', 'das Team'], ['ich', 'korrigiere', 'den', 'Plan', 'mit', 'mehr Details'], ['wir', 'verbessern', 'diesen', 'Text', 'für', 'die Klasse']]),
      () => pick([['sie', 'führt', 'die', 'Gruppe', 'durch', 'diese', 'Übung'], ['er', 'unterstützt', 'unsere', 'Mannschaft', 'während', 'der', 'Diskussion'], ['sie', 'bereiten', 'die', 'Klasse', 'auf', 'die', 'Prüfung', 'vor'], ['wir', 'organisieren', 'das', 'Team', 'während', 'dieser', 'Besprechung'], ['sie', 'führt', 'unsere', 'Klasse', 'durch', 'die', 'Übung'], ['er', 'unterstützt', 'die', 'Gruppe', 'während', 'der', 'Aktivität']]),
    ],
    B2: [
      () => pick([['ich', 'überdenke', 'diese', 'Strategie', 'nach', 'der', 'Prüfung'], ['wir', 'analysieren', 'unsere', 'Antwort', 'unter', 'realem', 'Druck'], ['sie', 'klären', 'die', 'Methode', 'nach', 'der', 'Diskussion'], ['sie', 'entwickelt', 'das', 'Argument', 'vor', 'der', 'Prüfung'], ['ich', 'analysiere', 'die', 'Antwort', 'nach', 'der', 'Diskussion'], ['wir', 'klären', 'diese', 'Methode', 'vor', 'der', 'Präsentation']]),
      () => pick([['wir', 'formulieren', 'den', 'Vorschlag', 'vor', 'der', 'Entscheidung'], ['sie', 'hinterfragen', 'jede', 'Annahme', 'während', 'der', 'Bewertung'], ['sie', 'balanciert', 'jede', 'Einzelheit', 'vor', 'der', 'Präsentation'], ['er', 'stärkt', 'das', 'Argument', 'während', 'der', 'Bewertung'], ['wir', 'prüfen', 'jede', 'Grenze', 'vor', 'der', 'Entscheidung'], ['sie', 'beantworten', 'jeden', 'Einwand', 'während', 'der', 'Diskussion']]),
      () => pick([['ich', 'strukturiere', 'diese', 'Analyse', 'für', 'mehr Präzision'], ['wir', 'überprüfen', 'die', 'Vorlage', 'mit', 'besseren Belegen'], ['sie', 'überarbeiten', 'die', 'Zusammenfassung', 'für', 'ein anspruchsvolles Publikum'], ['sie', 'verteidigt', 'die', 'Position', 'mit', 'besseren Belegen'], ['ich', 'überarbeite', 'die', 'Vorlage', 'für', 'mehr Präzision'], ['wir', 'strukturieren', 'die', 'Zusammenfassung', 'für', 'das Publikum']]),
      () => pick([['wir', 'koordinieren', 'den', 'Zeitplan', 'vor', 'der', 'Frist'], ['sie', 'reorganisieren', 'unseren', 'Ansatz', 'nach', 'der', 'Prüfung'], ['sie', 'verfeinert', 'den', 'Rahmen', 'während', 'der', 'Sitzung'], ['ich', 'bewerte', 'den', 'Zeitplan', 'nach', 'der', 'Diskussion'], ['wir', 'verfeinern', 'unseren', 'Ansatz', 'vor', 'der', 'Sitzung'], ['sie', 'koordinieren', 'den', 'Rahmen', 'nach', 'dem', 'Treffen']]),
    ],
  }
}

function mandarinBuilders() {
  return {
    A1: [
      () => pick([['我', '拿着', '书'], ['我们', '打开', '窗户'], ['她', '收着', '照片'], ['你', '关上', '门'], ['我', '读', '这张', '便条'], ['他们', '看着', '屏幕']]),
      () => pick([['我', '今天', '洗', '杯子'], ['我们', '今天', '擦', '桌子'], ['他们', '把', '椅子', '搬到', '里面'], ['她', '现在', '关上', '窗户'], ['你', '把', '外套', '带到', '外面'], ['他', '在这里', '打开', '盒子']]),
      () => pick([['她', '在家里', '读书'], ['他', '在学校旁边', '等'], ['他们', '在课堂上', '听'], ['我们', '放学后', '见面'], ['我', '在家里', '学习'], ['你', '在学校外面', '等']]),
      () => pick([['我', '喜欢', '这首歌'], ['我们', '带着', '书'], ['他们', '现在', '带来', '蛋糕'], ['你', '拿着', '这张', '便条'], ['我', '现在', '回家'], ['我们', '把', '书包', '带到', '这里']]),
    ],
    A2: [
      () => pick([['我', '为', '今晚', '准备', '车票'], ['我们', '下课后', '收好', '书'], ['他们', '午饭前', '送来', '包裹'], ['你', '给', '朋友', '选', '礼物'], ['我', '下班后', '写', '留言'], ['我们', '晚饭前', '收拾', '包']]),
      () => pick([['我', '明天', '拜访', '朋友'], ['我们', '放学后', '见', '老师'], ['他们', '今天早上', '联系', '邻居'], ['你', '下课后', '帮助', '同学'], ['我们', '周日', '拜访', '家人'], ['我', '在外面', '见', '朋友']]),
      () => pick([['她', '午饭前', '完成', '项目'], ['他', '早饭后', '开始', '课程'], ['他们', '练习前', '检查', '计划'], ['我们', '下课后', '整理', '邮件'], ['她', '上课前', '更新', '名单'], ['他', '晚饭后', '整理', '文件']]),
      () => pick([['我', '把', '笔记', '带在身边'], ['你', '把', '钥匙', '带在身边'], ['我们', '把', '票', '留在家里'], ['他们', '把', '照片', '留到以后'], ['我', '把', '留言', '留到以后'], ['我们', '把', '车票', '带到学校']]),
    ],
    B1: [
      () => pick([['我', '今天', '认真地', '检查', '报告'], ['我们', '今晚', '仔细地', '比较', '计划'], ['他们', '今天', '从容地', '讨论', '路线'], ['她', '今天', '平静地', '解释', '想法'], ['我', '今晚', '认真地', '查看', '计划'], ['我们', '今天', '仔细地', '阅读', '提案']]),
      () => pick([['我们', '在', '会议中', '提出', '方案'], ['他们', '在', '工作坊前', '概述', '策略'], ['她', '在', '会后', '说明', '问题'], ['他', '在', '会议中', '整理', '提案'], ['我们', '在', '工作坊后', '介绍', '计划'], ['他们', '在', '讨论中', '解释', '回答']]),
      () => pick([['我', '为', '团队', '重写', '草稿'], ['我们', '为', '更清楚', '更新', '计划'], ['他们', '为', '更好节奏', '改进', '文件'], ['你', '为', '团队', '检查', '信息'], ['我', '用', '更多细节', '修改', '计划'], ['我们', '为', '课堂', '完善', '文件']]),
      () => pick([['她', '在', '活动中', '带领', '小组'], ['他', '在', '讨论中', '支持', '团队'], ['他们', '为', '复习', '准备', '班级'], ['我们', '在', '讨论中', '组织', '团队'], ['她', '在', '复习中', '带领', '班级'], ['他', '在', '活动中', '支持', '小组']]),
    ],
    B2: [
      () => pick([['我', '在', '评估后', '重新思考', '策略'], ['我们', '在', '真实压力下', '分析', '回应'], ['他们', '在', '讨论后', '澄清', '方法'], ['她', '在', '评估前', '展开', '论点'], ['我', '在', '讨论后', '分析', '回应'], ['我们', '在', '展示前', '澄清', '方法']]),
      () => pick([['我们', '在', '决定前', '重新表述', '提案'], ['他们', '在', '评估中', '质疑', '假设'], ['她', '在', '展示前', '平衡', '细节'], ['他', '在', '评估中', '加强', '论点'], ['我们', '在', '决定前', '检查', '限制'], ['他们', '在', '讨论中', '回应', '异议']]),
      () => pick([['我', '为了', '更高精度', '整理', '分析'], ['我们', '用', '更强证据', '检查', '提案'], ['他们', '为了', '严格听众', '修改', '总结'], ['她', '用', '更强证据', '维护', '观点'], ['我', '为了', '更高精度', '修改', '提案'], ['我们', '为了', '听众', '整理', '总结']]),
      () => pick([['我们', '在', '期限前', '协调', '时间表'], ['他们', '在', '复盘后', '重组', '方法'], ['她', '在', '会议中', '细化', '框架'], ['我', '在', '讨论后', '重新评估', '时间表'], ['我们', '在', '会议前', '细化', '方法'], ['他们', '在', '会后', '协调', '框架']]),
    ],
  }
}

function swedishBuilders() {
  return {
    A1: [
      () => pick([['jag', 'bär', 'min', 'bok'], ['vi', 'öppnar', 'fönstret'], ['hon', 'håller', 'bilden'], ['du', 'stänger', 'dörren'], ['jag', 'läser', 'den här', 'lappen'], ['de', 'tittar', 'på', 'skärmen']]),
      () => pick([['jag', 'tvättar', 'koppen', 'idag'], ['vi', 'städar', 'bordet', 'idag'], ['de', 'flyttar', 'in', 'stolarna'], ['hon', 'stänger', 'fönstret', 'nu'], ['du', 'tar', 'ut', 'jackan'], ['han', 'öppnar', 'lådan', 'här']]),
      () => pick([['hon', 'läser', 'hemma'], ['han', 'väntar', 'vid', 'skolan'], ['de', 'lyssnar', 'i', 'klassrummet'], ['vi', 'ses', 'efter', 'skolan'], ['jag', 'studerar', 'hemma'], ['du', 'väntar', 'utanför', 'skolan']]),
      () => pick([['jag', 'gillar', 'den här', 'sången'], ['vi', 'tar med', 'våra', 'böcker'], ['de', 'tar', 'med', 'kakan', 'nu'], ['du', 'tar', 'den här', 'lappen'], ['jag', 'går', 'hem', 'nu'], ['vi', 'bär', 'våra', 'väskor', 'hit']]),
    ],
    A2: [
      () =>
        pick([
          ['jag', 'förbereder', 'en', 'biljett', 'för', 'imorgon'],
          ['vi', 'tar med', 'den', 'påsen', 'efter', 'jobbet'],
          ['de', 'levererar', 'en', 'present', 'före', 'middagen'],
          ['ni', 'väljer', 'en', 'biljett', 'för', 'lektionen'],
          ['jag', 'förbereder', 'en', 'lapp', 'för', 'jobbet'],
          ['ni', 'väljer', 'den', 'presenten', 'för', 'imorgon'],
        ]),
      () =>
        pick([
          ['jag', 'besöker', 'mina', 'kusiner', 'imorgon'],
          ['vi', 'träffar', 'våra', 'vänner', 'ute'],
          ['de', 'ringer', 'sina', 'grannar', 'i morse'],
          ['ni', 'hjälper', 'era', 'lärare', 'efter skolan'],
          ['jag', 'träffar', 'mina', 'vänner', 'efter skolan'],
          ['vi', 'besöker', 'våra', 'grannar', 'imorgon'],
        ]),
      () =>
        pick([
          ['hon', 'avslutar', 'projektet', 'före', 'lunchen'],
          ['han', 'börjar', 'arbetet', 'efter', 'lunchen'],
          ['de', 'granskar', 'schemat', 'före', 'träningen'],
          ['vi', 'ordnar', 'meddelandet', 'efter', 'jobbet'],
          ['hon', 'avslutar', 'arbetet', 'före', 'middagen'],
          ['vi', 'ordnar', 'bordet', 'efter', 'lektionen'],
        ]),
      () =>
        pick([
          ['jag', 'behåller', 'anteckningarna', 'hemma'],
          ['ni', 'tar med', 'nycklarna', 'i skolan'],
          ['vi', 'lämnar', 'biljetterna', 'hemma'],
          ['de', 'sparar', 'bilderna', 'till senare'],
          ['jag', 'behåller', 'nycklarna', 'hos mig'],
          ['vi', 'tar med', 'anteckningarna', 'i skolan'],
        ]),
    ],
    B1: [
      () =>
        pick([
          ['jag', 'granskar', 'rapporten', 'med', 'lugn', 'idag'],
          ['vi', 'jämför', 'förslaget', 'med', 'omsorg', 'ikväll'],
          ['de', 'diskuterar', 'rutten', 'utan', 'brådska', 'idag'],
          ['hon', 'förklarar', 'idén', 'utan', 'stress', 'idag'],
          ['jag', 'granskar', 'planen', 'med', 'fokus', 'ikväll'],
          ['vi', 'läser', 'förslaget', 'utan', 'brådska', 'idag'],
        ]),
      () =>
        pick([
          ['vi', 'presenterar', 'en', 'lösning', 'under', 'mötet'],
          ['de', 'skissar', 'strategin', 'före', 'workshopen'],
          ['hon', 'beskriver', 'problemet', 'efter', 'samtalet'],
          ['han', 'ordnar', 'planen', 'under', 'mötet'],
          ['vi', 'presenterar', 'förslaget', 'efter', 'workshopen'],
          ['de', 'förklarar', 'en', 'lösning', 'under', 'samtalet'],
        ]),
      () =>
        pick([
          ['jag', 'skriver om', 'det här', 'utkastet', 'för', 'laget'],
          ['vi', 'uppdaterar', 'vårt', 'upplägg', 'för', 'mer tydlighet'],
          ['de', 'förbättrar', 'dokumentet', 'med', 'bättre rytm'],
          ['ni', 'kontrollerar', 'det', 'meddelandet', 'för', 'laget'],
          ['jag', 'bearbetar', 'utkastet', 'med', 'mer detalj'],
          ['vi', 'förbättrar', 'dokumentet', 'för', 'klassen'],
        ]),
      () =>
        pick([
          ['hon', 'leder', 'gruppen', 'under', 'den här', 'övningen'],
          ['han', 'stöttar', 'teamet', 'i', 'den här', 'diskussionen'],
          ['de', 'förbereder', 'klassen', 'för', 'granskningen'],
          ['vi', 'organiserar', 'teamet', 'under', 'diskussionen'],
          ['hon', 'leder', 'klassen', 'under', 'granskningen'],
          ['han', 'stöttar', 'gruppen', 'under', 'övningen'],
        ]),
    ],
    B2: [
      () =>
        pick([
          ['jag', 'omprövar', 'den här', 'strategin', 'efter', 'diskussionen'],
          ['vi', 'analyserar', 'responsen', 'under', 'verklig press'],
          ['de', 'förtydligar', 'positionen', 'efter', 'granskningen'],
          ['hon', 'utvecklar', 'analysen', 'före', 'presentationen'],
          ['jag', 'analyserar', 'responsen', 'efter', 'sessionen'],
          ['vi', 'förtydligar', 'metoden', 'före', 'beslutet'],
        ]),
      () =>
        pick([
          ['vi', 'omformulerar', 'varje', 'invändning', 'före', 'beslutet'],
          ['de', 'ifrågasätter', 'varje', 'antagande', 'under', 'utvärderingen'],
          ['hon', 'balanserar', 'varje', 'detalj', 'före', 'presentationen'],
          ['han', 'stärker', 'positionen', 'under', 'diskussionen'],
          ['vi', 'omformulerar', 'begränsningen', 'före', 'mötet'],
          ['de', 'ifrågasätter', 'det', 'antagandet', 'under', 'granskningen'],
        ]),
      () =>
        pick([
          ['jag', 'strukturerar', 'den här', 'analysen', 'för', 'större precision'],
          ['vi', 'granskar', 'sammanfattningen', 'med', 'bättre stöd'],
          ['de', 'bearbetar', 'planen', 'för', 'en krävande publik'],
          ['hon', 'försvarar', 'positionen', 'med', 'starka argument'],
          ['jag', 'bearbetar', 'analysen', 'för', 'mer tydlighet'],
          ['vi', 'strukturerar', 'planen', 'med', 'mer precision'],
        ]),
      () =>
        pick([
          ['vi', 'samordnar', 'schemat', 'före', 'sessionen'],
          ['de', 'omorganiserar', 'metoden', 'efter', 'genomgången'],
          ['hon', 'förfinar', 'ramen', 'under', 'sessionen'],
          ['jag', 'omvärderar', 'metoden', 'efter', 'diskussionen'],
          ['vi', 'samordnar', 'ramen', 'före', 'deadlineen'],
          ['de', 'förfinar', 'schemat', 'efter', 'mötet'],
        ]),
    ],
  }
}

const UI_STRINGS = {
  english: {
    eyebrow: 'Language Listening Puzzle',
    title: '',
    intro:
      'Pick a language and CEFR level, listen to the shuffled buttons, and reconstruct the sentence in the correct order.',
    practiceLanguage: 'Practice language',
    practiceLanguages: 'Practice languages',
    menu: 'Menu',
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
    cefrLevel: 'CEFR level',
    cefrLevels: 'CEFR levels',
    voice: 'Voice',
    voiceGender: 'Voice gender',
    reveal: 'Reveal while playing',
    revealModes: 'Reveal while playing',
    female: 'Female',
    male: 'Male',
    on: 'On',
    off: 'Off',
    instruction:
      'Listen to each piece and place it on the line in the correct sentence order.',
    newPuzzleLoaded: 'New puzzle loaded',
    speechUnavailable: 'Speech synthesis is not available in this browser.',
    voiceUnavailable: 'No voice is available for this language on this device.',
    shuffledButtons: 'Shuffled audio buttons',
    playSegment: 'Play segment',
    playFullSentence: 'Play sentence',
    restart: 'Start over',
    newPuzzle: 'New puzzle',
    solved: 'Good job',
    tryAgain: 'Not quite there yet.',
  },
  spanish: {
    eyebrow: 'Rompecabezas Auditivo',
    title: '',
    intro:
      'Elige un idioma y un nivel MCER, escucha los botones mezclados y reconstruye la frase en el orden correcto.',
    practiceLanguage: 'Idioma de práctica',
    practiceLanguages: 'Idiomas de práctica',
    menu: 'Menú',
    openMenu: 'Abrir menú',
    closeMenu: 'Cerrar menú',
    cefrLevel: 'Nivel MCER',
    cefrLevels: 'Niveles MCER',
    voice: 'Voz',
    voiceGender: 'Género de voz',
    reveal: 'Mostrar al reproducir',
    revealModes: 'Mostrar al reproducir',
    female: 'Femenina',
    male: 'Masculina',
    on: 'Activado',
    off: 'Desactivado',
    instruction:
      'Escucha cada pieza y colócala en la línea en el orden correcto de la frase.',
    newPuzzleLoaded: 'Nuevo ejercicio cargado',
    speechUnavailable: 'La síntesis de voz no está disponible en este navegador.',
    voiceUnavailable: 'No hay ninguna voz disponible para este idioma en este dispositivo.',
    shuffledButtons: 'Botones de audio mezclados',
    playSegment: 'Reproducir segmento',
    playFullSentence: 'Reproducir frase completa',
    restart: 'Empezar de nuevo',
    newPuzzle: 'Nueva frase',
    solved: 'Resuelto',
    tryAgain: 'Aún no está del todo.',
  },
  french: {
    eyebrow: "Puzzle D'Ecoute",
    title: '',
    intro:
      'Choisis une langue et un niveau CECR, écoute les boutons mélangés et reconstruis la phrase dans le bon ordre.',
    practiceLanguage: 'Langue à pratiquer',
    practiceLanguages: 'Langues à pratiquer',
    menu: 'Menu',
    openMenu: 'Ouvrir le menu',
    closeMenu: 'Fermer le menu',
    cefrLevel: 'Niveau CECR',
    cefrLevels: 'Niveaux CECR',
    voice: 'Voix',
    voiceGender: 'Type de voix',
    reveal: "Afficher pendant l'écoute",
    revealModes: "Afficher pendant l'écoute",
    female: 'Féminine',
    male: 'Masculine',
    on: 'Activé',
    off: 'Désactivé',
    instruction:
      'Écoute chaque pièce et place-la sur la ligne dans le bon ordre de la phrase.',
    newPuzzleLoaded: 'Nouvelle phrase chargée',
    speechUnavailable:
      "La synthèse vocale n'est pas disponible dans ce navigateur.",
    voiceUnavailable: "Aucune voix n'est disponible pour cette langue sur cet appareil.",
    shuffledButtons: 'Boutons audio mélangés',
    playSegment: 'Jouer le segment',
    playFullSentence: 'Écouter la phrase entière',
    restart: 'Recommencer',
    newPuzzle: 'Nouvelle phrase',
    solved: 'Réussi',
    tryAgain: 'Pas tout a fait encore.',
  },
  italian: {
    eyebrow: 'Puzzle di Ascolto',
    title: '',
    intro:
      'Scegli una lingua e un livello QCER, ascolta i pulsanti mescolati e ricostruisci la frase nell’ordine corretto.',
    practiceLanguage: 'Lingua da praticare',
    practiceLanguages: 'Lingue da praticare',
    menu: 'Menu',
    openMenu: 'Apri menu',
    closeMenu: 'Chiudi menu',
    cefrLevel: 'Livello QCER',
    cefrLevels: 'Livelli QCER',
    voice: 'Voce',
    voiceGender: 'Tipo di voce',
    reveal: 'Mostra durante l’audio',
    revealModes: 'Mostra durante l’audio',
    female: 'Femminile',
    male: 'Maschile',
    on: 'Attivo',
    off: 'Disattivo',
    instruction:
      'Ascolta ogni pezzo e posizionalo sulla riga nell’ordine corretto della frase.',
    newPuzzleLoaded: 'Nuovo esercizio caricato',
    speechUnavailable:
      'La sintesi vocale non è disponibile in questo browser.',
    voiceUnavailable: 'Nessuna voce è disponibile per questa lingua su questo dispositivo.',
    shuffledButtons: 'Pulsanti audio mescolati',
    playSegment: 'Riproduci segmento',
    playFullSentence: 'Riproduci frase completa',
    restart: 'Ricomincia',
    newPuzzle: 'Nuova frase',
    solved: 'Risolto',
    tryAgain: 'Non ancora del tutto.',
  },
  german: {
    eyebrow: 'Hör-Puzzle',
    title: '',
    intro:
      'Wähle eine Sprache und ein GER-Niveau, höre die gemischten Buttons an und setze den Satz in die richtige Reihenfolge.',
    practiceLanguage: 'Übungssprache',
    practiceLanguages: 'Übungssprachen',
    menu: 'Menü',
    openMenu: 'Menü öffnen',
    closeMenu: 'Menü schließen',
    cefrLevel: 'GER-Niveau',
    cefrLevels: 'GER-Niveaus',
    voice: 'Stimme',
    voiceGender: 'Stimmtyp',
    reveal: 'Beim Abspielen anzeigen',
    revealModes: 'Beim Abspielen anzeigen',
    female: 'Weiblich',
    male: 'Männlich',
    on: 'An',
    off: 'Aus',
    instruction:
      'Höre jedes Teil an und lege es in der richtigen Satzreihenfolge auf die Zeile.',
    newPuzzleLoaded: 'Neues Rätsel geladen',
    speechUnavailable:
      'Die Sprachsynthese ist in diesem Browser nicht verfügbar.',
    voiceUnavailable: 'Für diese Sprache ist auf diesem Gerät keine Stimme verfügbar.',
    shuffledButtons: 'Gemischte Audiobuttons',
    playSegment: 'Segment abspielen',
    playFullSentence: 'Ganzen Satz abspielen',
    restart: 'Neu beginnen',
    newPuzzle: 'Neues Rätsel',
    solved: 'Gelöst',
    tryAgain: 'Noch nicht ganz richtig.',
  },
  mandarin: {
    eyebrow: '听力拼句游戏',
    title: '',
    intro:
      '选择一种语言和一个 CEFR 等级，听打乱的按钮，然后按正确顺序重组句子。',
    practiceLanguage: '练习语言',
    practiceLanguages: '练习语言',
    menu: '菜单',
    openMenu: '打开菜单',
    closeMenu: '关闭菜单',
    cefrLevel: 'CEFR 等级',
    cefrLevels: 'CEFR 等级',
    voice: '语音',
    voiceGender: '声音类型',
    reveal: '播放时显示文字',
    revealModes: '播放时显示文字',
    female: '女声',
    male: '男声',
    on: '开启',
    off: '关闭',
    instruction: '听每个片段，然后把它按正确顺序放到句子线上。',
    newPuzzleLoaded: '已加载新题目',
    speechUnavailable: '当前浏览器不支持语音合成。',
    voiceUnavailable: '这台设备上没有可用于该语言的语音。',
    shuffledButtons: '打乱的语音按钮',
    playSegment: '播放片段',
    playFullSentence: '播放完整句子',
    restart: '重新开始',
    newPuzzle: '新题目',
    solved: '完成',
    tryAgain: '还差一点。',
  },
  swedish: {
    eyebrow: 'Lyssningspussel',
    title: '',
    intro:
      'Välj ett språk och en CEFR-nivå, lyssna på de blandade knapparna och bygg upp meningen i rätt ordning.',
    practiceLanguage: 'Övningsspråk',
    practiceLanguages: 'Övningsspråk',
    menu: 'Meny',
    openMenu: 'Öppna meny',
    closeMenu: 'Stäng meny',
    cefrLevel: 'CEFR-nivå',
    cefrLevels: 'CEFR-nivåer',
    voice: 'Röst',
    voiceGender: 'Rösttyp',
    reveal: 'Visa under uppspelning',
    revealModes: 'Visa under uppspelning',
    female: 'Kvinnlig',
    male: 'Manlig',
    on: 'På',
    off: 'Av',
    instruction:
      'Lyssna på varje bit och lägg den på raden i meningens rätta ordning.',
    newPuzzleLoaded: 'Ny mening laddad',
    speechUnavailable: 'Talsyntes är inte tillgängligt i den här webbläsaren.',
    voiceUnavailable: 'Det finns ingen tillgänglig röst för det här språket på den här enheten.',
    shuffledButtons: 'Blandade ljudknappar',
    playSegment: 'Spela segment',
    playFullSentence: 'Spela hela meningen',
    restart: 'Börja om',
    newPuzzle: 'Ny mening',
    solved: 'Snyggt',
    tryAgain: 'Inte riktigt där ännu.',
  },
}

const LANGUAGE_OPTIONS = [
  {
    id: 'english',
    label: 'English',
    flag: '🇺🇸',
    speechLang: 'en-US',
    voicePrefixes: ['en'],
    voicePreferences: {
      female: [
        'Samantha',
        'Ava',
        'Allison',
        'Karen',
        'Moira',
        'Serena',
        'Microsoft Aria Online (Natural)',
        'Microsoft Jenny Online (Natural)',
      ],
      male: ['Daniel', 'Microsoft Guy Online (Natural)'],
    },
    preferredVoiceNames: [
      'Samantha',
      'Ava',
      'Allison',
      'Karen',
      'Moira',
      'Serena',
      'Daniel',
      'Google US English',
      'Microsoft Aria Online (Natural)',
      'Microsoft Jenny Online (Natural)',
      'Microsoft Guy Online (Natural)',
    ],
    joiner: ' ',
    levelDescriptions: {
      A1: 'Simple daily words and actions',
      A2: 'Common routines with more detail',
      B1: 'Linked ideas and fuller situations',
      B2: 'Natural phrasing and nuanced detail',
    },
    ui: UI_STRINGS.english,
    builders: englishBuilders(),
  },
  {
    id: 'spanish',
    label: 'Español',
    flag: '🇪🇸',
    speechLang: 'es-ES',
    voicePrefixes: ['es'],
    voicePreferences: {
      female: ['Monica', 'Paulina', 'Microsoft Elvira Online (Natural)'],
      male: ['Jorge', 'Microsoft Alvaro Online (Natural)'],
    },
    preferredVoiceNames: [
      'Monica',
      'Jorge',
      'Paulina',
      'Google español',
      'Google Spanish',
      'Microsoft Elvira Online (Natural)',
      'Microsoft Alvaro Online (Natural)',
    ],
    joiner: ' ',
    levelDescriptions: {
      A1: 'Palabras y acciones cotidianas',
      A2: 'Rutinas comunes con más detalle',
      B1: 'Ideas conectadas y situaciones amplias',
      B2: 'Frases más naturales y precisas',
    },
    ui: UI_STRINGS.spanish,
    builders: spanishBuilders(),
  },
  {
    id: 'french',
    label: 'Français',
    flag: '🇫🇷',
    speechLang: 'fr-FR',
    voicePrefixes: ['fr'],
    voicePreferences: {
      female: [
        'Amelie',
        'Audrey',
        'Aurelie',
        'Denise',
        'Microsoft Denise Online (Natural)',
        'Microsoft Eloise Online (Natural)',
      ],
      male: ['Thomas', 'Remy', 'Microsoft Henri Online (Natural)'],
    },
    preferredVoiceNames: [
      'Thomas',
      'Amelie',
      'Audrey',
      'Aurelie',
      'Remy',
      'Denise',
      'Google français',
      'Google French',
      'Microsoft Denise Online (Natural)',
      'Microsoft Eloise Online (Natural)',
      'Microsoft Henri Online (Natural)',
    ],
    joiner: ' ',
    levelDescriptions: {
      A1: 'Phrases très simples du quotidien',
      A2: 'Actions courantes avec plus de détails',
      B1: 'Idées liées et situations plus riches',
      B2: 'Expressions plus naturelles et nuancées',
    },
    ui: UI_STRINGS.french,
    builders: frenchBuilders(),
  },
  {
    id: 'italian',
    label: 'Italiano',
    flag: '🇮🇹',
    speechLang: 'it-IT',
    voicePrefixes: ['it'],
    voicePreferences: {
      female: ['Alice', 'Microsoft Elsa Online (Natural)'],
      male: ['Luca', 'Microsoft Diego Online (Natural)'],
    },
    preferredVoiceNames: [
      'Alice',
      'Luca',
      'Google italiano',
      'Google Italian',
      'Microsoft Elsa Online (Natural)',
      'Microsoft Diego Online (Natural)',
    ],
    joiner: ' ',
    levelDescriptions: {
      A1: 'Parole semplici e azioni quotidiane',
      A2: 'Routine comuni con più dettagli',
      B1: 'Idee collegate e contesti più ricchi',
      B2: 'Frasi più naturali e precise',
    },
    ui: UI_STRINGS.italian,
    builders: italianBuilders(),
  },
  {
    id: 'german',
    label: 'Deutsch',
    flag: '🇩🇪',
    speechLang: 'de-DE',
    voicePrefixes: ['de'],
    voicePreferences: {
      female: ['Anna', 'Petra', 'Microsoft Katja Online (Natural)'],
      male: ['Markus', 'Yannick', 'Microsoft Conrad Online (Natural)'],
    },
    preferredVoiceNames: [
      'Anna',
      'Markus',
      'Petra',
      'Yannick',
      'Google Deutsch',
      'Google German',
      'Microsoft Katja Online (Natural)',
      'Microsoft Conrad Online (Natural)',
    ],
    joiner: ' ',
    levelDescriptions: {
      A1: 'Einfache Alltagswörter und Handlungen',
      A2: 'Gewohnte Abläufe mit mehr Details',
      B1: 'Verbundene Ideen und breitere Situationen',
      B2: 'Natürlichere und genauere Formulierungen',
    },
    ui: UI_STRINGS.german,
    builders: germanBuilders(),
  },
  {
    id: 'mandarin',
    label: '中文',
    flag: '🇨🇳',
    speechLang: 'zh-CN',
    voicePrefixes: ['zh'],
    voicePreferences: {
      female: ['Tingting', 'Meijia', 'Microsoft Xiaoxiao Online (Natural)'],
      male: ['Sin-ji', 'Microsoft Yunxi Online (Natural)'],
    },
    preferredVoiceNames: [
      'Tingting',
      'Meijia',
      'Sin-ji',
      'Google 普通话',
      'Google Mandarin',
      'Microsoft Xiaoxiao Online (Natural)',
      'Microsoft Yunxi Online (Natural)',
    ],
    joiner: '',
    levelDescriptions: {
      A1: '简单的日常词语和动作',
      A2: '更完整的常见生活表达',
      B1: '连接起来的想法和场景',
      B2: '更自然也更细致的表达',
    },
    ui: UI_STRINGS.mandarin,
    builders: mandarinBuilders(),
  },
  {
    id: 'swedish',
    label: 'Svenska',
    flag: '🇸🇪',
    speechLang: 'sv-SE',
    voicePrefixes: ['sv'],
    voicePreferences: {
      female: ['Alva', 'Klara', 'Microsoft Sofie Online (Natural)'],
      male: ['Oskar', 'Microsoft Mattias Online (Natural)'],
    },
    preferredVoiceNames: [
      'Alva',
      'Klara',
      'Oskar',
      'Google svenska',
      'Google Swedish',
      'Microsoft Sofie Online (Natural)',
      'Microsoft Mattias Online (Natural)',
    ],
    joiner: ' ',
    levelDescriptions: {
      A1: 'Enkla vardagsord och handlingar',
      A2: 'Vanliga rutiner med fler detaljer',
      B1: 'Sammankopplade idéer och rikare situationer',
      B2: 'Mer naturliga och nyanserade fraser',
    },
    ui: UI_STRINGS.swedish,
    builders: swedishBuilders(),
  },
]

export { LANGUAGE_OPTIONS }
export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2']
export const DEFAULT_LANGUAGE = LANGUAGE_OPTIONS[0].id

export function getLanguageConfig(languageId) {
  return (
    LANGUAGE_OPTIONS.find((language) => language.id === languageId) ??
    LANGUAGE_OPTIONS[0]
  )
}

export function generateRound(languageId, level) {
  const language = getLanguageConfig(languageId)
  const memoryKey = `${language.id}:${level}`
  const recentSentences = RECENT_SENTENCE_MEMORY.get(memoryKey) ?? []

  let sentenceEntries = null
  let sentenceSignature = ''

  for (let attempt = 0; attempt < ROUND_GENERATION_ATTEMPTS; attempt += 1) {
    const candidateEntries = buildSentence(language.builders[level])
      .filter(Boolean)
      .slice(0, 8)

    const candidateSignature = candidateEntries
      .map((entry) => (typeof entry === 'string' ? entry : entry.text))
      .join(language.joiner)

    sentenceEntries = candidateEntries
    sentenceSignature = candidateSignature

    if (!recentSentences.includes(candidateSignature)) {
      break
    }
  }

  const nextRecentSentences = [...recentSentences, sentenceSignature].slice(
    -RECENT_SENTENCE_LIMIT,
  )
  RECENT_SENTENCE_MEMORY.set(memoryKey, nextRecentSentences)

  const orderedSegments = sentenceEntries.map((entry, position) => {
    const segment = normalizeSegment(language.id, entry)
    return {
      id: `${language.id}-${level}-${position}-${Math.random().toString(36).slice(2, 8)}`,
      position,
      text: segment.text,
      speechText: segment.speechText,
    }
  })

  return {
    acceptedOrders: createAcceptedOrders(language.id, orderedSegments),
    orderedSegments,
    shuffledSegments: shuffle(orderedSegments),
    fullSentence: orderedSegments.map((segment) => segment.text).join(language.joiner),
    levelDescriptions: language.levelDescriptions,
    language,
  }
}
