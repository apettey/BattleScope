import type { KillmailFeedItem, RulesetRecord, SecurityType } from '@battlescope/database';

export interface FilterOptions {
  ruleset: RulesetRecord;
  enforceTracked: boolean;
  securityTypes?: readonly SecurityType[];
}

/**
 * Applies filtering to killmail feed items.
 * This is business logic that determines which killmails should be shown to users.
 */
export class RulesetFilter {
  private static calculateParticipantCount(item: KillmailFeedItem): number {
    const victimCount = item.victimCharacterId ? 1 : 0;
    const attackerCount = item.attackerCharacterIds.length;
    const total = victimCount + attackerCount;
    return total > 0 ? total : 1;
  }

  /**
   * Check if a killmail matches security type filter
   */
  private static matchesSecurityType(
    item: KillmailFeedItem,
    securityTypes?: readonly SecurityType[],
  ): boolean {
    if (!securityTypes || securityTypes.length === 0) {
      return true;
    }
    return securityTypes.includes(item.securityType);
  }

  /**
   * Check if a killmail matches the ruleset criteria
   */
  static matches(item: KillmailFeedItem, ruleset: RulesetRecord, enforceTracked: boolean): boolean {
    // Check minimum pilots threshold
    if (ruleset.minPilots > item.participantCount) {
      return false;
    }

    // Build sets of tracked IDs for efficient lookup
    const allianceSet = new Set(ruleset.trackedAllianceIds.map((id) => id.toString()));
    const corpSet = new Set(ruleset.trackedCorpIds.map((id) => id.toString()));

    // If no tracking lists are configured, accept all (unless enforceTracked is true)
    const hasTrackingLists = allianceSet.size > 0 || corpSet.size > 0;
    const requireTracked = enforceTracked || (ruleset.ignoreUnlisted && hasTrackingLists);

    if (!requireTracked) {
      return true;
    }

    // Check if any entity in the killmail is tracked
    const allianceMatch =
      (item.victimAllianceId && allianceSet.has(item.victimAllianceId.toString())) ||
      item.attackerAllianceIds.some((id) => allianceSet.has(id.toString()));

    const corpMatch =
      (item.victimCorpId && corpSet.has(item.victimCorpId.toString())) ||
      item.attackerCorpIds.some((id) => corpSet.has(id.toString()));

    return allianceMatch || corpMatch;
  }

  /**
   * Filter an array of killmails based on ruleset criteria
   */
  static filter(
    items: KillmailFeedItem[],
    ruleset: RulesetRecord,
    enforceTracked: boolean,
  ): KillmailFeedItem[] {
    return items.filter((item) => this.matches(item, ruleset, enforceTracked));
  }

  /**
   * Filter an array of killmails based on all criteria (security type + ruleset)
   */
  static filterAll(items: KillmailFeedItem[], options: FilterOptions): KillmailFeedItem[] {
    return items.filter((item) => {
      if (!this.matchesSecurityType(item, options.securityTypes)) {
        return false;
      }
      return this.matches(item, options.ruleset, options.enforceTracked);
    });
  }
}
