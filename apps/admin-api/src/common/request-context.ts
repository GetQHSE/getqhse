import type { CurrentUser } from "@qhse/auth";
import type { Request } from "express";

export type AdminRequest = Request & {
  platformUser?: CurrentUser;
};
