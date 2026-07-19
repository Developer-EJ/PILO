import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const FORMAT = "phase4e-meeting-runtime-readiness:v2";
const RUNTIME_SUITES = [
  "scripts/agent/meeting-tools.test.mjs",
  "scripts/agent/execution.test.mjs",
  "scripts/agent/confirmation.test.mjs"
];
const RUNTIME_GUARANTEES = [
  "meeting_leave_execution",
  "recording_end_confirmation_and_execution",
  "action_item_update_confirmation_and_execution",
  "action_item_approve_confirmation_and_execution",
  "workspace_permission_enforcement",
  "approval_idempotency",
  "pre_execution_revalidation"
];
const REQUIRED_WRITE_CONTRACTS = [
  {
    capabilityId: "meeting.control.leave",
    toolName: "leave_meeting",
    executionMode: "contextual",
    requiresConfirmation: false,
    chain: ["get_active_meeting", "leave_meeting"]
  },
  {
    capabilityId: "meeting.recording.end",
    toolName: "end_meeting_recording",
    executionMode: "confirmation_required",
    requiresConfirmation: true,
    chain: ["get_active_meeting", "end_meeting_recording"]
  },
  {
    capabilityId: "meeting.action_items.update",
    toolName: "update_meeting_report_action_item",
    executionMode: "confirmation_required",
    requiresConfirmation: true,
    chain: ["find_action_items", "update_meeting_report_action_item"]
  },
  {
    capabilityId: "meeting.action_items.approve",
    toolName: "approve_meeting_report_action_item",
    executionMode: "confirmation_required",
    requiresConfirmation: true,
    chain: ["find_action_items", "approve_meeting_report_action_item"]
  }
];

function requiredObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
  return value;
}

function requiredString(value, message) {
  if (typeof value !== "string" || !value) throw new Error(message);
  return value;
}

export function evaluatePhase4eMeetingReadiness(snapshot, runtimeEvidence) {
  const root = requiredObject(snapshot, "Invalid Agent registry snapshot");
  if (root.format !== "agent-tool-retrieval-registry-snapshot:v1") {
    throw new Error("Unsupported Agent registry snapshot");
  }
  const inventory = requiredObject(root.inventory, "Missing Agent inventory");
  const schemas = requiredObject(
    root.eligibleToolSchemas,
    "Missing eligible tool schemas"
  );
  const catalog = requiredObject(
    root.toolCapabilityCatalog,
    "Missing tool capability catalog"
  );
  if (!Array.isArray(catalog.capabilities) || !Array.isArray(catalog.descriptors)) {
    throw new Error("Invalid tool capability catalog");
  }

  const descriptors = new Map(
    catalog.descriptors.map((descriptor) => [descriptor.toolName, descriptor])
  );
  const capabilities = new Map(
    catalog.capabilities.map((capability) => [capability.id, capability])
  );
  const writeContracts = REQUIRED_WRITE_CONTRACTS.map((expected) => {
    const descriptor = requiredObject(
      descriptors.get(expected.toolName),
      `Missing descriptor for ${expected.toolName}`
    );
    const capability = requiredObject(
      capabilities.get(expected.capabilityId),
      `Missing capability ${expected.capabilityId}`
    );
    const schema = requiredObject(
      schemas[expected.toolName],
      `Missing schema for ${expected.toolName}`
    );
    if (
      descriptor.domain !== "meeting" ||
      descriptor.operation !== "write" ||
      descriptor.executionMode !== expected.executionMode ||
      descriptor.requiresConfirmation !== expected.requiresConfirmation ||
      JSON.stringify(capability.toolNames) !== JSON.stringify(expected.chain) ||
      !descriptor.capabilityIds.includes(expected.capabilityId)
    ) {
      throw new Error(`Invalid Phase 4-E write contract for ${expected.toolName}`);
    }
    const inputSchemaSha256 = createHash("sha256")
      .update(JSON.stringify(sortJson(schema)))
      .digest("hex");
    if (descriptor.inputSchemaSha256 !== inputSchemaSha256) {
      throw new Error(`Schema digest mismatch for ${expected.toolName}`);
    }
    return {
      contractId: expected.capabilityId,
      executionMode: expected.executionMode,
      requiresConfirmation: expected.requiresConfirmation,
      chainSize: expected.chain.length,
      inputSchemaSha256
    };
  });

  const meetingDescriptors = catalog.descriptors.filter(
    (descriptor) => descriptor.domain === "meeting"
  );
  if (
    meetingDescriptors.length < 18 ||
    meetingDescriptors.some(
      (descriptor) =>
        !["read", "write"].includes(descriptor.operation) ||
        !Array.isArray(descriptor.capabilityIds) ||
        descriptor.capabilityIds.length === 0
    )
  ) {
    throw new Error("Meeting read/write descriptor coverage is incomplete");
  }

  return {
    format: FORMAT,
    passed: true,
    registry: {
      inventorySha256: requiredString(inventory.sha256, "Missing inventory SHA"),
      catalogSha256: requiredString(inventory.catalogSha256, "Missing catalog SHA"),
      eligibleSnapshotSha256: requiredString(
        root.eligibleSnapshotSha256,
        "Missing eligible snapshot SHA"
      )
    },
    checks: [
      { id: "meeting_read_write_descriptors", status: "passed" },
      { id: "meeting_write_confirmation_contracts", status: "passed" },
      { id: "meeting_write_schema_binding", status: "passed" },
      { id: "meeting_write_runtime_e2e", status: "passed" }
    ],
    meetingDescriptorCount: meetingDescriptors.length,
    writeContracts,
    runtimeEvidence: validateRuntimeEvidence(runtimeEvidence)
  };
}

