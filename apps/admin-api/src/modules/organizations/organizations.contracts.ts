import { z } from "zod";

export const organizationStatuses = ["active", "suspended"] as const;
export const aiUsagePeriods = ["7d", "30d", "90d", "all"] as const;
export const projectStatuses = [
  "EMPTY",
  "PROFILE_IN_PROGRESS",
  "PROFILE_REVIEW",
  "READY_FOR_ANALYSIS",
  "ANALYSIS_IN_PROGRESS",
  "REVIEW_REQUIRED",
  "COMPLETED",
  "ARCHIVED",
] as const;

const optionalTrimmed = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .optional()
    .transform((value) => value || undefined);

const pagination = {
  page: z.coerce.number().int().positive().max(10_000).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(25),
};

export const listOrganizationsSchema = z
  .object({
    search: optionalTrimmed(200),
    status: z.enum(organizationStatuses).optional(),
    ...pagination,
  })
  .strict();

export const listOrganizationProjectsSchema = z
  .object({
    search: optionalTrimmed(200),
    status: z.enum(projectStatuses).optional(),
    ...pagination,
  })
  .strict();

export const aiUsageQuerySchema = z
  .object({ period: z.enum(aiUsagePeriods).default("30d") })
  .strict();

export type ListOrganizationsInput = z.infer<typeof listOrganizationsSchema>;
export type ListOrganizationProjectsInput = z.infer<typeof listOrganizationProjectsSchema>;
export type AiUsageQuery = z.infer<typeof aiUsageQuerySchema>;
