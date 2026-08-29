import zxcvbn from "zxcvbn";

const STRENGTH_LABELS = [
  "Very weak",
  "Weak",
  "Fair",
  "Strong",
  "Very strong",
] as const;

// Index 0 = unfilled segment color; indices 1-4 = score colors
const STRENGTH_COLORS = [
  "bg-gray-300", // 0 - empty / unfilled segment
  "bg-red-500", //  1 - very weak
  "bg-orange-500", // 2 - weak
  "bg-yellow-500", // 3 - fair
  "bg-green-500", //  4 - strong
];

interface PasswordStrengthMeterProps {
  password: string;
}

export function PasswordStrengthMeter({ password }: PasswordStrengthMeterProps) {
  if (!password) return null;

  const result = zxcvbn(password);
  const score = result.score; // 0–4
  const label = STRENGTH_LABELS[score];

  // Active bar color is driven by the score (score 0 also shows red to
  // indicate "very weak" rather than invisible).
  const activeColor = STRENGTH_COLORS[score === 0 ? 1 : score];

  // zxcvbn feedback suggestion (only show when score < 3)
  const suggestion =
    score < 3
      ? result.feedback.suggestions[0] ?? result.feedback.warning ?? null
      : null;

  return (
    <div className="mt-2 space-y-1" aria-label="Password strength indicator">
      {/* 4 segment bar */}
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((segment) => (
          <div
            key={segment}
            className={`h-1.5 flex-1 rounded-full transition-colors duration-200 ${
              segment <= score || (score === 0 && segment === 1)
                ? activeColor
                : "bg-gray-200 dark:bg-gray-700"
            }`}
          />
        ))}
      </div>

      {/* Label row */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Password strength</span>
        <span
          className={`text-xs font-medium ${
            score <= 1
              ? "text-red-500"
              : score === 2
                ? "text-orange-500"
                : score === 3
                  ? "text-yellow-500"
                  : "text-green-500"
          }`}
        >
          {label}
        </span>
      </div>

      {/* Suggestion */}
      {suggestion && (
        <p className="text-xs text-muted-foreground">{suggestion}</p>
      )}
    </div>
  );
}

/**
 * Returns the zxcvbn score (0–4) for a given password.
 * Returns 0 for an empty string without invoking zxcvbn.
 */
export function getPasswordScore(password: string): number {
  if (!password) return 0;
  return zxcvbn(password).score;
}