export function validateRuntimeEvidence(value) {
  const evidence = requiredObject(value, "Missing Meeting runtime E2E evidence");
  if (
    evidence.status !== "passed" ||
    JSON.stringify(evidence.suites) !== JSON.stringify(RUNTIME_SUITES) ||
    JSON.stringify(evidence.guarantees) !== JSON.stringify(RUNTIME_GUARANTEES) ||
    !Array.isArray(evidence.suiteSha256) ||
    evidence.suiteSha256.length !== RUNTIME_SUITES.length ||
    evidence.suiteSha256.some((sha) => !/^[a-f0-9]{64}$/.test(sha))
  ) {
    throw new Error("Meeting runtime E2E evidence is incomplete");
  }
  return evidence;
}

async function runRuntimeSuites() {
  const suiteSha256 = [];
  for (const suite of RUNTIME_SUITES) {
    const result = spawnSync(process.execPath, [suite], {
      cwd: new URL("../../", import.meta.url),
      encoding: "utf8",
      stdio: "inherit"
    });
    if (result.status !== 0) {
      throw new Error(`Meeting runtime E2E suite failed: ${suite}`);
    }
    suiteSha256.push(
      createHash("sha256")
        .update(await readFile(new URL(`../../${suite}`, import.meta.url)))
        .digest("hex")
    );
  }
  return {
    status: "passed",
    suites: RUNTIME_SUITES,
    suiteSha256,
    guarantees: RUNTIME_GUARANTEES
  };
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortJson(item)])
    );
  }
  return value;
}

async function main(argv) {
  const snapshotIndex = argv.indexOf("--registry-snapshot");
  const outputIndex = argv.indexOf("--output");
  if (snapshotIndex < 0 || outputIndex < 0) {
    throw new Error("--registry-snapshot and --output are required");
  }
  const snapshot = JSON.parse(await readFile(argv[snapshotIndex + 1], "utf8"));
  const report = evaluatePhase4eMeetingReadiness(
    snapshot,
    await runRuntimeSuites()
  );
  await writeFile(argv[outputIndex + 1], `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main(process.argv.slice(2));
}
