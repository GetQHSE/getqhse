import { z } from "zod";

export const manageablePlatformRoles = ["platform_admin", "content_manager", "support"] as const;
export const platformOperatorStatuses = ["active", "suspended"] as const;

const optionalTrimmed = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .optional()
    .transform((value) => value || undefined);

export const listPlatformUsersSchema = z
  .object({
    search: optionalTrimmed(200),
    role: z.enum(manageablePlatformRoles).optional(),
    status: z.enum(platformOperatorStatuses).optional(),
  })
  .strict();

export const createPlatformUserSchema = z
  .object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    email: z.email().trim().toLowerCase().max(320),
    password: z.string().min(12).max(128),
    platformRole: z.enum(manageablePlatformRoles),
    locale: z.string().trim().min(2).max(20).default("fr-MA"),
    timezone: z.string().trim().min(1).max(100).default("Africa/Casablanca"),
  })
  .strict();

export const updatePlatformUserSchema = z
  .object({
    firstName: z.string().trim().min(1).max(100).optional(),
    lastName: z.string().trim().min(1).max(100).optional(),
    password: z.string().min(12).max(128).optional(),
    platformRole: z.enum(manageablePlatformRoles).optional(),
    status: z.enum(platformOperatorStatuses).optional(),
    locale: z.string().trim().min(2).max(20).optional(),
    timezone: z.string().trim().min(1).max(100).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

export type ListPlatformUsersInput = z.infer<typeof listPlatformUsersSchema>;
export type CreatePlatformUserInput = z.infer<typeof createPlatformUserSchema>;
export type UpdatePlatformUserInput = z.infer<typeof updatePlatformUserSchema>;

export type PlatformOperator = {
  id: string;
  name: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  platformRole: string;
  status: string;
  locale: string;
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
};
