import { Controller, Get, Param } from '@nestjs/common';
import { BroadcastService } from './broadcast.service';

/**
 * ── A HUB SHOWS ITS OWN FILMS (owner, 17 Sep) ───────────────────────────────
 *
 * "Connect dating with dating site, health with health." The Dating landing
 * shows the Dating channel's latest videos, Health and Nutrition show the
 * Health channel's, and so on (broadcast/topics.ts). Any signed-in citizen may
 * read it, like the hub it sits on; it returns titles and links that are
 * already public on the platforms, and a Together TV post id only when that
 * post is public and playable.
 */
@Controller('hub-videos')
export class HubVideosController {
  constructor(private readonly desk: BroadcastService) {}

  @Get(':hub')
  shelf(@Param('hub') hub: string) {
    return this.desk.shelf(String(hub).slice(0, 40));
  }
}
