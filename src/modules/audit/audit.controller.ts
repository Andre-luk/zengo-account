import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '@common/decorators/roles.decorator';
import { Role } from '@common/enums/role.enum';
import { AuditService } from '@modules/audit/audit.service';
import { QueryAuditLogsDto } from '@modules/audit/dto/query-audit-logs.dto';

@ApiTags('Journal d audit')
@ApiBearerAuth()
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.NATIONAL_DIRECTOR, Role.QUALITY_DIRECTOR, Role.DAF)
  @ApiOperation({
    summary: 'Consulter le journal d audit (conformite : tracabilite de toutes les actions).',
  })
  findAll(@Query() query: QueryAuditLogsDto) {
    return this.auditService.findAll(query);
  }
}
