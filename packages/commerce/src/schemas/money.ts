import { z } from 'zod';

export const Money = z
  .object({
    amount: z.number().nonnegative(),
    currency: z.string().length(3),
  })
  .strict();
export type Money = z.infer<typeof Money>;
