import { Injectable } from "@nestjs/common";
import {
  NodeReviewStateRecord,
  ReviewGraphRecord,
  ReviewNodeRecord,
} from "./review-graph.types";

@Injectable()
export class InMemoryReviewGraphRepository {
  private readonly graphsById = new Map<string, ReviewGraphRecord>();
  private readonly graphIdsByAnalysis = new Map<string, string>();
  private readonly nodesById = new Map<string, ReviewNodeRecord>();
  private readonly nodeIdsByGraph = new Map<string, string[]>();
  private readonly statesById = new Map<string, NodeReviewStateRecord>();
  private readonly stateIdsByNodeReviewer = new Map<string, string>();

  findGraphByAnalysis(analysisId: string): ReviewGraphRecord | null {
    const graphId = this.graphIdsByAnalysis.get(analysisId);
    return graphId ? (this.graphsById.get(graphId) ?? null) : null;
  }

  saveGraph(graph: ReviewGraphRecord): ReviewGraphRecord {
    this.graphsById.set(graph.id, graph);
    this.graphIdsByAnalysis.set(graph.analysisId, graph.id);
    return graph;
  }

  findNodeById(nodeId: string): ReviewNodeRecord | null {
    return this.nodesById.get(nodeId) ?? null;
  }

  listNodesByGraph(graphId: string): ReviewNodeRecord[] {
    return (this.nodeIdsByGraph.get(graphId) ?? []).flatMap((nodeId) => {
      const node = this.nodesById.get(nodeId);
      return node ? [node] : [];
    });
  }

  saveNode(node: ReviewNodeRecord): ReviewNodeRecord {
    this.nodesById.set(node.id, node);
    const nodeIds = this.nodeIdsByGraph.get(node.graphId) ?? [];

    if (!nodeIds.includes(node.id)) {
      this.nodeIdsByGraph.set(node.graphId, [...nodeIds, node.id]);
    }

    return node;
  }

  findStateByNodeReviewer(
    nodeId: string,
    reviewerMemberId: string,
  ): NodeReviewStateRecord | null {
    const stateId = this.stateIdsByNodeReviewer.get(
      this.stateKey(nodeId, reviewerMemberId),
    );
    return stateId ? (this.statesById.get(stateId) ?? null) : null;
  }

  listStatesByNode(nodeId: string): NodeReviewStateRecord[] {
    return [...this.statesById.values()].filter(
      (state) => state.nodeId === nodeId,
    );
  }

  saveState(state: NodeReviewStateRecord): NodeReviewStateRecord {
    this.statesById.set(state.id, state);
    this.stateIdsByNodeReviewer.set(
      this.stateKey(state.nodeId, state.reviewerMemberId),
      state.id,
    );
    return state;
  }

  private stateKey(nodeId: string, reviewerMemberId: string): string {
    return `${nodeId}:${reviewerMemberId}`;
  }
}
