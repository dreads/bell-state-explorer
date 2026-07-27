// English is the source-of-truth locale: every key any other bundle can
// translate must exist here first. Ships as a static ES module import
// (rather than fetched JSON like PR-contributed locales) so the default
// language never costs a network round-trip and works offline / from
// file://. See CLAUDE.md's "Added: i18n foundation" section.
export const STRINGS_VERSION = '3';

export default {
  meta: {
    code: 'en',
    endonym: 'English',
    englishName: 'English',
    direction: 'ltr',
    targetsVersion: STRINGS_VERSION,
  },
  strings: {
    interpret: {
      'fully-dephased':
        'Fully dephased. The coherences are gone, so this is a classical correlated mixture with the same measurement statistics but no entanglement.',
      'product-state':
        'All amplitude sits on one basis state. Still a pure state, but a product state with nothing to entangle.',
      'maximally-entangled':
        'A maximally entangled Bell state. Equal populations, full coherence between them.',
      'pure-partial':
        'Pure but only partially entangled. Unequal amplitudes weaken the correlation without introducing any mixedness.',
      'partially-dephased':
        'Partially dephased. The coherence terms have shrunk while the populations hold, so entanglement is decaying toward a classical mixture.',
    },
    // Static chrome (index.html) and the small templates app.js builds
    // button/readout text from. Math notation (kets, q0/q1, basis labels,
    // Greek letters standing for a family/sign) stays untranslated by
    // design — only the surrounding English words are keys here.
    ui: {
      docTitle: 'Bell state density matrix explorer',
      metaDescription:
        'An interactive greyscale density matrix for the four Bell states, with dephasing and amplitude balance controls.',
      languageLabel: 'Language',
      heading: 'Bell state density matrix',
      circuitHeading: 'Circuit diagram',
      subtitle:
        'Two qubits through a Hadamard and a CNOT. Set the input states by setting the qubit values or changing the phase and family, then watch the density matrix respond to dephasing and to an imbalance in the amplitudes.',
      inputStateLegend: 'Input state',
      couplingNote: '↕ same two bits ↕',
      channelLegend: 'Channel',
      dephasingLabel: 'Dephasing',
      balanceLabel: 'Balance θ',
      rotateQ0Label: 'Rotate q0 α',
      rotateQ1Label: 'Rotate q1 β',
      resetButton: 'Reset',
      exportButton: 'Export current state',
      exportCircuitLegend: 'Export circuit',
      exportTargetLabel: 'Format',
      exportCircuitButton: 'Download circuit code',
      exportCircuitNote:
        'Downloads the ideal state-preparation circuit (H, CNOT, and any local rotation) as a ready-to-run program. Dephasing has no exact gate equivalent, so it is not included — see the comments in the downloaded file for why.',
      exportCircuitError: 'Could not load the circuit template. Check your connection and try again.',
      keyLargeMagnitude: 'large magnitude',
      keySmallMagnitude: 'small magnitude',
      keyZero: 'zero',
      keyNegative: 'negative',
      matrixKeyParagraph:
        'Rows and columns run 00, 01, 10, 11. Diagonal entries are measurement probabilities; off-diagonal entries are coherences. Every cell shows its exact value; fill darkness and the underline are a visual summary of the same numbers for a quick scan.',
      concurrenceLabel: 'Concurrence',
      purityLabel: 'Purity',
      bellStateLabel: 'Bell state',
      // Templated: {qubit} is the literal identifier "q0"/"q1", not translated.
      qubitEquals: '{qubit} = {value}',
      phaseSign: 'phase {sign}',
      familyLabel: '{family} family',
      degrees: '{value}°',
      percent: '{value}%',
    },
    matrixGrid: {
      svgTitle: 'Density matrix',
      svgDescIntro:
        'Four by four grid with the numeric value printed in every cell. Fill darkness also encodes magnitude, and a thin underline marks a negative entry.',
      tableCaption: 'Density matrix values by row and column basis state',
      entryTemplate: 'row {row} column {col} equals {value}',
      summaryTemplate: 'Nonzero entries: {entries}.',
      joinText: '; ',
      allZero: 'All entries are zero.',
    },
    blochSphere: {
      origin: 'Bloch vector for {qubit}: at the origin (maximally mixed, no information about this qubit alone).',
      vector: 'Bloch vector for {qubit}: x = {x}, y = {y}, z = {z}, magnitude = {magnitude}.',
    },
    circuitDiagram: {
      description:
        'Circuit: q0 starts at |{q0}⟩ and q1 starts at |{q1}⟩. A Hadamard gate on q0 is followed by a CNOT with q0 as control and q1 as target, preparing the Bell state {label}. After that, an Rᵧ rotation of {alpha0} degrees is applied to q0 and {alpha1} degrees to q1.',
    },
  },
};
