import { Global, Module } from '@nestjs/common';
import { AdminService } from './admin';

/** Moderator authorisation, available to every hub without a circular import. */
@Global()
@Module({ providers: [AdminService], exports: [AdminService] })
export class AdminModule {}
