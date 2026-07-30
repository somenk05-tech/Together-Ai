import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { VerificationService } from './verification.service';
import { VerificationCodeService } from './verification-code.service';
import { RecoveryService } from './recovery.service';
import { JwtStrategy } from './jwt.strategy';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [PassportModule, JwtModule.register({}), MailModule],
  controllers: [AuthController],
  providers: [AuthService, TokenService, VerificationService, VerificationCodeService, RecoveryService, JwtStrategy],
  exports: [TokenService, JwtModule],
})
export class AuthModule {}
