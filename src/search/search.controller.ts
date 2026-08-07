import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Types } from 'mongoose';
import { CurrentOrg } from '../auth/decorators/current-org.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AppRole } from '../users/app-role.enum';
import { SearchQueryDto } from './dto/search-query.dto';
import { SearchService } from './search.service';

@ApiTags('search')
@ApiBearerAuth('access-token')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @Roles(AppRole.Admin, AppRole.Administrator, AppRole.User)
  findAll(
    @Query() query: SearchQueryDto,
    @CurrentOrg() organizationId: Types.ObjectId,
  ) {
    return this.searchService.search(query.q, organizationId, query.limit ?? 5);
  }
}
