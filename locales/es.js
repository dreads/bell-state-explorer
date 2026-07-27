// English is the source-of-truth locale: every key any other bundle can
// translate must exist here first. Ships as a static ES module import
// (rather than fetched JSON like PR-contributed locales) so the default
// language never costs a network round-trip and works offline / from
// file://. See CLAUDE.md's "Added: i18n foundation" section.
export const STRINGS_VERSION = '2';

export default {
  meta: {
    code: 'es',
    endonym: 'Español',
    englishName: 'Spanish',
    direction: 'ltr',
    targetsVersion: STRINGS_VERSION,
  },
  strings: {
    interpret: {
      'fully-dephased':
        'Completamente desfaseado. Las coherencias han desaparecido, por lo que esta es una mezcla correlacionada clásica con las mismas estadísticas de medición pero sin entrelazamiento.',
      'product-state':
        'Toda la amplitud se asienta en un estado de la base. Sigue siendo un estado puro, pero un estado producto sin nada que entrelazar.',
      'maximally-entangled':
        'Un estado de Bell máximamente entrelazado. Poblaciones iguales, coherencia completa entre ellas.',
      'pure-partial':
        'Puro pero solo parcialmente entrelazado. Las amplitudes desiguales debilitan la correlación sin introducir ninguna mezcla.',
      'partially-dephased':
        'Parcialmente desfaseado. Los términos de coherencia se han reducido mientras que las poblaciones se mantienen, por lo que el entrelazamiento se está degradando hacia una mezcla clásica.',
    },
    // Static chrome (index.html) and the small templates app.js builds
    // button/readout text from. Math notation (kets, q0/q1, basis labels,
    // Greek letters standing for a family/sign) stays untranslated by
    // design — only the surrounding English words are keys here.
    ui: {
      docTitle: 'Explorador de la matriz de densidad del estado de Bell',
      metaDescription:
        'Una matriz de densidad interactiva en escala de grises para los cuatro estados de Bell, con controles de desfase y balance de amplitud.',
      languageLabel: 'Idioma',
      heading: 'Matriz de densidad del estado de Bell',
      circuitHeading: 'Diagrama de circuito',
      subtitle:
        'Dos cúbits a través de una compuerta Hadamard y una CNOT. Establezca los estados de entrada configurando los valores de los cúbits o cambiando la fase y la familia, luego observe cómo la matriz de densidad responde al desfase y al desequilibrio en las amplitudes.',
      inputStateLegend: 'Estado de entrada',
      couplingNote: '↕ mismos dos bits ↕',
      channelLegend: 'Canal',
      dephasingLabel: 'Desfase',
      balanceLabel: 'Balance θ',
      rotateQ0Label: 'Rotar q0 α',
      rotateQ1Label: 'Rotar q1 β',
      resetButton: 'Restablecer',
      exportButton: 'Exportar estado actual',
      keyLargeMagnitude: 'magnitud grande',
      keySmallMagnitude: 'magnitud pequeña',
      keyZero: 'cero',
      keyNegative: 'negativo',
      matrixKeyParagraph:
        'Las filas y columnas corren 00, 01, 10, 11. Las entradas diagonales son probabilidades de medición; las entradas fuera de la diagonal son coherencias. Cada celda muestra su valor exacto; la oscuridad del relleno y el subrayado son un resumen visual de los mismos números para una lectura rápida.',
      concurrenceLabel: 'Concurrencia',
      purityLabel: 'Pureza',
      bellStateLabel: 'Estado de Bell',
      // Templated: {qubit} is the literal identifier "q0"/"q1", not translated.
      qubitEquals: '{qubit} = {value}',
      phaseSign: 'fase {sign}',
      familyLabel: 'familia {family}',
      degrees: '{value}°',
      percent: '{value}%',
    },
    matrixGrid: {
      svgTitle: 'Matriz de densidad',
      svgDescIntro:
        'Cuadrícula de cuatro por cuatro con el valor numérico impreso en cada celda. La oscuridad del relleno también codifica la magnitud, y un subrayado fino marca una entrada negativa.',
      tableCaption: 'Valores de la matriz de densidad por estado de la base de fila y columna',
      entryTemplate: 'fila {row} columna {col} es igual a {value}',
      summaryTemplate: 'Entradas distintas de cero: {entries}.',
      joinText: '; ',
      allZero: 'Todas las entradas son cero.',
    },
    blochSphere: {
      origin: 'Vector de Bloch para {qubit}: en el origen (máximamente mezclado, sin información sobre este cúbit individualmente).',
      vector: 'Vector de Bloch para {qubit}: x = {x}, y = {y}, z = {z}, magnitud = {magnitude}.',
    },
    circuitDiagram: {
      description:
        'Circuito: q0 comienza en |{q0}⟩ y q1 comienza en |{q1}⟩. Una compuerta Hadamard en q0 es seguida por una CNOT con q0 como control y q1 como objetivo, preparando el estado de Bell {label}. Después de eso, se aplica una rotación Rᵧ de {alpha0} grados a q0 y de {alpha1} grados a q1.',
    },
  },
};
