import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Protects REST routes. Requires a valid access token in the Authorization header. */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
