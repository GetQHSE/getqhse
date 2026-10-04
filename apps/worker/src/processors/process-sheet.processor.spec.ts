import { describe, it, expect } from "vitest";
import { processSheetProposalSchema } from "@qhse/contracts";
import { buildProcessSheetPrompt } from "@qhse/ai";
describe("Process sheet activity proposal boundary", () => {
  it("requires an actual activity, input and output", () => {
    expect(
      processSheetProposalSchema.safeParse({
        activities: [{ activity: "Repair goods", input: "", output: "Repaired goods" }],
      }).success,
    ).toBe(false);
    expect(processSheetProposalSchema.safeParse({ activities: [] }).success).toBe(false);
  });
  it("keeps proposal decisions and fabricated identity fields outside AI authority", () => {
    const proposal = processSheetProposalSchema.parse({
      activities: [
        {
          activity: "Check repaired goods",
          input: "Repaired goods",
          output: "Verified goods",
          decision: "retained",
          pilotName: "Invented person",
        },
      ],
      documentCode: "FP-001",
      approverName: "Invented director",
    });
    expect(proposal.activities[0]).not.toHaveProperty("decision");
    expect(proposal).not.toHaveProperty("documentCode");
    expect(proposal).not.toHaveProperty("approverName");
  });
  it("uses project language and the actual professional description", () => {
    const prompt = buildProcessSheetPrompt(
      { content: { description: "Repair work is described by the reviewer" } },
      "ar",
    );
    expect(prompt.system).toContain("Write all prose in ar");
    expect(prompt.context).toContain("Repair work is described by the reviewer");
  });
});
