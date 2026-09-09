import { Controller, Get } from '@nestjs/common';
import { Public } from '../shared/public.decorator';
import { FeatureFlagGuard } from './feature-flag.guard';

/**
 * WHAT THE APP IS ALLOWED TO DRAW. (27 Aug.)
 *
 * The kill switches need no endpoint — a hub that is off says so by refusing,
 * and the browser finds out at the moment it asks. A VISIBILITY switch is the
 * opposite: nothing refuses anything, so the only way the app can know not to
 * draw a door is to be told. Hence one route, and only one thing on it.
 *
 * @Public, DELIBERATELY. The header renders before anybody signs in, so a door
 * hidden for everyone has to be hidden on the signed-out home page too — an
 * authed-only read would show the door to strangers and hide it from citizens,
 * which is the wrong way round. Nothing here is a secret: it is a list of at
 * most two words naming doors this site is currently not drawing, which any
 * visitor could establish by looking at the page.
 *
 * IT CANNOT BE USED TO ENUMERATE ANYTHING. The response names only keys the
 * source code already declares, never a citizen, a count, or a state of the
 * database beyond these two booleans.
 */
@Controller('visibility')
export class VisibilityController {
  constructor(private readonly flags: FeatureFlagGuard) {}

  /**
   * The doors currently switched off, by key. An empty array is the normal
   * answer and means "draw everything".
   *
   * Shaped as a list of what is OFF rather than a map of every key, so the
   * client's default when the request fails is the same as the default when
   * the list is empty: draw it. See useCitySwitches — a convenience must never
   * be the reason the header renders empty.
   */
  /**
   * `off` is the sectors; `offPages` is the ROOMS inside them (owner, 9 Sep) —
   * the numbered rail down the left of every hub, each entry its own switch.
   *
   * TWO LISTS, NOT ONE, because they name two different kinds of thing and a
   * client that flattened them would have to guess which: 'astrology' is a
   * sector and '/astrology/ask' is a path. Both are lists of what is OFF, for
   * the same reason as before — the client's default when the request fails is
   * then identical to its default when the list is empty: draw it.
   */
  @Public()
  @Get()
  async doors(): Promise<{ off: string[]; offPages: string[]; closedPages: string[] }> {
    const [snap, rooms] = await Promise.all([
      this.flags.visibilitySnapshot(),
      this.flags.roomSnapshot(),
    ]);
    return {
      off: snap.filter((s) => !s.visible).map((s) => s.key),
      offPages: rooms.filter((r) => !r.visible).map((r) => r.key),
      /**
       * ── AND THE ROOMS THAT ARE CLOSED (owner, 9 Sep) ────────────────────
       *
       * A THIRD list, not a flag on the second, because closed is not a
       * stronger kind of hidden: a hidden room still opens from a saved link,
       * and a closed one must not. The app needs to know BEFORE it renders,
       * or a citizen walks into a room that draws its furniture and then fills
       * with error cards as each request comes back 503.
       *
       * Public like the rest of this route, and for the same reason: the card
       * saying a room is closed has to appear for a signed-out visitor too.
       * It names only rooms the source code already declares.
       */
      closedPages: rooms.filter((r) => !r.open).map((r) => r.key),
    };
  }
}
