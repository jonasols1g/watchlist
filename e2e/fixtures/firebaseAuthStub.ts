import type { Page } from "@playwright/test";

/**
 * Stubbing av Firebase Anonymous Auth for E2E (DB-migrering issue B, se
 * docs/plans/watchlist-database-migrering.md#identitet-authcontext).
 *
 * Fra og med issue B kaller `AuthContext`/`firebaseClient.ts` ubetinget
 * `signInAnonymously` ved appens mount — uavhengig av hvilken side/spec som
 * kjører. Uten denne stubben ville *alle* E2E-tester (inkludert
 * `smoke.spec.ts`, som ikke kaller `registerApiStubs`) gjort et ekte
 * nettverkskall til `identitytoolkit.googleapis.com` og opprettet en reell
 * anonym bruker i det ekte Firebase-prosjektet på hver eneste testkjøring —
 * i strid med det samme prinsippet som begrunner OMDb-/MOTN-stubbingen i
 * `apiStubs.ts`: E2E skal aldri gjøre ekte API-kall (se
 * docs/architecture.md#teststrategi). Dette er verifisert empirisk: uten
 * denne stubben, men med ekte `VITE_FIREBASE_*` i miljøet, dukket det
 * faktisk opp et nytt anonymt brukerdokument i Firebase-konsollen etter en
 * enkelt lokal kjøring av `smoke.spec.ts`.
 *
 * Stubber de to kallene Firebase JS SDK faktisk gjør ved en vellykket
 * anonym innlogging (`accounts:signUp` for selve innloggingen,
 * `accounts:lookup` for å hente brukerinfo til `onAuthStateChanged`-
 * callbacken) — begge responsformene er hentet fra en ekte, observert
 * respons (se PR-beskrivelsen for detaljer) og er derfor formet slik SDK-en
 * faktisk forventer, inkludert et gyldig strukturert (men innholdsløst
 * signert) JWT i `idToken`, som SDK-en dekoder client-side for å lese
 * `exp`/`sub`-claims.
 *
 * Fullstendig Firestore-stubbing (issue C, når `WatchlistStorage` faktisk
 * tas i bruk mot `firestore.googleapis.com`) er bevisst utenfor denne
 * filens ansvar — kun selve auth-håndtrykket stubbes her.
 */

const FAKE_UID = "e2e-anonymous-uid";

function base64UrlEncode(value: object): string {
  return Buffer.from(JSON.stringify(value))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function createFakeIdToken(): string {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT", kid: "e2e-fake-kid" };
  const payload = {
    provider_id: "anonymous",
    iss: "https://securetoken.google.com/watchlist-e2e",
    aud: "watchlist-e2e",
    auth_time: nowSeconds,
    user_id: FAKE_UID,
    sub: FAKE_UID,
    iat: nowSeconds,
    exp: nowSeconds + 3600,
    firebase: { identities: {}, sign_in_provider: "anonymous" },
  };
  // Signaturen verifiseres aldri client-side av Firebase JS SDK (kun
  // dekodet for claims) — en vilkårlig, men base64url-gyldig, streng holder.
  const signature = "e2e-fake-signature";
  return `${base64UrlEncode(header)}.${base64UrlEncode(payload)}.${signature}`;
}

/**
 * Fanger opp Firebase Anonymous Auth-håndtrykket (`accounts:signUp` og
 * `accounts:lookup` mot `identitytoolkit.googleapis.com`) og svarer med en
 * konsistent, stabil anonym testbruker (`e2e-anonymous-uid`) — uten noe
 * ekte nettverkskall mot Firebase.
 */
export async function registerFirebaseAuthStub(page: Page): Promise<void> {
  const idToken = createFakeIdToken();

  await page.route(
    "**/identitytoolkit.googleapis.com/v1/accounts:signUp**",
    async (route) => {
      await route.fulfill({
        json: {
          kind: "identitytoolkit#SignupNewUserResponse",
          idToken,
          refreshToken: "e2e-fake-refresh-token",
          expiresIn: "3600",
          localId: FAKE_UID,
        },
      });
    },
  );

  await page.route(
    "**/identitytoolkit.googleapis.com/v1/accounts:lookup**",
    async (route) => {
      const now = Date.now().toString();
      await route.fulfill({
        json: {
          kind: "identitytoolkit#GetAccountInfoResponse",
          users: [
            {
              localId: FAKE_UID,
              lastLoginAt: now,
              createdAt: now,
              lastRefreshAt: new Date().toISOString(),
            },
          ],
        },
      });
    },
  );
}
