import type { SqltoerdDialect } from "../types";

export type SqlErdSourceMutation =
  | { dialect: SqltoerdDialect; type: "dialect" }
  | { type: "redo" }
  | { type: "undo" };

export type SqlErdSourceMutationIntentState = {
  controlEngaged: boolean;
  pendingMutation: SqlErdSourceMutation | null;
};

export type SqlErdSourceMutationIntentAction =
  | { engaged: boolean; type: "control_engagement_changed" }
  | { action: SqlErdSourceMutation; type: "request" }
  | { type: "consume" }
  | { type: "reset" };

export function createSqlErdSourceMutationIntentState(): SqlErdSourceMutationIntentState {
  return {
    controlEngaged: false,
    pendingMutation: null
  };
}

export function reduceSqlErdSourceMutationIntent(
  state: SqlErdSourceMutationIntentState,
  action: SqlErdSourceMutationIntentAction
): SqlErdSourceMutationIntentState {
  switch (action.type) {
    case "consume":
      return {
        ...state,
        pendingMutation: null
      };
    case "control_engagement_changed":
      return {
        ...state,
        controlEngaged: action.engaged
      };
    case "request":
      if (state.pendingMutation) {
        return state;
      }

      return {
        controlEngaged: false,
        pendingMutation: action.action
      };
    case "reset":
      return createSqlErdSourceMutationIntentState();
  }
}

export function getRunnableSqlErdSourceMutation(
  state: SqlErdSourceMutationIntentState,
  canEdit: boolean
): SqlErdSourceMutation | null {
  return canEdit ? state.pendingMutation : null;
}

export function shouldHoldSqlErdSourceMutationIntent(
  state: SqlErdSourceMutationIntentState
): boolean {
  return state.controlEngaged || state.pendingMutation !== null;
}
