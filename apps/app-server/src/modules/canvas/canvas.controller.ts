import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  UnauthorizedException,
} from "@nestjs/common";
import type { CurrentUserResponse } from "../auth/auth.service";
import { AuthService } from "../auth/auth.service";
import {
  CanvasAccessError,
  CanvasConflictError,
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

  @Post("workspaces/:workspaceId/canvas-boards")
  createCanvasBoard(
    @Headers("cookie") cookieHeader: string | undefined,
    @Param("workspaceId") workspaceId: string,
    @Body() body: unknown,
  ) {
    return this.handleCanvasRequest(() =>
      this.canvasService.createCanvasBoard({
        currentUser: this.requireCurrentUser(cookieHeader),
        workspaceId,
        body,
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

  @Post("canvas-boards/:boardId/shapes")
  createCanvasShape(
    @Headers("cookie") cookieHeader: string | undefined,
    @Param("boardId") boardId: string,
    @Body() body: unknown,
  ) {
    return this.handleCanvasRequest(() =>
      this.canvasService.createCanvasShape({
        currentUser: this.requireCurrentUser(cookieHeader),
        boardId,
        body,
      }),
    );
  }

  @Patch("canvas-shapes/:shapeId")
  updateCanvasShape(
    @Headers("cookie") cookieHeader: string | undefined,
    @Param("shapeId") shapeId: string,
    @Body() body: unknown,
  ) {
    return this.handleCanvasRequest(() =>
      this.canvasService.updateCanvasShape({
        currentUser: this.requireCurrentUser(cookieHeader),
        shapeId,
        body,
      }),
    );
  }

  @Delete("canvas-shapes/:shapeId")
  deleteCanvasShape(
    @Headers("cookie") cookieHeader: string | undefined,
    @Param("shapeId") shapeId: string,
  ) {
    return this.handleCanvasRequest(() =>
      this.canvasService.deleteCanvasShape({
        currentUser: this.requireCurrentUser(cookieHeader),
        shapeId,
      }),
    );
  }

  @Post("canvas-boards/:boardId/connections")
  createCanvasConnection(
    @Headers("cookie") cookieHeader: string | undefined,
    @Param("boardId") boardId: string,
    @Body() body: unknown,
  ) {
    return this.handleCanvasRequest(() =>
      this.canvasService.createCanvasConnection({
        currentUser: this.requireCurrentUser(cookieHeader),
        boardId,
        body,
      }),
    );
  }

  @Delete("canvas-connections/:connectionId")
  deleteCanvasConnection(
    @Headers("cookie") cookieHeader: string | undefined,
    @Param("connectionId") connectionId: string,
  ) {
    return this.handleCanvasRequest(() =>
      this.canvasService.deleteCanvasConnection({
        currentUser: this.requireCurrentUser(cookieHeader),
        connectionId,
      }),
    );
  }

  @Put("canvas-boards/:boardId/view-settings")
  updateCanvasViewSetting(
    @Headers("cookie") cookieHeader: string | undefined,
    @Param("boardId") boardId: string,
    @Body() body: unknown,
  ) {
    return this.handleCanvasRequest(() =>
      this.canvasService.updateCanvasViewSetting({
        currentUser: this.requireCurrentUser(cookieHeader),
        boardId,
        body,
      }),
    );
  }

  @Put("canvas-boards/:boardId/filter-settings")
  updateCanvasFilterSetting(
    @Headers("cookie") cookieHeader: string | undefined,
    @Param("boardId") boardId: string,
    @Body() body: unknown,
  ) {
    return this.handleCanvasRequest(() =>
      this.canvasService.updateCanvasFilterSetting({
        currentUser: this.requireCurrentUser(cookieHeader),
        boardId,
        body,
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

      if (error instanceof CanvasConflictError) {
        throw new ConflictException(error.message);
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
