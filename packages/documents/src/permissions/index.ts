import type { DocumentAction, DocumentRole } from "../types/index.js";

const managerActions = new Set<DocumentAction>([
  "view",
  "create",
  "edit",
  "process",
  "review",
  "validate",
  "publish",
  "archive",
  "delete",
]);

export function canManageDocuments(role: DocumentRole, action: DocumentAction): boolean {
  if (role === "super_admin") return true;
  if (role === "platform_admin") return managerActions.has(action);
  if (role === "content_manager")
    return managerActions.has(action) && action !== "delete" && action !== "override_duplicate";
  if (role === "support") return action === "view";
  return false;
}

export function assertDocumentPermission(role: DocumentRole, action: DocumentAction): void {
  if (!canManageDocuments(role, action)) throw new Error(`Role ${role} cannot ${action} documents`);
}
