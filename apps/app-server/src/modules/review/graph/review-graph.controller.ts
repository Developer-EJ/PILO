import { Body, Controller, Get, Param, Patch } from "@nestjs/common";
import {
  NodeReviewStateRecord,
  ReviewGraphSummary,
  UpsertNodeReviewStateInput,
} from "./review-graph.types";
import { ReviewGraphService } from "./review-graph.service";

@Controller()
export class ReviewGraphController {
  constructor(private readonly graphService: ReviewGraphService) {}

  @Get("pull-request-analyses/:analysisId/graph")
  getGraph(@Param("analysisId") analysisId: string): ReviewGraphSummary {
    return this.graphService.getGraph(analysisId);
  }

  @Patch("review-nodes/:nodeId/state")
  upsertNodeState(
    @Param("nodeId") nodeId: string,
    @Body() body: UpsertNodeReviewStateInput,
  ): NodeReviewStateRecord {
    return this.graphService.upsertNodeState(nodeId, body);
  }
}
