/** JWT payload carried on both HTTP requests and socket handshakes. */
export interface JwtUser {
  sub: string; // user id
  handle: string;
}

/** Result of an authenticated request. */
export interface AuthedRequest {
  user: JwtUser;
}
