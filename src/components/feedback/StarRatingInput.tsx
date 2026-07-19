import type { AriaAttributes } from "react";

export interface StarRatingInputProps {
  /** `null` = ingen score valgt ennå (påkrevd felt, se `FeedbackPage.tsx`). */
  value: number | null;
  onChange: (score: number) => void;
}

const SCORES = [1, 2, 3, 4, 5];

/**
 * 1–5-stjerne-rating som en tilgjengelig radiogroup (issue #40, se
 * docs/plans/feedback-innsending-og-automatisk-oppfolging.md#del-a) — appen
 * har fra før kun en boolsk stjerne-toggle (`WatchlistStarToggle.tsx`), ingen
 * skala. `role="radiogroup"` + `role="radio"`/`aria-checked` per knapp,
 * samme stjerne-SVG-path som `NavBar`/`WatchlistStarToggle`/`RatingsBadge`.
 */
export function StarRatingInput({ value, onChange }: StarRatingInputProps) {
  return (
    <div role="radiogroup" aria-label="Score" className="flex gap-2">
      {SCORES.map((score) => {
        const checked = value === score;
        return (
          <button
            key={score}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={`${score} av 5`}
            onClick={() => {
              onChange(score);
            }}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
              checked
                ? "bg-gold/20 border-gold text-gold"
                : "border-surface-border bg-surface/80 text-gold"
            }`}
          >
            <StarIcon filled={checked} />
          </button>
        );
      })}
    </div>
  );
}

function StarIcon({
  filled,
  ...rest
}: {
  filled: boolean;
} & Pick<AriaAttributes, "aria-hidden">) {
  return (
    <svg
      {...rest}
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.5}
    >
      <path d="M12 2.5l2.9 6.06 6.6.77-4.9 4.55 1.27 6.53L12 17.6l-5.87 3.31 1.27-6.53-4.9-4.55 6.6-.77Z" />
    </svg>
  );
}
