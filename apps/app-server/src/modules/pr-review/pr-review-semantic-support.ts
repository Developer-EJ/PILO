import { posix as path } from "node:path";
import type {
  PrReviewFileRoleCandidate,
  PrReviewRelationCandidateInput,
  PrReviewSemanticGraphFileInput
} from "./pr-review-semantic-graph";

const COMMON_IDENTIFIERS = new Set([
  "async",
  "await",
  "class",
  "const",
  "create",
  "delete",
  "export",
  "false",
  "function",
  "import",
  "insert",
  "interface",
  "primary",
  "return",
  "select",
  "string",
  "table",
  "true",
  "update",
  "values"
]);

export function buildSupportRelationCandidates(
  files: readonly PrReviewSemanticGraphFileInput[],
  roleByPath: ReadonlyMap<string, PrReviewFileRoleCandidate>
): PrReviewRelationCandidateInput[] {
  const candidates: PrReviewRelationCandidateInput[] = [];
  const fileByPath = new Map(files.map((file) => [file.filePath, file]));

  for (const supportFile of files) {
    if (roleByPath.get(supportFile.filePath)?.roleType !== "support") {
      continue;
    }

    const manifestPath = manifestForLockfile(supportFile.filePath);
    if (manifestPath && fileByPath.has(manifestPath)) {
      candidates.push({
        fromFilePath: supportFile.filePath,
        toFilePath: manifestPath,
        relationType: "supports",
        confidence: 98,
        evidence: "package_lock_manifest"
      });
    }

    const supportText = retainedPatchText(supportFile.patch);
    const supportIdentifiers = distinctiveIdentifiers(supportText);

    for (const targetFile of files) {
      if (
        targetFile.filePath === supportFile.filePath ||
        roleByPath.get(targetFile.filePath)?.roleType === "support"
      ) {
        continue;
      }

      const targetText = retainedPatchText(targetFile.patch);
      if (hasExplicitFileReference(supportText, targetFile.filePath, targetText, supportFile.filePath)) {
        candidates.push({
          fromFilePath: supportFile.filePath,
          toFilePath: targetFile.filePath,
          relationType: "supports",
          confidence: 75,
          evidence: "explicit_file_reference"
        });
        continue;
      }

      const sharedIdentifier = firstSharedIdentifier(
        supportIdentifiers,
        distinctiveIdentifiers(targetText)
      );
      if (sharedIdentifier) {
        candidates.push({
          fromFilePath: supportFile.filePath,
          toFilePath: targetFile.filePath,
          relationType: "supports",
          confidence: 65,
          evidence: `shared_identifier:${sharedIdentifier}`
        });
      }
    }
  }

  return candidates;
}

function manifestForLockfile(filePath: string): string | null {
  if (!/(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(filePath)) {
    return null;
  }
  return path.join(path.dirname(filePath), "package.json");
}

function retainedPatchText(patchValue: string | null): string {
  if (!patchValue) {
    return "";
  }

  return patchValue
    .split("\n")
    .filter(
      (line) =>
        (line.startsWith("+") && !line.startsWith("+++")) || line.startsWith(" ")
    )
    .map((line) => line.slice(1))
    .join("\n");
}

function hasExplicitFileReference(
  supportText: string,
  targetPath: string,
  targetText: string,
  supportPath: string
): boolean {
  return (
    mentionsPath(supportText, targetPath) || mentionsPath(targetText, supportPath)
  );
}

function mentionsPath(text: string, filePath: string): boolean {
  const normalizedText = text.replace(/\\/g, "/").toLowerCase();
  const normalizedPath = filePath.toLowerCase();
  const baseName = path.basename(normalizedPath);
  return (
    normalizedText.includes(normalizedPath) ||
    (baseName.length >= 5 && normalizedText.includes(baseName))
  );
}

function distinctiveIdentifiers(text: string): Set<string> {
  const identifiers = new Set<string>();
  const matches = text.match(/[A-Za-z][A-Za-z0-9_]{4,}/g) ?? [];

  for (const value of matches) {
    if (!value.includes("_") && !/[a-z][A-Z]/.test(value)) {
      continue;
    }
    const normalized = value.toLowerCase();
    if (!COMMON_IDENTIFIERS.has(normalized)) {
      identifiers.add(normalized);
    }
  }

  return identifiers;
}

function firstSharedIdentifier(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>
): string | null {
  return [...left].filter((value) => right.has(value)).sort()[0] ?? null;
}
