import assert from "node:assert/strict";
import { getGithubSettingsAccessState } from "./utils/github-settings-access.ts";

assert.deepEqual(
  getGithubSettingsAccessState({
    connected: false,
    hasInstallation: false,
    projectOAuthConnected: false
  }),
  {
    canInstallGithubApp: false,
    canConnectProjectOAuth: false,
    canChooseRepository: false,
    githubStepStatus: "required",
    installationStepStatus: "blocked",
    projectStepStatus: "blocked"
  }
);

assert.equal(
  getGithubSettingsAccessState({
    connected: true,
    hasInstallation: false,
    projectOAuthConnected: false
  }).canInstallGithubApp,
  true
);

assert.deepEqual(
  getGithubSettingsAccessState({
    connected: true,
    hasInstallation: true,
    projectOAuthConnected: false
  }),
  {
    canInstallGithubApp: true,
    canConnectProjectOAuth: true,
    canChooseRepository: true,
    githubStepStatus: "complete",
    installationStepStatus: "complete",
    projectStepStatus: "optional"
  }
);
