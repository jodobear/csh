import { NostrClientTransport } from "@contextvm/sdk";
import type { Filter } from "nostr-tools";

const DEFAULT_RESPONSE_LOOKBACK_SECONDS = 300;

export class SkewTolerantNostrClientTransport extends NostrClientTransport {
  constructor(
    options: ConstructorParameters<typeof NostrClientTransport>[0],
    private readonly responseLookbackSeconds = DEFAULT_RESPONSE_LOOKBACK_SECONDS,
  ) {
    super(options);
  }

  protected override createSubscriptionFilters(
    targetPubkey: string,
    additionalFilters: Partial<Filter> = {},
  ): Filter[] {
    const filters = super.createSubscriptionFilters(targetPubkey, additionalFilters);

    return filters.map((filter) => ({
      ...filter,
      // The upstream SDK subscribes from "now", which drops valid responses when
      // the client clock is ahead of the server or relay. Use a bounded lookback.
      since: Math.floor(Date.now() / 1000) - this.responseLookbackSeconds,
    }));
  }
}
