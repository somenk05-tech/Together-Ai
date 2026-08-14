import { Body, Controller, Get, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { MiraService } from './mira.service';
import { MiraRegistry } from './mira.registry';
import { greet } from './greeting';

/**
 * The largest seed either route will accept, and there is exactly one of it.
 *
 * `daySeed()` in the web package takes its hash modulo this number. It used to
 * appear here TWICE — ten million on the greeting, one million on the ask — and
 * the land script's gate read only the `z.coerce` spelling, so it compared the
 * greeting's bound against the web's, found them equal, and never saw the other
 * one. The result in production: every greeting returned 200 and every ask
 * returned 400, for every citizen whose day seed happened to exceed a million.
 *
 * A bound that is written down twice is a bound that will diverge. One constant,
 * both schemas, and the gate now asserts that no `seed:` line in this file
 * carries a numeric literal at all.
 */
export const SEED_MAX = 10_000_000;

export const AskSchema = z.object({
  text: z.string().min(1).max(2000),
  /** Their local hour, sent by the client — the server's clock is the wrong one. */
  hour: z.number().int().min(0).max(23).optional(),
  weeksKnown: z.number().int().min(0).max(520).optional(),
  dial: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
  distressLocked: z.boolean().optional(),
  recent: z.array(z.string().max(2000)).max(3).optional(),
  /**
   * Their IANA timezone, e.g. 'Asia/Kolkata'.
   *
   * Sent by the client for the same reason `hour` is — the server's clock is the
   * wrong one — and it cannot be derived from `hour`, because an offset guessed
   * from an hour rounds to the hour and is wrong by thirty minutes for every
   * citizen in India. Bounded and shape-checked like anything from a client;
   * it only ever reaches `Intl.DateTimeFormat`, which throws on nonsense, and
   * `clockTime` catches that and omits the clause rather than naming a wrong time.
   *
   * OPTIONAL, and that is the rule rather than a detail: a new field in a
   * request must not 400 a client that has not shipped yet.
   */
  tz: z.string().min(1).max(64).regex(/^[A-Za-z][\w+\-]*(?:\/[\w+\-]+)*$/, 'an IANA timezone').optional(),
  /** Session counter — picks the mood and which aside she reaches for. Sent by
   *  the client because the mood must hold across a conversation and the server
   *  keeps no session. Not security-relevant: it chooses a tone. */
  seed: z.number().int().min(0).max(SEED_MAX).optional(),
  /**
   * The options she offered last turn, handed back.
   *
   * This is the whole of her short-term memory, and it rides on the wire rather
   * than living on the server. Without it every turn starts from nothing, a
   * one-word reply goes back through the matcher that produced the question,
   * and she asks it again — which is exactly what production did.
   *
   * Bounded at three because she never offers more, and validated like anything
   * else that arrives from a client: it decides a navigation, so a path that did
   * not come from her would be an open redirect inside the app.
   */
  answering: z.array(z.object({
    label: z.string().min(1).max(80),
    path: z.string().min(1).max(200).regex(/^\/[\w\-/]*$/, 'an in-app path'),
  })).max(3).optional(),
  /**
   * The day's transcript, both voices, oldest first — the model's context.
   * Twelve turns is plenty of yesterday for a chat bubble; the thread itself
   * lives on the device and the server keeps no session. Optional, like every
   * field a client may not have shipped yet.
   */
  history: z.array(z.object({
    who: z.enum(['me', 'mira']),
    text: z.string().min(1).max(2000),
  })).max(12).optional(),
  /** Which tab is asking — friend (the companion) or city (the assistant).
   *  Optional: an older client is the assistant, which is what it shipped as. */
  mode: z.enum(['friend', 'city']).optional(),
  /** The in-app path they were standing on when they opened her, for the
   *  "ask about this page" door. Validated like `answering`'s paths: it
   *  reaches a prompt, not a redirect, but a client field is a client field. */
  page: z.string().min(1).max(200).regex(/^\/[\w\-/?=&.%]*$/, 'an in-app path').optional(),
});
export type AskDto = z.infer<typeof AskSchema>;

/**
 * One conversation, shown to her by the person it belongs to.
 *
 * The transcript arrives FROM THE CLIENT, and that is the scope mechanism
 * rather than a shortcut: the server never queries the chat tables for this,
 * so the only thing she can ever read is the window the citizen was looking
 * at when they pressed her mark. Bounded like everything from a client —
 * forty turns of a thousand characters is plenty of thread for a side panel.
 */
export const ConfideSchema = z.object({
  /** What they want from her about it. */
  ask: z.string().min(1).max(2000),
  /** The other person's display name, for the prompt only. */
  otherName: z.string().min(1).max(80).optional(),
  /** The visible window of the thread, oldest first, both voices. */
  transcript: z.array(z.object({
    who: z.enum(['me', 'them']),
    text: z.string().min(1).max(1000),
  })).max(40),
});
export type ConfideDto = z.infer<typeof ConfideSchema>;

/**
 * What she needs to say hello, and all of it comes from the CLIENT.
 *
 * The hour, the day, whether this is the first open of it — every one is a fact
 * about the citizen rather than about the server, and a server in another
 * timezone deciding it is not 3am for somebody is the class of bug
 * `MasterProfile.timeZone` exists to prevent.
 *
 * Coerced, because a query string is text. Bounded, because these choose a tone
 * and nothing else — the worst a bad value can do is make her cheerful at the
 * wrong hour, and it still may not be a number this route trusts.
 */
export const GreetSchema = z.object({
  hour: z.coerce.number().int().min(0).max(23),
  seed: z.coerce.number().int().min(0).max(SEED_MAX),
  weeksKnown: z.coerce.number().int().min(0).max(520).optional(),
  firstOfDay: z.coerce.boolean().optional(),
  dial: z.coerce.number().int().min(0).max(2).optional(),
  distressLocked: z.coerce.boolean().optional(),
  sessionsSinceFourthWall: z.coerce.number().int().min(0).max(10_000).optional(),
});
export type GreetDto = z.infer<typeof GreetSchema>;

@Controller('mira')
@UseGuards(JwtAuthGuard)
export class MiraController {
  constructor(private readonly mira: MiraService, private readonly registry: MiraRegistry) {}

  /**
   * What Mira can do, generated from the decorators.
   *
   * In the product because it is the honest answer to "what can she do?" — and
   * because a generated list is the only kind that stays true.
   */
  @Get('capabilities')
  capabilities() {
    return this.registry.all().map(({ id, intent, risk, path }) => ({ id, intent, risk, path }));
  }

  /**
   * Hello, and which Mira turned up.
   *
   * A GET rather than part of the ask, because it is what she says BEFORE
   * anybody has asked anything — and because it must be cheap: it runs on every
   * open of the thread and touches no hub, no database and no model. It is a
   * pure function of the numbers above.
   *
   * NOT a @Mira() capability. This is chrome, not something she does; putting
   * it in the manifest would mean the router could match "say hello" and route
   * a citizen's question into a greeting.
   */
  @Get('greeting')
  @UsePipes(new ZodValidationPipe(GreetSchema))
  greeting(@Query() q: GreetDto) {
    const g = greet({
      hour: q.hour,
      seed: q.seed,
      weeksKnown: q.weeksKnown ?? 0,
      firstOfDay: q.firstOfDay,
      dial: q.dial as 0 | 1 | 2 | undefined,
      lastSessionDistressed: q.distressLocked,
      sessionsSinceFourthWall: q.sessionsSinceFourthWall,
    });
    return { hello: g.hello, ask: g.ask, mood: g.mood, levity: g.level };
  }

  @Post('ask')
  @UsePipes(new ZodValidationPipe(AskSchema))
  ask(@CurrentUser() user: JwtUser, @Body() dto: AskDto) {
    return this.mira.ask(dto.text, {
      userId: user.sub,
      hour: dto.hour ?? 12,
      weeksKnown: dto.weeksKnown ?? 0,
      dial: dto.dial,
      distressLocked: dto.distressLocked,
      recent: dto.recent,
      tz: dto.tz,
      seed: dto.seed,
      answering: dto.answering,
      history: dto.history,
      mode: dto.mode,
      page: dto.page,
    });
  }

  /**
   * Thirty days of conversation for ₹999, from the city wallet.
   *
   * NOT a @Mira() capability and not reachable from the ask route — she still
   * cannot spend money. This is behind an explicit button that carries its
   * price on its face, and it uses the same unified payment rail as every
   * checkout in the city, so an empty wallet answers with the same sentence
   * everywhere. The capabilities, navigation and the greeting never touch the
   * meter; only model conversations are counted, and 200 of those are free.
   */
  @Post('subscribe')
  subscribe(@CurrentUser() user: JwtUser) {
    return this.mira.subscribe(user.sub);
  }

  /**
   * Mira reads ONE conversation — the one the citizen showed her.
   *
   * A separate route rather than a mode on `ask`, because the separation IS
   * the promise: this path never touches her memory, the chart, the router
   * or the executor, and keeping it out of `ask` makes that checkable by
   * reading one method instead of auditing every branch of the big one.
   */
  @Post('confide')
  @UsePipes(new ZodValidationPipe(ConfideSchema))
  confide(@CurrentUser() user: JwtUser, @Body() dto: ConfideDto) {
    return this.mira.confide(user.sub, {
      ask: dto.ask,
      otherName: dto.otherName,
      transcript: dto.transcript,
    });
  }
}
