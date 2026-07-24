import type {
  GithubActiveBoardSource,
  GithubProjectV2,
  GithubRepository
} from "@/features/github-integration/types";

type ProjectV2SelectionInput = {
  projects: ReadonlyArray<Pick<GithubProjectV2, "id" | "repositoryIds">>;
  preferredProjectV2Id?: string;
  repositoryId?: string;
  allowFallbackSelection?: boolean;
};

type GithubActiveBoardSelectionInput = {
  repositories: ReadonlyArray<Pick<GithubRepository, "id">>;
  projects: ReadonlyArray<Pick<GithubProjectV2, "id" | "repositoryIds">>;
  activeBoardSource: GithubActiveBoardSource | null;
  preferredRepositoryId?: string;
  preferredProjectV2Id?: string;
};

type ActivateDefaultGithubBoardInput = {
  projects: ReadonlyArray<Pick<GithubProjectV2, "id" | "repositoryIds">>;
  repositoryId: string;
  preferredProjectV2Id?: string;
  activate: (source: GithubBoardSelection) => Promise<GithubActiveBoardSource>;
};

type ActiveBoardProjectInput = {
  activeBoardSource: GithubActiveBoardSource | null;
  repositoryId: string;
  projectV2Id: string;
};

type GithubBrowsingResultInput = {
  currentRepositoryId: string;
  requestedRepositoryId: string;
};

type GithubWorkspaceResultInput = {
  currentWorkspaceId: string;
  requestedWorkspaceId: string;
  responseWorkspaceId: string;
};

type WorkspaceScopedActiveBoardSourceInput = {
  activeBoardSource: GithubActiveBoardSource | null;
  workspaceId: string;
};

type GithubRepositoryRequestResultInput = {
  currentWorkspaceId: string;
  requestedWorkspaceId: string;
  currentRepositoryId: string;
  requestedRepositoryId: string;
};

export type GithubBoardSelection = {
  repositoryId: string;
  projectV2Id: string;
};

export type GithubActiveBoardSelection = GithubBoardSelection;

export function selectProjectV2IdForRepository({
  projects,
  preferredProjectV2Id,
  repositoryId,
  allowFallbackSelection = true
}: ProjectV2SelectionInput): string {
  const preferredProject = projects.find(
    (project) => project.id === preferredProjectV2Id
  );

  if (repositoryId) {
    if (preferredProject?.repositoryIds.includes(repositoryId)) {
      return preferredProject.id;
    }

    if (!allowFallbackSelection) {
      return "";
    }

    const linkedProject = projects.find((project) =>
      project.repositoryIds.includes(repositoryId)
    );
    if (linkedProject) {
      return linkedProject.id;
    }
  }

  return preferredProject?.id ??
    (allowFallbackSelection ? projects[0]?.id : undefined) ??
    "";
}

export function resolveGithubBrowsingSelection({
  repositories,
  projects,
  activeBoardSource,
  preferredRepositoryId,
  preferredProjectV2Id
}: GithubActiveBoardSelectionInput): GithubBoardSelection {
  const requestedRepositoryId =
    preferredRepositoryId !== undefined
      ? preferredRepositoryId
      : (activeBoardSource?.repository.id ?? "");
  const repository = repositories.find(
    (candidate) => candidate.id === requestedRepositoryId
  );
  if (!repository) {
    return { repositoryId: "", projectV2Id: "" };
  }

  const requestedProjectV2Id =
    preferredProjectV2Id !== undefined
      ? preferredProjectV2Id
      : (activeBoardSource?.project.id ?? "");

  return {
    repositoryId: repository.id,
    projectV2Id: selectProjectV2IdForRepository({
      projects,
      preferredProjectV2Id: requestedProjectV2Id,
      repositoryId: repository.id,
      allowFallbackSelection: false
    })
  };
}

export const resolveGithubActiveBoardSelection = resolveGithubBrowsingSelection;

export function isGithubActiveBoardProject({
  activeBoardSource,
  repositoryId,
  projectV2Id
}: ActiveBoardProjectInput): boolean {
  return Boolean(
    activeBoardSource &&
      activeBoardSource.repository.id === repositoryId &&
      activeBoardSource.project.id === projectV2Id
  );
}

export function shouldApplyGithubBrowsingResult({
  currentRepositoryId,
  requestedRepositoryId
}: GithubBrowsingResultInput): boolean {
  return currentRepositoryId === requestedRepositoryId;
}

export function getWorkspaceScopedGithubActiveBoardSource({
  activeBoardSource,
  workspaceId
}: WorkspaceScopedActiveBoardSourceInput): GithubActiveBoardSource | null {
  if (activeBoardSource?.workspaceId !== workspaceId) {
    return null;
  }

  return activeBoardSource;
}

export function shouldApplyGithubRepositoryRequestResult({
  currentWorkspaceId,
  requestedWorkspaceId,
  currentRepositoryId,
  requestedRepositoryId
}: GithubRepositoryRequestResultInput): boolean {
  return (
    currentWorkspaceId === requestedWorkspaceId &&
    shouldApplyGithubBrowsingResult({
      currentRepositoryId,
      requestedRepositoryId
    })
  );
}

export function shouldApplyGithubWorkspaceResult({
  currentWorkspaceId,
  requestedWorkspaceId,
  responseWorkspaceId
}: GithubWorkspaceResultInput): boolean {
  return (
    currentWorkspaceId === requestedWorkspaceId &&
    requestedWorkspaceId === responseWorkspaceId
  );
}

export async function activateDefaultGithubBoardForRepository({
  projects,
  repositoryId,
  preferredProjectV2Id,
  activate
}: ActivateDefaultGithubBoardInput): Promise<GithubActiveBoardSource | null> {
  const projectV2Id = selectProjectV2IdForRepository({
    projects,
    preferredProjectV2Id,
    repositoryId
  });

  if (!projectV2Id) {
    return null;
  }

  return activate({ repositoryId, projectV2Id });
}
