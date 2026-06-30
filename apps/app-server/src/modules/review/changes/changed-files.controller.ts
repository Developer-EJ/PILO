import { Controller, Get, Param } from "@nestjs/common";
import { ChangedFileWithFunctions } from "./changed-file.types";
import { ChangedFilesService } from "./changed-files.service";

@Controller("pull-request-analyses")
export class ChangedFilesController {
  constructor(private readonly changedFilesService: ChangedFilesService) {}

  @Get(":analysisId/changed-files")
  listChangedFiles(
    @Param("analysisId") analysisId: string,
  ): Promise<ChangedFileWithFunctions[]> {
    return this.changedFilesService.listChangedFiles(analysisId);
  }
}
