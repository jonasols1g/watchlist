import { useState, type FormEvent } from "react";
import { StarRatingInput } from "../components/feedback/StarRatingInput";
import { feedbackStorage } from "../services/storage";
import type { FeedbackStorage } from "../services/storage/FeedbackStorage";

export interface FeedbackPageProps {
  /**
   * Injiseres for tester (se `FeedbackPage.test.tsx`) — samme mønster som
   * `WatchlistProvider storage`-prop. Defaulter til den ekte
   * `feedbackStorage`-sammensetningsroten i produksjon.
   */
  storage?: FeedbackStorage;
}

const MAX_TEXT_LENGTH = 2000;

/**
 * Bevisst skjult side (issue #40, se
 * docs/plans/feedback-innsending-og-automatisk-oppfolging.md#del-a) — nås
 * kun via direkte URL, ingen lenke i `NavBar`/`Footer`. Fritekst + score 1–5
 * lagres i Firestore-collectionen `feedback/{autoId}` (ikke brukerbundet).
 *
 * Kontrollert skjema à la `SearchBar.tsx` (lokal `useState`, `preventDefault`,
 * trim/valider før submit) — ingen skjemabibliotek. Submit-knappen er
 * disabled til input er gyldig (ikke-tom tekst + valgt score), så en ugyldig
 * innsending kan strukturelt ikke trigges — i tillegg vises alltid synlige
 * feltvalideringshint under feltene som ikke er utfylt.
 */
export function FeedbackPage({
  storage = feedbackStorage,
}: FeedbackPageProps) {
  const [text, setText] = useState("");
  const [score, setScore] = useState<number | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting" | "success">(
    "idle",
  );
  const [saveError, setSaveError] = useState(false);

  const trimmedText = text.trim();
  const isTextValid = trimmedText.length > 0 && trimmedText.length <= MAX_TEXT_LENGTH;
  const isScoreValid = score !== null;
  const isValid = isTextValid && isScoreValid;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValid || score === null) return;

    setStatus("submitting");
    setSaveError(false);
    try {
      await storage.submit({ text: trimmedText, score });
      setText("");
      setScore(null);
      setStatus("success");
    } catch {
      setSaveError(true);
      setStatus("idle");
    }
  }

  return (
    <section>
      <h1 className="font-heading text-2xl font-bold">Gi tilbakemelding</h1>
      <p className="text-text-muted mt-2">
        Fortell oss hva du synes om CineFind — hva fungerer, og hva kan bli
        bedre?
      </p>

      {saveError && (
        <div
          role="alert"
          className="border-accent/40 bg-accent/10 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-red-200"
        >
          <p>Tilbakemeldingen ble ikke sendt inn.</p>
          <button
            type="button"
            onClick={() => {
              setSaveError(false);
            }}
            className="bg-accent shrink-0 rounded-xl px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Lukk
          </button>
        </div>
      )}

      {status === "success" && (
        <p
          role="status"
          className="border-gold/40 bg-gold/10 text-text-primary mt-4 rounded-2xl border px-4 py-3"
        >
          Takk for tilbakemeldingen!
        </p>
      )}

      <form
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
        className="mt-6 flex flex-col gap-6"
      >
        <div className="flex flex-col gap-2">
          <label htmlFor="feedback-text" className="text-text-primary font-medium">
            Tilbakemelding
          </label>
          <textarea
            id="feedback-text"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
            }}
            rows={5}
            maxLength={MAX_TEXT_LENGTH}
            placeholder="Skriv tilbakemeldingen din her"
            className="text-text-primary placeholder:text-text-muted border-surface-border bg-surface w-full rounded-2xl border px-4 py-3.5 text-[15px] focus-visible:outline-none"
          />
          {!isTextValid && (
            <p className="text-text-muted text-sm">
              Skriv en tilbakemelding før du sender inn.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-text-primary font-medium">Score</span>
          <StarRatingInput value={score} onChange={setScore} />
          {!isScoreValid && (
            <p className="text-text-muted text-sm">Velg en score fra 1 til 5.</p>
          )}
        </div>

        <button
          type="submit"
          disabled={!isValid || status === "submitting"}
          className="bg-brand-gradient rounded-2xl px-4 py-3.5 text-[15px] font-bold text-slate-900 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "submitting" ? "Sender…" : "Send inn"}
        </button>
      </form>
    </section>
  );
}
