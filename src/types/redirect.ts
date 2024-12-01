import { z } from 'zod';

export const RedirectRuleSchema = z.object({
  source: z.string().startsWith('/'),
  destination: z.string().url(),
  permanent: z.boolean().default(false),
});

export const RedirectConfigSchema = z.object({
  redirects: z.array(RedirectRuleSchema),
});

export type RedirectRule = z.infer<typeof RedirectRuleSchema>;
export type RedirectConfig = z.infer<typeof RedirectConfigSchema>;
