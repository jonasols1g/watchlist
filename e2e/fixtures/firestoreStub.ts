import type { Page, Route } from "@playwright/test";

/**
 * Stubbing av Firestore-trafikk for E2E (DB-migrering issue C, se
 * docs/plans/watchlist-database-migrering.md#arkitektur).
 *
 * `FirestoreWatchlistStorage` bruker `firebase/firestore/lite` (ikke den
 * fulle `firebase/firestore`), nettopp fordi Lite-SDK-en bruker Firestores
 * vanlige REST-API direkte — ett diskret HTTP-kall per operasjon — i stedet
 * for den fulle SDK-ens stateful WebChannel-sesjonsprotokoll (håndtrykk,
 * strømtokens, `RID`/`SID`/`AID`). Se `services/auth/firebaseClient.ts` for
 * hele begrunnelsen, inkludert den empiriske verifiseringen mot et ekte
 * Firebase-prosjekt som motbeviste `experimentalForceLongPolling`-antagelsen
 * fra issue A. Nettopp derfor er *disse* to endepunktene (og ikke
 * `Listen`/`Write`-kanalene) de eneste Firestore-relaterte rutene som
 * trengs:
 *
 * - `POST .../documents/users/{uid}:runQuery` — `getDocs(collection(...))`
 *   (brukt av `FirestoreWatchlistStorage.load`).
 * - `POST .../documents:commit` — `setDoc`/`updateDoc`/`deleteDoc` (brukt av
 *   `upsert`/`updateStatus`/`remove`), som Firestores REST-API alltid ruter
 *   via den generiske «commit»-operasjonen (`Write`-meldinger med
 *   `update`/`delete`, eventuelt med `updateMask` for delvise oppdateringer
 *   fra `updateDoc`) — uavhengig av hvilken av de tre metodene som kalte
 *   den.
 *
 * Stubben er **stateful** (en enkel in-memory «database» i modulens
 * lukking, per `registerFirestoreStub`-kall/test): skrivinger
 * (`:commit`) oppdaterer det lagrede dokumentsettet, og en påfølgende
 * `:runQuery` (f.eks. etter `page.reload()`) svarer med det faktisk lagrede
 * resultatet. Dette validerer at Firestore-hydrering fungerer over en
 * reload, ikke bare at enkeltkall besvares.
 *
 * Feltverdiene i skrive-forespørslene ankommer allerede i Firestores
 * strengt typede tråd-format (`{"stringValue": "..."}`,
 * `{"mapValue": {"fields": {...}}}` osv., generert av selve SDK-en) — de
 * lagres derfor akkurat som mottatt og gjenbrukes uendret i
 * `runQuery`-svaret. Selve SDK-en (ikke denne stubben) står for å
 * dekode dette tråd-formatet tilbake til vanlige JS-verdier
 * (`documentSnapshot.data()` i `FirestoreWatchlistStorage`) — stubben
 * tester dermed den ekte koding/dekoding-veien, ikke en forenklet
 * erstatning for den.
 */

interface FirestoreValue {
  [key: string]: unknown;
}

interface CommitWrite {
  update?: { name: string; fields: Record<string, FirestoreValue> };
  delete?: string;
  updateMask?: { fieldPaths: string[] };
}

interface CommitRequestBody {
  writes: CommitWrite[];
}

/** Siste segment av en Firestore-ressursbane (`.../watchlistItems/{mediaId}` → `mediaId`). */
function lastPathSegment(name: string): string {
  const segments = name.split("/");
  return segments[segments.length - 1] ?? name;
}

/**
 * Henter ressursbanen til foreldre-dokumentet (`projects/{proj}/databases/
 * {db}/documents/users/{uid}`) direkte fra `runQuery`-URL-en, i stedet for å
 * anta et fast prosjekt-ID. Firestore-SDK-en validerer at ethvert dokument
 * den mottar hører til *sitt eget* konfigurerte prosjekt
 * (`import.meta.env.VITE_FIREBASE_PROJECT_ID`) og kaster
 * `Tried to deserialize key from different project` ellers — verifisert
 * empirisk under implementasjonen av denne stubben.
 */
