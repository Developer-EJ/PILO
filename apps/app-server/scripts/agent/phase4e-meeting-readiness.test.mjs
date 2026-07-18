import assert from "node:assert/strict";
import {
  evaluatePhase4eMeetingReadiness
} from "./phase4e-meeting-readiness.mjs";

const writeContracts = [
  ["meeting.control.leave", "leave_meeting", "contextual", false, ["get_active_meeting", "leave_meeting"]],
  ["meeting.recording.end", "end_meeting_recording", "confirmation_required", true, ["get_active_meeting", "end_meeting_recording"]],
  ["meeting.action_items.update", "update_meeting_report_action_item", "confirmation_required", true, ["find_action_items", "update_meeting_report_action_item"]],
  ["meeting.action_items.approve", "approve_meeting_report_action_item", "confirmation_required", true, ["find_action_items", "approve_meeting_report_action_item"]]
];

function sha256Schema() {
  return "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a";
}

function snapshot() {
  const eligibleToolSchemas = {};
  const descriptors = [];
  const capabilities = [];
  for (const [capabilityId, toolName, executionMode, requiresConfirmation, chain] of writeContracts) {
    eligibleToolSchemas[toolName] = {};
    descriptors.push({
      toolName,
      domain: "meeting",
      operation: "write",
      executionMode,
      requiresConfirmation,
      capabilityIds: [capabilityId],
      inputSchemaSha256: sha256Schema()
    });
    capabilities.push({ id: capabilityId, toolNames: chain });
  }
  for (let index = descriptors.length; index < 18; index += 1) {
    const toolName = `meeting_read_${index}`;
    const capabilityId = `meeting.read.${index}`;
    eligibleToolSchemas[toolName] = {};
    descriptors.push({
      toolName,
      domain: "meeting",
      operation: "read",
      executionMode: "auto",
      requiresConfirmation: false,
      capabilityIds: [capabilityId],
      inputSchemaSha256: sha256Schema()
    });
    capabilities.push({ id: capabilityId, toolNames: [toolName] });
  }
  return {
    format: "agent-tool-retrieval-registry-snapshot:v1",
    inventory: { sha256: "a".repeat(64), catalogSha256: "b".repeat(64) },
    eligibleSnapshotSha256: "c".repeat(64),
    eligibleToolSchemas,
    toolCapabilityCatalog: { capabilities, descriptors }
  };
}

const report = evaluatePhase4eMeetingReadiness(snapshot());
assert.equal(report.passed, true);
assert.equal(report.meetingDescriptorCount, 18);
assert.equal(report.writeContracts.length, 4);
assert.doesNotMatch(JSON.stringify(report), /[0-9a-f]{8}-[0-9a-f]{4}-/i);
assert.doesNotMatch(JSON.stringify(report), /resourceId|authorization|credential|token/i);
assert.deepEqual(
  report.writeContracts.map((contract) => contract.requiresConfirmation),
  [false, true, true, true]
);

const invalid = snapshot();
invalid.toolCapabilityCatalog.descriptors.find(
  (descriptor) => descriptor.toolName === "end_meeting_recording"
).requiresConfirmation = false;
assert.throws(
  () => evaluatePhase4eMeetingReadiness(invalid),
  /Invalid Phase 4-E write contract/
);
