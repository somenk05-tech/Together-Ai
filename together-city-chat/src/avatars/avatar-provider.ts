import { Injectable, Logger } from '@nestjs/common';
import { describeInputs, type AvatarInputs } from './avatar-inputs';
import { renderAvatarSvg } from './avatar-render';

export interface AvatarResult {
  body: Buffer;
  contentType: string;
  ext: string;
  /** 'ai' when a generation model drew it; 'deterministic' when a function did. */
  generatedBy: 'ai' | 'deterministic';
  /** How long the citizen should expect to wait. Zero when it is already done. */
  queuedMs: number;
}

/**
 * The seam a real generation model plugs into.
 *
 * Deliberately narrow: choices in, bytes out. Everything a provider might need
 * to be told is already a sentence (`describeInputs`), and everything the rest
 * of the app needs to know afterwards is in the result — including which kind
 * of thing produced it, which is the field that must never be guessed.
 */
export abstract class AvatarProvider {
  abstract readonly name: string;
  abstract generate(inputs: AvatarInputs): Promise<AvatarResult>;
}

/**
 * The provider that ships today.
 *
 * It draws the portrait from the citizen's catalogue choices with no model
 * involved, which is not a placeholder — it is a real avatar a real person can
 * use, immediately, at no cost, with no generation queue and nothing to
 * moderate. What it is not is AI, and it says so: `generatedBy` is
 * 'deterministic' from here all the way to the API response, so no screen can
 * imply a model drew this.
 *
 * Swapping in a hosted model later means one new class and one provider binding.
 * Nothing else in the feature knows the difference — which is the point of
 * having the seam before having the budget.
 */
@Injectable()
export class DeterministicAvatarProvider extends AvatarProvider {
  readonly name = 'deterministic-svg';
  private readonly logger = new Logger(DeterministicAvatarProvider.name);

  async generate(inputs: AvatarInputs): Promise<AvatarResult> {
    // The prompt is built even though nothing consumes it, so the day a model
    // arrives the wording has already been exercised rather than written blind.
    this.logger.debug(`rendering: ${describeInputs(inputs)}`);
    const svg = renderAvatarSvg(inputs);
    return {
      body: Buffer.from(svg, 'utf8'),
      contentType: 'image/svg+xml',
      ext: 'svg',
      generatedBy: 'deterministic',
      queuedMs: 0,
    };
  }
}
