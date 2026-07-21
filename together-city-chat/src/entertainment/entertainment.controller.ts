import { Body, Controller, Get, Param, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { EntertainmentService } from './entertainment.service';
import { TmdbService } from './tmdb.service';
import { BookTicketSchema, type BookTicketDto, EventQuerySchema, type EventQueryDto } from './dto/entertainment.dto';

@Controller('entertainment')
@UseGuards(JwtAuthGuard)
export class EntertainmentController {
  constructor(
    private readonly entertainment: EntertainmentService,
    private readonly tmdb: TmdbService,
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
  discover(@Query('genre') genre?: string, @Query('lang') lang?: string, @Query('sort') sort?: string) {
    return this.tmdb.discover(genre, lang, sort);
  }

  @Get('curated-movies')
  curatedMovies() {
    return this.tmdb.curated();
  }

  @Get('person/:id')
  person(@Param('id') id: string) {
    return this.tmdb.person(id);
  }

  @Get('events')
  @UsePipes(new ZodValidationPipe(EventQuerySchema))
  events(@Query() query: EventQueryDto) {
    return this.entertainment.events(query);
  }

  @Get('events/:id')
  detail(@Param('id') id: string) {
    return this.entertainment.detail(id);
  }

  @Post('events/:id/book')
  @UsePipes(new ZodValidationPipe(BookTicketSchema))
  book(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: BookTicketDto) {
    return this.entertainment.book(user.sub, id, dto);
  }

  @Get('tickets')
  tickets(@CurrentUser() user: JwtUser) {
    return this.entertainment.myTickets(user.sub);
  }
}
