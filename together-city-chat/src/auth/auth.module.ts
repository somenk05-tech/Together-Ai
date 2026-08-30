import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { VerificationCodeService } from './verification-code.service';
import { JwtStrategy } from './jwt.strategy';
import { MailModule } from '../mail/mail.module';
import { TurnstileService } from './turnstile.service';
import { MediaModule } from '../media/media.module';

@Module({
  /* MediaModule for StorageProvider alone: deleting an account has to take
     the citizen's post photographs out of the bucket, and the keys only exist
     until the rows are deleted — see AuthService.purgePostObjects. */
  imports: [PassportModule, JwtModule.register({}), MailModule, MediaModule],
  controllers: [AuthController],
  providers: [AuthService, TokenService, VerificationCodeService, JwtStrategy, TurnstileService],
  exports: [TokenService, JwtModule],
})
export class AuthModule {}
