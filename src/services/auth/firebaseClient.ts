import { initializeApp, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { initializeFirestore, type Firestore } from "firebase/firestore";

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
 * `experimentalForceLongPolling: true`: Firestores WebChannel-transport
 * holder som standard responser åpne i påvente av mer data fra backend
 * (strømming), se `FirestoreSettings.experimentalForceLongPolling` i
 * `@firebase/firestore`s typedefinisjoner: «Each response from the backend
 * will be closed immediately after the backend sends data (by default
 * responses are kept open in case the backend has more data to send)».
 * Åpne, strømmende responser er upraktisk å stubbe med Playwrights
 * `page.route()`, som er bygget for å fullføre ett komplett
 * request/response-par om gangen — samme begrensning som begrunnet
 * CORS-verifiseringen i fase 10 (se docs/architecture.md). Med
 * `experimentalForceLongPolling: true` lukkes hver respons umiddelbart
 * etter at backend har sendt data, og trafikken blir dermed ordinære,
 * diskrete HTTP-kall som `page.route()` kan avskjære og besvare
 * forutsigbart.
 *
 * SDK-ens standardinnstilling siden v9.22 (`experimentalAutoDetectLongPolling:
 * true`) faller riktignok *også* tilbake til long-polling, men kun når den
 * *oppdager* problemer (typisk bufrende proxyer/antivirus) — i et rent
 * Playwright/headless-Chromium-testmiljø uten slike mellomledd er det ingen
 * garanti for at auto-deteksjonen faktisk velger long-polling fremfor
 * strømming. Eksplisitt `experimentalForceLongPolling: true` gjør derfor
 * transportvalget deterministisk uavhengig av miljø, slik at E2E-stubbing
 * er forutsigbar. Konklusjonen er en vurdering av SDK-dokumentasjonen/-typene
 * (ingen ekte Firebase-prosjekt finnes ennå til å verifisere mot en reell
 * backend, se issue A i docs/plans/watchlist-database-migrering.md) — se
 * PR-beskrivelsen for full begrunnelse. Faktisk E2E-stubbing av
 * Firestore-trafikk bygges i en senere issue (C), når `WatchlistStorage`
 * faktisk tas i bruk.
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

export const firestore: Firestore = initializeFirestore(firebaseApp, {
  experimentalForceLongPolling: true,
});
