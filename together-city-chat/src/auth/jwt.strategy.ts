import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtUser } from '../shared/types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    const secret = config.get<string>('jwt.accessSecret') ?? 'dev-access';
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
      // Tolerate small clock drift so a freshly-issued token is never rejected
      // as "expired" because the container clock is a few seconds ahead.
      jsonWebTokenOptions: { clockTolerance: 30 },
    });
    // Boot marker: confirms the verification secret in use (length + whether it's
    // still the insecure default) without ever leaking the secret itself.
    new Logger('JwtStrategy').log(`verify secret len=${secret.length} default=${secret === 'dev-access'}`);
  }

  // Whatever this returns is attached to req.user.
  validate(payload: JwtUser): JwtUser {
    return { sub: payload.sub, handle: payload.handle };
  }
}
