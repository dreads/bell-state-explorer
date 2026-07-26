// English is the source-of-truth locale: every key any other bundle can
// translate must exist here first. Ships as a static ES module import
// (rather than fetched JSON like additional locales) so the default
// language never costs a network round-trip and works offline / from
// file://. See CLAUDE.md's "Added: i18n foundation" section.
export default {
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
};
