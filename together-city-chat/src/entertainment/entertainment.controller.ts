import { Body, Controller, Get, Param, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { EntertainmentService } from './entertainment.service';
import { TmdbService } from './tmdb.service';
import { WatchmodeService } from './watchmode.service';
import { SaveWatchSchema, type SaveWatchDto } from './dto/entertainment.dto';
import { Delete } from '@nestjs/common';

import { Mira } from '../mira/mira.decorator';
@Controller('entertainment')
@UseGuards(JwtAuthGuard)
export class EntertainmentController {
  constructor(
    private readonly entertainment: EntertainmentService,
    private readonly tmdb: TmdbService,
    private readonly watchmode: WatchmodeService,
  ) {}

  @Get('categories')
  categories() {
    return this.entertainment.categories();
  }

  // ── live movie & OTT data (TMDB proxy — key stays server-side) ──
  @Get('movies')
  movies() {
    return this.tmdb.movies();
  }

  @Get('movies/:id')
  movie(@Param('id') id: string) {
    return this.tmdb.movieDetail(id);
  }

  @Get('tv/:id')
  tv(@Param('id') id: string) {
    return this.tmdb.tvDetail(id);
  }

  @Get('ott')
  ott() {
    return this.tmdb.ott();
  }

  @Get('search')
  search(@Query('q') q: string) {
    return this.tmdb.search(q ?? '');
  }

  @Get('discover')
  discover(@Query('genre') genre?: string, @Query('lang') lang?: string, @Query('sort') sort?: string, @Query('type') type?: string) {
    return this.tmdb.discover(genre, lang, sort, type === 'tv' ? 'tv' : 'movie');
  }

  @Get('curated-movies')
  curatedMovies() {
    return this.tmdb.curated();
  }

  // "Watch at Together City" — every Indian streaming source with deep links.
  @Get('sources/:type/:id')
  streamSources(@Param('type') type: string, @Param('id') id: string) {
    return this.watchmode.sources(type === 'tv' ? 'tv' : 'movie', id);
  }

  // Full-catalogue paging — 100 titles per page until the database ends.
  @Get('browse')
  browse(@Query('type') type?: string, @Query('page') page?: string, @Query('genre') genre?: string, @Query('lang') lang?: string) {
    return this.tmdb.browse(type === 'tv' ? 'tv' : 'movie', Number(page) || 1, genre, lang);
  }

  // ── personal Watchlist (saved movies & series, synced across devices) ──
  @Mira({
    intent: 'List what the citizen saved to watch',
    utterances: ['my watchlist', 'what should I watch', 'what did I save to watch'],
    risk: 'R0',
  })
  @Get('watchlist')
  watchlist(@CurrentUser() user: JwtUser) {
    return this.entertainment.watchlist(user.sub);
  }

  @Post('watchlist')
  @UsePipes(new ZodValidationPipe(SaveWatchSchema))
  saveWatch(@CurrentUser() user: JwtUser, @Body() dto: SaveWatchDto) {
    return this.entertainment.addToWatchlist(user.sub, dto);
  }

  @Delete('watchlist/:type/:id')
  removeWatch(@CurrentUser() user: JwtUser, @Param('type') type: string, @Param('id') id: string) {
    return this.entertainment.removeFromWatchlist(user.sub, type, id);
  }

  // AI picks learned from the Watchlist (genres, languages, saved titles).
  @Get('recommended')
  async recommended(@CurrentUser() user: JwtUser) {
    const { items } = await this.entertainment.watchlist(user.sub);
    return this.tmdb.recommendedFor(items);
  }

  @Get('person/:id')
  person(@Param('id') id: string) {
    return this.tmdb.person(id);
  }

}
