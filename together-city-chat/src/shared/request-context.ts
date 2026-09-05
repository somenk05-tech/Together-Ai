import { AsyncLocalStorage } from 'async_hooks';
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';

/**
 * ── WHO IS ASKING, FROM ANYWHERE IN THE CALL (4 Sep) ──────────────────────
 *
 * The daily model budget charged two Beauty routes, because those two
 * services happened to hold a reference to it and pass a userId down. The
 * other twenty-one model routes — the blood-report vision reads, Mira, the
 * CV reader, the menu scan — had no budget at all: the service that makes
 * the call did not know who it was for, and threading a userId through every
 * signature for one purpose is the change that never lands.
 *
 * So the request's identity is carried in an AsyncLocalStorage store instead,
 * set once by the interceptor below for the whole of a handler's async
 * continuation, and read by `AiService` at the one place the money actually
 * leaves — right before `messages.create`. A background job or a socket
 * frame has no store, reads `undefined`, and is charged to the global day
 * only. Nothing else should read this: identity for authorisation comes from
 * `@CurrentUser()`, not from here.
 */
/**
 * ── AND WHETHER THIS PARTICULAR PIECE OF WORK HAS BEEN PAID FOR (4 Sep) ───
 *
 * Owner: "there should be no cap for paid services for AI." The daily ceiling
 * exists because a FREE model call is unbounded — one scripted account at
 * twenty a minute is 28,800 vision calls a day and every one of them is ours
 * to pay for. A paid call is bounded twice over before this service sees it:
 * money changed hands, and the product's own ceiling limits what that money
 * bought (a ₹99 spoken consultation is five minutes, about ten turns). Adding
 * a third bound on top of those two only ever refuses a customer who paid.
 *
 * `paidWork` MEANS THIS UNIT OF WORK, NOT THIS CITIZEN. It is deliberately not
 * "is a paying user" — that would make one ₹99 purchase a bypass token for the
 * rest of the day. It is set by the service that has just taken the payment,
 * around the work that payment bought, and it lasts exactly as long as that
 * async continuation.
 *
 * THE INTERCEPTOR NEVER SETS IT. Nothing arriving from outside — no header, no
 * body field, no query parameter — can turn it on; only server code that has
 * settled a charge can, by calling `runAsPaidWork`. A flag a client can set is
 * not a flag, it is a free tier.
 */
export type RequestStore = { userId?: string; paidWork?: boolean };

const als = new AsyncLocalStorage<RequestStore>();

export function currentUserId(): string | undefined {
  return als.getStore()?.userId;
}

/** True while the work running right now has been paid for. See RequestStore. */
export function isPaidWork(): boolean {
  return als.getStore()?.paidWork === true;
}

/**
 * Run `fn` as work a citizen has paid for, keeping whoever is asking.
 *
 * Call it AROUND the work the payment bought, and only after the charge has
 * settled. It merges into the current store rather than replacing it, so the
 * citizen is still charged-to and still logged; only the refusal goes away.
 */
export function runAsPaidWork<T>(fn: () => T): T {
  return als.run({ ...(als.getStore() ?? {}), paidWork: true }, fn);
}

/** For tests and for the odd non-HTTP entry point that knows its citizen. */
export function runWithRequestStore<T>(store: RequestStore, fn: () => T): T {
  return als.run(store, fn);
}

@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<{ user?: { sub?: string } }>();
    const store: RequestStore = { userId: req?.user?.sub };
    // The handler runs when the observable is SUBSCRIBED, not when `handle()`
    // is called — so the subscription itself has to happen inside `run`, or
    // the store is gone by the time the first `await` in the handler resumes.
    return new Observable((subscriber) => {
      const sub = als.run(store, () => next.handle().subscribe(subscriber));
      return () => sub.unsubscribe();
    });
  }
}
