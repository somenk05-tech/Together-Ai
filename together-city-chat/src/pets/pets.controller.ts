import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards, UsePipes } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { PetsService } from './pets.service';

/**
 * THE PET DISTRICT'S ROUTES.
 *
 * Every one of them is the caller's own animal. There is no route here that
 * takes somebody else's id, and no route that lists anybody but the citizen who
 * asked — a pet's weight, its medication and the photographs of the room it
 * lives in are nobody else's business.
 *
 * ROUTE ORDER MATTERS AND IS DELIBERATE. `photos/presign` and `photos/:id` are
 * declared before `:id`, so that the word "photos" is never read as a pet's
 * identifier. Nothing today would collide — the pet routes and the photo routes
 * differ by method as well as by shape — but the collision is one careless
 * `@Get(':id/…')` away, and the habit is what stops it.
 */

/** The species the hub can actually plan for. Birds, rabbits, guinea pigs and
 *  fish are named in its UI as not yet built and are refused here rather than
 *  accepted and then not served: a rabbit is a hindgut fermenter, not a small
 *  dog, and a stored rabbit the planner cannot feed is a promise we broke. */
const SPECIES = z.enum(['dog', 'cat']);

/** The owner's own words, bounded. A list rather than a table because nothing
 *  joins on an allergy — see the note on the model. */
const WORDS = z.array(z.string().trim().min(1).max(80)).max(30);

/**
 * THE MEDICAL RECORD — the nine boxes a vet asks for at the door.
 *
 * Named keys, bounded answers, and zod strips anything else before it reaches
 * the database. This is not validation for its own sake: an open object here is
 * an open object in a column that the whole application has promised never to
 * interpret, and the way to keep that promise is to know exactly what is in it.
 *
 * NOTHING READS THESE. Not the planner, not the shelf, not a recommendation.
 * The hub says so on the card; the service says so in its own header.
 */
const NOTE = z.string().max(2000);
const MedicalSchema = z.object({
  conditions: NOTE, medications: NOTE, vetName: NOTE, vetPhone: NOTE,
  microchipId: NOTE, insurer: NOTE, policyNumber: NOTE, bloodGroup: NOTE, notes: NOTE,
}).partial();

/** A date that exists. `dob` is the only date on a pet, and every age in the
 *  district is derived from it — so a February 31st here is a wrong age
 *  everywhere, silently, forever. */
const DOB = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'a YYYY-MM-DD date')
  .refine((d) => {
    const [y, m, day] = d.split('-').map(Number);
    const at = new Date(Date.UTC(y, m - 1, day));
    return at.getUTCFullYear() === y && at.getUTCMonth() === m - 1 && at.getUTCDate() === day;
  }, 'a date that exists');

const PetFields = z.object({
  name: z.string().trim().min(1).max(60),
  species: SPECIES,
  breed: z.string().trim().max(80),
  dob: DOB.nullable(),
  /* Forty years in months, with room to spare — a bound rather than a fact
     about lifespans. It is here to refuse a typo, not to judge a tortoise. */
  ageMonths: z.number().int().min(0).max(480).nullable(),
  sex: z.enum(['male', 'female']).nullable(),
  /* A 200kg dog is a typo and a 0kg dog is a missing measurement, which is what
     `null` is for. The planner reads these straight into a calorie equation. */
  weightKg: z.number().positive().max(200).nullable(),
  targetWeightKg: z.number().positive().max(200).nullable(),
  bodyCondition: z.enum(['under', 'ideal', 'over']),
  activity: z.enum(['low', 'moderate', 'high']),
  housing: z.enum(['indoor', 'outdoor', 'both']),
  sterilised: z.boolean().nullable(),
  allergies: WORDS,
  sensitivities: WORDS,
  restrictions: WORDS,
  currentFood: z.string().trim().max(200),
  dietStyle: z.enum(['commercial', 'home-cooked', 'mixed']),
  goal: z.enum(['maintain', 'weight-loss', 'weight-gain', 'growth', 'senior', 'wellness']),
  healthNotes: z.string().max(2000),
  medical: MedicalSchema,
  /* The drawn fallback's identifier, not an image and not a URL. Short on
     purpose: anything longer than this is somebody trying to store a picture
     in a text column. */
  portrait: z.string().max(120),
});

/** A create still goes through the partial shape: the form fills most of it in
 *  and the service insists on the two fields a card cannot be drawn without. */
export const CreatePetSchema = PetFields.partial();
export const UpdatePetSchema = PetFields.partial();

export const PresignPhotoSchema = z.object({
  mimeType: z.string().min(1).max(120),
  sizeBytes: z.number().int().positive(),
});
export const AddPhotoSchema = z.object({
  fileKey: z.string().min(1).max(300),
  mimeType: z.string().max(120).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
});

@Controller('pets')
@UseGuards(JwtAuthGuard)
export class PetsController {
  constructor(private readonly pets: PetsService) {}

  @Get()
  list(@CurrentUser() user: JwtUser) {
    return this.pets.list(user.sub);
  }

  @Post()
  @UsePipes(new ZodValidationPipe(CreatePetSchema))
  create(@CurrentUser() user: JwtUser, @Body() dto: z.infer<typeof CreatePetSchema>) {
    return this.pets.create(user.sub, dto);
  }

  @Post('photos/presign')
  @UsePipes(new ZodValidationPipe(PresignPhotoSchema))
  presignPhoto(@CurrentUser() user: JwtUser, @Body() dto: z.infer<typeof PresignPhotoSchema>) {
    return this.pets.presignPhoto(user.sub, dto.mimeType, dto.sizeBytes);
  }

  /** Reordering is one call, not a sort order the browser sends back — see the
   *  service: the whole gallery is renumbered so two photos cannot tie. */
  @Post('photos/:photoId/first')
  makeMainPhoto(@CurrentUser() user: JwtUser, @Param('photoId') photoId: string) {
    return this.pets.makeMainPhoto(user.sub, photoId);
  }

  @Delete('photos/:photoId')
  removePhoto(@CurrentUser() user: JwtUser, @Param('photoId') photoId: string) {
    return this.pets.removePhoto(user.sub, photoId);
  }

  @Get(':id')
  one(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.pets.one(user.sub, id);
  }

  @Patch(':id')
  @UsePipes(new ZodValidationPipe(UpdatePetSchema))
  update(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: z.infer<typeof UpdatePetSchema>) {
    return this.pets.update(user.sub, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.pets.remove(user.sub, id);
  }

  @Post(':id/photos')
  @UsePipes(new ZodValidationPipe(AddPhotoSchema))
  addPhoto(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: z.infer<typeof AddPhotoSchema>) {
    return this.pets.addPhoto(user.sub, id, dto);
  }
}
