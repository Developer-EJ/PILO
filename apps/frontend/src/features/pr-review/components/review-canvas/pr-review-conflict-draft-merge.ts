import { diff3Merge } from "node-diff3";

type Diff3Region =
  | { ok: string[] }
  | {
      conflict: {
        a: string[];
        b: string[];
        o: string[];
      };
    };

export type PrReviewConflictDraftMergeResult =
  | {
      kind: "clean";
      resolvedContent: string;
    }
  | {
      kind: "overlap";
      overlapCount: number;
      preserveManualContent: string;
      useSelectionContent: string;
    };

export function mergePrReviewConflictDraft(input: {
  currentContent: string;
  previousGeneratedContent: string;
  nextGeneratedContent: string;
}): PrReviewConflictDraftMergeResult {
  const regions = diff3Merge<string>(
    splitContentLines(input.currentContent),
    splitContentLines(input.previousGeneratedContent),
    splitContentLines(input.nextGeneratedContent),
    { excludeFalseConflicts: true }
  ) as Diff3Region[];
  const overlapCount = regions.filter((region) => "conflict" in region).length;

  if (overlapCount === 0) {
    return {
      kind: "clean",
      resolvedContent: joinRegions(regions, "manual")
    };
  }

  return {
    kind: "overlap",
    overlapCount,
    preserveManualContent: joinRegions(regions, "manual"),
    useSelectionContent: joinRegions(regions, "selection")
  };
}

function joinRegions(
  regions: Diff3Region[],
  conflictChoice: "manual" | "selection"
): string {
  return regions
    .flatMap((region) => {
      if ("ok" in region) {
        return region.ok;
      }
      return conflictChoice === "manual"
        ? region.conflict.a
        : region.conflict.b;
    })
    .join("\n");
}

function splitContentLines(content: string): string[] {
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return normalized.length === 0 ? [] : normalized.split("\n");
}
