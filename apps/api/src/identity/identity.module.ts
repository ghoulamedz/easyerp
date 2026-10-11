import { Global, Module } from '@nestjs/common';
import { RolesController } from './roles.controller.js';
import { RolesService } from './roles.service.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Global()
@Module({
  controllers: [UsersController, RolesController],
  providers: [RolesService, UsersService],
  exports: [RolesService, UsersService],
})
export class IdentityModule {}
