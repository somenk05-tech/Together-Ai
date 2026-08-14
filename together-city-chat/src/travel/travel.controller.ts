import { Body, Controller, Get, Param, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { TravelService } from './travel.service';
import { Mira } from '../mira/mira.decorator';
import {
  PackageQuerySchema, type PackageQueryDto,
  BookPackageSchema, type BookPackageDto,
  FlightSearchSchema, type FlightSearchDto,
  BookFlightSchema, type BookFlightDto,
} from './dto/travel.dto';

@Controller('travel')
@UseGuards(JwtAuthGuard)
export class TravelController {
  constructor(private readonly travel: TravelService) {}

  @Get('categories')
  categories() { return this.travel.categories(); }

  @Get('packages')
  @UsePipes(new ZodValidationPipe(PackageQuerySchema))
  packages(@Query() query: PackageQueryDto) { return this.travel.packages(query); }

  @Get('packages/:id')
  packageDetail(@Param('id') id: string) { return this.travel.packageDetail(id); }

  @Post('packages/:id/book')
  @UsePipes(new ZodValidationPipe(BookPackageSchema))
  bookPackage(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: BookPackageDto) {
    return this.travel.bookPackage(user.sub, id, dto);
  }

  // ── flights ──
  @Get('airports')
  airports() { return this.travel.airports(); }

  @Get('flights/search')
  @UsePipes(new ZodValidationPipe(FlightSearchSchema))
  flightSearch(@Query() query: FlightSearchDto) { return this.travel.flightSearch(query); }

  @Post('flights/book')
  @UsePipes(new ZodValidationPipe(BookFlightSchema))
  bookFlight(@CurrentUser() user: JwtUser, @Body() dto: BookFlightDto) {
    return this.travel.bookFlight(user.sub, dto);
  }

  @Mira({
    intent: 'List the citizen’s trips',
    utterances: ['my trips', 'am I travelling', 'my travel plans', 'where am I going'],
    risk: 'R0',
  })
  @Get('trips')
  trips(@CurrentUser() user: JwtUser) { return this.travel.myTrips(user.sub); }
}
