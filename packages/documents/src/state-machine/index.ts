import type { DocumentStatus } from "../types/index.js";

const transitions: Readonly<Record<DocumentStatus, readonly DocumentStatus[]>> = {
  draft: ["uploaded", "archived"],
  uploaded: ["processing", "archived"],
  processing: ["review_required", "processing_failed"],
  processing_failed: ["processing", "archived"],
  review_required: ["validated", "processing", "archived"],
  validated: ["published", "review_required", "archived"],
  published: ["archived"],
  archived: [],
};

export class InvalidDocumentTransitionError extends Error {
  constructor(
    readonly from: DocumentStatus,
    readonly to: DocumentStatus,
  ) {
    super(`Invalid document transition: ${from} -> ${to}`);
    this.name = "InvalidDocumentTransitionError";
  }
}

export function canTransition(from: DocumentStatus, to: DocumentStatus): boolean {
  return transitions[from].includes(to);
}

export function assertTransition(from: DocumentStatus, to: DocumentStatus): void {
  if (!canTransition(from, to)) throw new InvalidDocumentTransitionError(from, to);
}

export function publicationChecklist(input: {
  metadataValidated: boolean;
  filesVerified: boolean;
  extractionCompleted: boolean;
  ocrRequired: boolean;
  ocrReviewed: boolean;
  structureValidated: boolean;
  classificationApproved: boolean;
  relationshipConfirmed: boolean;
  blockingIssueCount: number;
}) {
  return {
    metadataValidated: input.metadataValidated,
    filesVerified: input.filesVerified,
    extractionCompleted: input.extractionCompleted,
    ocrReviewed: !input.ocrRequired || input.ocrReviewed,
    structureValidated: input.structureValidated,
    classificationApproved: input.classificationApproved,
    relationshipConfirmed: input.relationshipConfirmed,
    noBlockingIssues: input.blockingIssueCount === 0,
  };
}

export function checklistIsComplete(checklist: Record<string, boolean>): boolean {
  return Object.values(checklist).every(Boolean);
}
