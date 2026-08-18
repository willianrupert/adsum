// O Node não tem IndexedDB. O `fake-indexeddb` põe um por cima do globalThis,
// e o Dexie não percebe a diferença — o que permite testar o adaptador de
// verdade, e não um dublê que concorda com tudo que o código faz.
import 'fake-indexeddb/auto'
