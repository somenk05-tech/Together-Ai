import { Body, Controller, Post, UseGuards, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthService } from './auth.service';
import {
  ForgotDto,
  ForgotSchema,
  LoginDto,
  LoginSchema,
  RefreshDto,
  RefreshSchema,
  RegisterDto,
  RegisterSchema,
  ResetDto,
  ResetSchema,
} from './dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @UsePipes(new ZodValidationPipe(RegisterSchema))
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  @UsePipes(new ZodValidationPipe(LoginSchema))
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post('refresh')
  @UsePipes(new ZodValidationPipe(RefreshSchema))
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('forgot')
  @UsePipes(new ZodValidationPipe(ForgotSchema))
  forgot(@Body() dto: ForgotDto) {
    return this.auth.forgot(dto);
  }

  @Post('reset')
  @UsePipes(new ZodValidationPipe(ResetSchema))
  reset(@Body() dto: ResetDto) {
    return this.auth.reset(dto);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  logout(@CurrentUser() user: JwtUser) {
    return this.auth.logout(user.sub);
  }
}
