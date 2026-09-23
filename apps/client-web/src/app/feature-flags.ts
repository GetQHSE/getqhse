/**
 * Deployment switches the frontend reads at build time.
 *
 * Mirrors the worker and API setting. Automatic publication is the default;
 * deployments can explicitly set both variables to false for manual review.
 */
export const AUTO_APPLICABLE = import.meta.env["VITE_REGULATORY_AUTO_APPLICABLE"] !== "false";
