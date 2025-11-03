import { z } from 'zod';

export const battleSchema = z.object({
  id: z.string().uuid(),
  systemId: z.number(),
  spaceType: z.enum(['kspace', 'jspace', 'pochven']),
  startTime: z.date(),
  endTime: z.date(),
  totalKills: z.number(),
  totalIskDestroyed: z.bigint(),
  zkillRelatedUrl: z.string().url(),
});

export type BattleRecord = z.infer<typeof battleSchema>;
