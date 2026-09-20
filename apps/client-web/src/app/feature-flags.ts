/**
 * Deployment switches the frontend reads at build time.
 *
 * `AUTO_APPLICABLE` mirrors the worker's REGULATORY_AUTO_APPLICABLE. When it is
 * on, every regulatory candidate is decided APPLICABLE by the system and no
 * candidate carries `requiresReview`, so the decision buttons already disappear
 * on their own — this flag only keeps the surrounding copy honest, so the screen
 * does not ask for a review nobody is expected to give.
 */
export const AUTO_APPLICABLE = import.meta.env["VITE_REGULATORY_AUTO_APPLICABLE"] === "true";
