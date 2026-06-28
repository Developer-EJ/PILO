import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  NotFoundException,
  Param,
  Put,
  UnauthorizedException,
} from "@nestjs/common";
import type { CurrentUserResponse } from "../auth/auth.service";
import { AuthService } from "../auth/auth.service";
import {
  CanvasAccessError,
  CanvasService,
  CanvasValidationError,
} from "./canvas.service";

@Controller()
export class CanvasController {
  constructor(
    private readonly authService: AuthService,
    private readonly canvasService: CanvasService,
  ) {}

  @Get("workspaces/:workspaceId/canvas-boards")
  listCanvasBoards(
    @Headers("cookie") cookieHeader: string | undefined,
    @Param("workspaceId") workspaceId: string,
  ) {
    return this.handleCanvasRequest(() =>
      this.canvasService.listCanvasBoards({
        currentUser: this.requireCurrentUser(cookieHeader),
        workspaceId,
      }),
    );
  }

  @Get("canvas-boards/:boardId")
  getCanvasBoardDetail(
    @Headers("cookie") cookieHeader: string | undefined,
    @Param("boardId") boardId: string,
  ) {
    return this.handleCanvasRequest(() =>
      this.canvasService.getCanvasBoardDetail({
        currentUser: this.requireCurrentUser(cookieHeader),
        boardId,
      }),
    );
  }

  @Put("canvas-shapes/:shapeId/position")
  updateCanvasShapePosition(
    @Headers("cookie") cookieHeader: string | undefined,
    @Param("shapeId") shapeId: string,
    @Body() body: unknown,
  ) {
    return this.handleCanvasRequest(() =>
      this.canvasService.updateCanvasShapePosition({
        currentUser: this.requireCurrentUser(cookieHeader),
        shapeId,
        body,
      }),
    );
  }

  private requireCurrentUser(
    cookieHeader: string | undefined,
  ): CurrentUserResponse {
    const currentUser =
      this.authService.getCurrentUserFromCookieHeader(cookieHeader);

    if (!currentUser) {
      throw new UnauthorizedException();
    }

    return currentUser;
  }

  private async handleCanvasRequest<T>(handler: () => Promise<T>) {
    try {
      return await handler();
    } catch (error) {
      if (error instanceof CanvasValidationError) {
        throw new BadRequestException(error.message);
      }

      if (error instanceof CanvasAccessError) {
        if (error.code === "canvas_workspace_forbidden") {
          throw new ForbiddenException(error.message);
        }

        throw new NotFoundException(error.message);
      }

      throw error;
    }
  }
}
