import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { BetterAuthSessionProvider } from './better-auth.provider.js';
import { SESSION_PROVIDER } from './session-provider.js';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [{ provide: SESSION_PROVIDER, useClass: BetterAuthSessionProvider }],
  // Only the token is exported, because the token is all anyone injects. Exporting
  // the class as well is a startup error in Nest — a module may only re-export
  // something it actually provides, and `useClass` registers the class *as* the
  // token rather than as itself.
  exports: [SESSION_PROVIDER],
})
export class AuthModule {}
