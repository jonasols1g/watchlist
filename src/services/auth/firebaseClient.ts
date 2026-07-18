import { initializeApp, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore/lite";

/**
 * Sammensetningsrot for Firebase (DB-migrering, issue A — se
 * `docs/plans/watchlist-database-migrering.md`): modul-singleton som
 * initialiserer Firebase App + Auth + Firestore fra
 * `import.meta.env.VITE_FIREBASE_*` (se `.env.example`), samme mønster som
 * `services/media/index.ts` brukes for `MediaProvider`-sammensetningen.
 *
 * OBS — `getAuth(firebaseApp)` under kaster synkront (`auth/invalid-api-key`)
 * når `firebaseConfig` er tom eller ugyldig, selv om `initializeApp` i seg
 * selv ikke gjør det. Denne modulen må derfor aldri importeres, verken
 * direkte eller transitivt, uten at ekte `VITE_FIREBASE_*`-verdier er satt i
 * miljøet den kjører i (se `.env.example`, `.github/workflows/ci.yml` og
 * `docs/architecture.md`) — det gjelder både enhetstester (mock modulen,
 * ikke bare `firebase/auth`, se `AuthContext.test.tsx`/`App.test.tsx`) og
 * enhver kjørende bygg av appen selv (E2E, GitHub Pages-publisering).
 * `AuthContext` (issue B) importerer denne filen ubetinget fra `App.tsx`,
 * så siden issue B er den nå reelt i bruk i produksjonskoden.
 *
 * `firebase/firestore/lite` (ikke full `firebase/firestore`) — revidert
 * vurdering fra issue C (DB-migrering, se
 * docs/plans/watchlist-database-migrering.md#arkitektur), som er nettopp
 * runden der antagelsen under issue A ble empirisk verifisert mot et ekte
 * Firebase-prosjekt for første gang:
 *
 * Issue A antok (uten et ekte prosjekt å teste mot) at
 * `experimentalForceLongPolling: true` på den fulle `firebase/firestore`-
 * klienten ville gjøre trafikken til «ordinære, diskrete HTTP-kall» som
 * Playwrights `page.route()` kunne avskjære forutsigbart. Empirisk
 * verifisering i issue C (nettverkslogg mot det ekte prosjektet, se
 * PR-beskrivelsen) motbeviste dette: selv med `experimentalForceLongPolling`
 * satt, bruker den fulle SDK-en fortsatt et stateful WebChannel-sesjons-
 * protokoll (`RID`/`SID`/`AID`/`gsessionid`, håndtrykk, strømtokens) for
 * *alle* operasjoner — inkludert engangs `getDocs`/`setDoc`, som internt
 * ruter via de samme `Listen`/`Write`-kanalene som ekte realtime-lyttere
 * bruker. Denne sesjonsprotokollen er upraktisk å stubbe pålitelig med
 * `page.route()`, som svarer på enkeltstående request/response-par, ikke en
 * flertrinns håndtrykk-sekvens.
 *
 * `WatchlistStorage` bruker aldri realtime-lyttere (`onSnapshot`) — kun
 * engangs `getDoc(s)`/`setDoc`/`updateDoc`/`deleteDoc` (se
 * `FirestoreWatchlistStorage.ts`). Firestore Lite-SDK-en
 * (`firebase/firestore/lite`) er bygget nøyaktig for dette bruksmønsteret:
 * den mangler støtte for realtime-lyttere/offline-persistens, og bruker i
 * stedet Firestores vanlige REST-API direkte (ett `fetch`-kall per
 * operasjon) — verifisert empirisk i issue C til å produsere ordinære,
 * stubbare HTTP-kall (se `e2e/fixtures/firestoreStub.ts`). Ingen
 * `experimentalForceLongPolling`-innstilling trengs eller finnes for Lite-
 * klienten. Se PR-beskrivelsen for full begrunnelse og eksempel på fanget
 * nettverkstrafikk.
 */
const firebaseConfig: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseApp: FirebaseApp = initializeApp(firebaseConfig);

export const auth: Auth = getAuth(firebaseApp);

export const firestore: Firestore = getFirestore(firebaseApp);
