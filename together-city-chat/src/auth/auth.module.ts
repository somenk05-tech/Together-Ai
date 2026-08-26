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

@Module({
  imports: [PassportModule, JwtModule.register({}), MailModule],
  controllers: [AuthController],
  providers: [AuthService, TokenService, VerificationCodeService, JwtStrategy, TurnstileService],
  exports: [TokenService, JwtModule],
})
export class AuthModule {}
