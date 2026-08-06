import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { LocalServicesService } from './local-services.service';
import { categoriesByGroup } from './categories';
import {
  BrowseSchema, type BrowseDto,
  CreateListingSchema, type CreateListingDto,
  UpdateListingSchema, type UpdateListingDto,
  SendServiceMessageSchema, type SendServiceMessageDto,
  EnquireSchema, type EnquireDto,
  SaveRegularSchema, type SaveRegularDto,
  PostOfferSchema, type PostOfferDto,
} from './dto/local-services.dto';

@Controller('services')
@UseGuards(JwtAuthGuard)
export class LocalServicesController {
  constructor(private readonly services: LocalServicesService) {}

  /** The vocabulary. Static, so the picker never waits on a query. */
  @Get('categories')
  categories() { return { groups: categoriesByGroup() }; }

  @Get('facets')
  facets(@Query('city') city?: string) { return this.services.facets(city); }

  @Get()
  @UsePipes(new ZodValidationPipe(BrowseSchema))
  browse(@CurrentUser() user: JwtUser, @Query() query: BrowseDto) {
    return this.services.browse(query, user.sub);
  }

  // Declared BEFORE ':id' or React-Router-style path collisions bite on the
  // server too: "mine" would be read as a listing id and 404 from the database.
  @Get('mine')
  mine(@CurrentUser() user: JwtUser) { return this.services.mine(user.sub); }

  @Get('inbox')
  inbox(@CurrentUser() user: JwtUser) { return this.services.inbox(user.sub); }

  // Both declared before ':id' — "regulars" and "offers" are not listing ids,
  // and a router that reads them as one 404s from the database instead.
  @Get('regulars')
  regulars(@CurrentUser() user: JwtUser) { return this.services.regulars(user.sub); }

  @Get('offers/today')
  offersToday() { return this.services.offersToday(); }

  @Get('offers/mine/:listingId')
  myOffers(@CurrentUser() user: JwtUser, @Param('listingId') listingId: string) {
    return this.services.myOffers(user.sub, listingId);
  }

  @Delete('offers/:offerId')
  removeOffer(@CurrentUser() user: JwtUser, @Param('offerId') offerId: string) {
    return this.services.removeOffer(user.sub, offerId);
  }

  @Get('threads/:id')
  thread(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.services.messages(user.sub, id);
  }

  @Post('threads/:id/messages')
  @UsePipes(new ZodValidationPipe(SendServiceMessageSchema))
  send(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: SendServiceMessageDto) {
    return this.services.post(user.sub, id, dto.body);
  }

  @Post('threads/:id/close')
  closeThread(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.services.closeThread(user.sub, id);
  }

  // The caller is taken even though the listing is public. Everything behind
  // JwtAuthGuard that reads by id gets it, so the one route that does not is
  // the one nobody notices when the rule changes — and this hub will want it
  // the moment a card needs to know whether you already have a thread open.
  @Get(':id')
  detail(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.services.detail(id, user.sub);
  }

  @Post()
  @UsePipes(new ZodValidationPipe(CreateListingSchema))
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateListingDto) {
    return this.services.create(user.sub, dto);
  }

  // PATCH and not PUT: UpdateListingSchema is a partial, and every other
  // edit-your-own-row route in this application is a PATCH.
  @Patch(':id')
  @UsePipes(new ZodValidationPipe(UpdateListingSchema))
  update(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: UpdateListingDto) {
    return this.services.update(user.sub, id, dto);
  }

  @Delete(':id')
  close(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.services.close(user.sub, id);
  }

  @Post(':id/regular')
  @UsePipes(new ZodValidationPipe(SaveRegularSchema))
  saveRegular(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: SaveRegularDto) {
    return this.services.saveRegular(user.sub, id, dto.note);
  }

  @Delete(':id/regular')
  forgetRegular(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.services.forgetRegular(user.sub, id);
  }

  @Post(':id/offers')
  @UsePipes(new ZodValidationPipe(PostOfferSchema))
  postOffer(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: PostOfferDto) {
    return this.services.postOffer(user.sub, id, dto);
  }

  @Post(':id/enquire')
  @UsePipes(new ZodValidationPipe(EnquireSchema))
  enquire(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: EnquireDto) {
    return this.services.enquire(user.sub, id, dto.message);
  }
}