function parentPathFromRunQueryUrl(url: string): string {
  const withoutQuery = url.split("?")[0] ?? url;
  const [path] = withoutQuery.split(":runQuery");
  const marker = "/v1/";
  const markerIndex = (path ?? "").indexOf(marker);
  return markerIndex === -1
    ? (path ?? "")
    : (path ?? "").slice(markerIndex + marker.length);
}

async function fulfillRunQuery(
  route: Route,
  documents: Map<string, Record<string, FirestoreValue>>,
): Promise<void> {
  const now = new Date().toISOString();
  const entries = [...documents.entries()];

  if (entries.length === 0) {
    // Tomt resultat: Firestores `runQuery`-respons er uansett en array med
    // ett element som kun har `readTime` (ingen `document`-nøkkel).
    await route.fulfill({ json: [{ readTime: now }] });
    return;
  }

  const parentPath = parentPathFromRunQueryUrl(route.request().url());
  const results = entries.map(([mediaId, fields]) => ({
    document: {
      name: `${parentPath}/watchlistItems/${mediaId}`,
      fields,
      createTime: now,
      updateTime: now,
    },
    readTime: now,
  }));
  await route.fulfill({ json: results });
}

async function fulfillCommit(
  route: Route,
  documents: Map<string, Record<string, FirestoreValue>>,
): Promise<void> {
  const body = route.request().postDataJSON() as CommitRequestBody;
  const now = new Date().toISOString();
  const writeResults: { updateTime: string }[] = [];

  for (const write of body.writes) {
    if (write.update) {
      const mediaId = lastPathSegment(write.update.name);
      if (write.updateMask) {
        // Delvis oppdatering (`updateDoc`) — behold eksisterende felter,
        // overskriv/fjern kun det `updateMask.fieldPaths` peker på (et felt
        // listet i masken uten tilhørende verdi betyr `deleteField()`).
        const existing = documents.get(mediaId) ?? {};
        const next = { ...existing };
        const updatedFields = write.update.fields;
        for (const fieldPath of write.updateMask.fieldPaths) {
          const value = updatedFields[fieldPath];
          if (value !== undefined) {
            next[fieldPath] = value;
          } else {
            delete next[fieldPath];
          }
        }
        documents.set(mediaId, next);
      } else {
        // Full overskriving (`setDoc`).
        documents.set(mediaId, write.update.fields);
      }
    } else if (write.delete !== undefined) {
      documents.delete(lastPathSegment(write.delete));
    }
    writeResults.push({ updateTime: now });
  }

  await route.fulfill({ json: { commitTime: now, writeResults } });
}

/**
 * Fanger opp Firestore Lite-SDK-ens `runQuery`/`commit`-REST-kall og svarer
 * mot en enkel in-memory «database» (per kall til denne funksjonen, typisk
 * én gang per test i `beforeEach`) — uten noe ekte nettverkskall mot
 * Firestore.
 *
 * Tar imot et valgfritt `documents`-kart (default: et nytt, tomt kart) og
 * returnerer det som ble brukt — DB-migrering issue D
 * (`e2e/watchlist-migration.spec.ts`) gjenbruker samme kart på tvers av to
 * separate `page`/`BrowserContext`-instanser (simulerer to enheter/faner mot
 * *samme* Firestore-"backend") for å bevise at et migrert element faktisk
 * ligger server-side, ikke bare i den lokale skriveputten på siden som
 * migrerte det.
 */
export async function registerFirestoreStub(
  page: Page,
  documents: Map<string, Record<string, FirestoreValue>> = new Map(),
): Promise<Map<string, Record<string, FirestoreValue>>> {
  await page.route(
    "**/firestore.googleapis.com/v1/projects/*/databases/*/documents/users/*:runQuery**",
    (route) => fulfillRunQuery(route, documents),
  );

  await page.route(
    "**/firestore.googleapis.com/v1/projects/*/databases/*/documents:commit**",
    (route) => fulfillCommit(route, documents),
  );

  return documents;
}
