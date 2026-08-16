import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { LocalServicesService } from './local-services.service';
import { categoriesByGroup } from './categories';
import { BUSINESS_TYPES } from './business-types';
import {
  BrowseSchema, type BrowseDto,
  CreateListingSchema, type CreateListingDto,
  UpdateListingSchema, type UpdateListingDto,
  SendServiceMessageSchema, type SendServiceMessageDto,
  EnquireSchema, type EnquireDto,
  SaveRegularSchema, type SaveRegularDto,
  PostOfferSchema, type PostOfferDto,
  PostReviewSchema, type PostReviewDto,
  RevealNameSchema, type RevealNameDto,
  ReplyReviewSchema, type ReplyReviewDto,
  ScanMenuSchema, type ScanMenuDto,
  SaveMenuSchema, type SaveMenuDto,
  SendMenuItemsSchema, type SendMenuItemsDto,
} from './dto/local-services.dto';

@Controller('services')
@UseGuards(JwtAuthGuard)
export class LocalServicesController {
  constructor(private readonly services: LocalServicesService) {}

  /** The vocabulary. Static, so the picker never waits on a query. */
  @Get('categories')
  categories() { return { groups: categoriesByGroup() }; }

  /**
   * The schema the whole hub is generated from.
   *
   * Served rather than bundled into the web app so that adding a trade is a
   * deploy of one file and not a coordinated release of two — and so the form
   * an owner fills in can never be a version behind the rules the server will
   * check it against.
   */
  @Get('business-types')
  businessTypes() { return { types: BUSINESS_TYPES }; }

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

  // Declared before ':id' for the same reason as the two above.
  @Get('slug/available')
  slugAvailable(@CurrentUser() _user: JwtUser, @Query('slug') slug: string) {
    return this.services.slugAvailable(slug ?? '');
  }

  @Get('offers/today')
  offersToday() { return this.services.offersToday(); }

  @Get('offers/mine/:listingId')
  myOffers(@CurrentUser() user: JwtUser, @Param('listingId') listingId: string) {
    return this.services.myOffers(user.sub, listingId);
  }

  @Post('reviews/:reviewId/reply')
  @UsePipes(new ZodValidationPipe(ReplyReviewSchema))
  replyToReview(@CurrentUser() user: JwtUser, @Param('reviewId') reviewId: string, @Body() dto: ReplyReviewDto) {
    return this.services.replyToReview(user.sub, reviewId, dto.reply);
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

  /**
   * SHOW MY NAME TO THIS BUSINESS — the asker's switch, and only theirs.
   *
   * A POST rather than a PATCH on the thread because it is one decision with
   * one meaning, and it is the only field on a ServiceEnquiry a client may
   * write. The service returns the thread so the screen redraws from the
   * server's answer rather than from what it hoped happened.
   */
  @Post('threads/:id/reveal')
  @UsePipes(new ZodValidationPipe(RevealNameSchema))
  reveal(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: RevealNameDto) {
    return this.services.setReveal(user.sub, id, dto.reveal);
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

  @Get(':id/menu')
  menu(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.services.menu(id, user.sub);
  }

  /** Proposes a draft. Nothing is stored — see the note on scanMenu. */
  @Post(':id/menu/scan')
  @UsePipes(new ZodValidationPipe(ScanMenuSchema))
  scanMenu(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: ScanMenuDto) {
    return this.services.scanMenu(user.sub, id, dto.image);
  }

  @Post(':id/menu')
  @UsePipes(new ZodValidationPipe(SaveMenuSchema))
  saveMenu(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: SaveMenuDto) {
    return this.services.saveMenu(user.sub, id, dto);
  }

  @Post(':id/menu/ask')
  @UsePipes(new ZodValidationPipe(SendMenuItemsSchema))
  askAboutMenu(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: SendMenuItemsDto) {
    return this.services.sendMenuItems(user.sub, id, dto.itemIds, dto.note);
  }

  @Get(':id/reviews')
  reviews(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.services.reviews(id, user.sub);
  }

  @Post(':id/reviews')
  @UsePipes(new ZodValidationPipe(PostReviewSchema))
  postReview(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: PostReviewDto) {
    return this.services.postReview(user.sub, id, dto.rating, dto.body);
  }

  @Delete(':id/reviews')
  removeReview(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.services.removeReview(user.sub, id);
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
