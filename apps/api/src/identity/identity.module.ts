import { Global, Module } from '@nestjs/common';
import { RolesService } from './roles.service.js';
import { UsersService } from './users.service.js';

@Global()
@Module({
  providers: [RolesService, UsersService],
  exports: [RolesService, UsersService],
})
export class IdentityModule {}
