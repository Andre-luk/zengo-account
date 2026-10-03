import { PartialType } from '@nestjs/swagger';
import { CreateOrganizationDto } from '@modules/organizations/dto/create-organization.dto';

export class UpdateOrganizationDto extends PartialType(CreateOrganizationDto) {}
