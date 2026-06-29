import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";

export interface CurrentMemberContext {
  userId: string;
  memberId: string;
  workspaceId: string;
  role: "owner" | "member" | "viewer";
}

interface RequestWithCurrentMember {
  currentMember?: CurrentMemberContext;
}

export const CurrentMember = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CurrentMemberContext => {
    const request = context
      .switchToHttp()
      .getRequest<RequestWithCurrentMember>();

    if (!request.currentMember) {
      throw new UnauthorizedException({
        error: {
          code: "unauthorized",
          message: "Current member context is required.",
        },
      });
    }

    return request.currentMember;
  },
);
