import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { contactSchema, LIMITS } from '@pepperedapron/core';
import type { RouteCtx } from '../app';
import { analyticsEvents, contactMessages, userSettings } from '../db/schema';
import { eq } from 'drizzle-orm';
import { parse } from '../lib/validate';
import { importFromUrl } from '../services/importer';

/** Allow-list of analytics events: nothing else is stored. */
export const ANALYTICS_EVENTS = [
  'app_open',
  'recipe_created',
  'recipe_viewed',
  'recipe_published',
  'favorite_added',
  'collection_created',
  'meal_planned',
  'shopping_generated',
  'shopping_item_checked',
  'import_url',
  'import_text',
  'import_image',
  'import_share_extension',
  'recipe_shared',
  'cook_mode_started',
  'cook_mode_finished',
  'timer_started',
  'search',
  'household_joined',
  'error_shown',
] as const;

export async function miscRoutes(
  app: FastifyInstance,
  { deps, requireAuth, optionalAuth }: RouteCtx,
) {
  app.get('/config', async () => {
    let ads: unknown = { enabled: false };
    try {
      ads = JSON.parse(deps.env.ADS_CONFIG);
    } catch {
      /* keep ads disabled on invalid config */
    }
    const web = deps.env.WEB_PUBLIC_URL.replace(/\/+$/, '');
    return {
      mediaBaseUrl: deps.storage.publicBaseUrl(),
      webBaseUrl: web,
      minAppVersion: deps.env.MIN_APP_VERSION,
      ads,
      legal: {
        privacy: `${web}/legal/privacy`,
        terms: `${web}/legal/terms`,
        notice: `${web}/legal/notice`,
      },
      stores: { ios: deps.env.APP_STORE_URL, android: deps.env.PLAY_STORE_URL },
    };
  });

  app.post(
    '/contact',
    { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } },
    async (req, reply) => {
      const viewer = await optionalAuth(req);
      const b = parse(contactSchema, req.body);
      await deps.db.insert(contactMessages).values({
        userId: viewer?.userId ?? null,
        email: b.email,
        subject: b.subject,
        message: b.message,
        platform: (req.headers['x-app-platform'] as string | undefined)?.slice(0, 20) ?? null,
        appVersion: (req.headers['x-app-version'] as string | undefined)?.slice(0, 20) ?? null,
      });
      reply.status(201);
      return { ok: true };
    },
  );

  app.post(
    '/import/url',
    { config: { rateLimit: { max: 30, timeWindow: '1 hour' } } },
    async (req) => {
      await requireAuth(req);
      const b = parse(
        z.object({ url: z.url({ protocol: /^https?$/ }).max(LIMITS.url) }).strict(),
        req.body,
      );
      return importFromUrl(deps.fetchUrl, b.url);
    },
  );

  app.post(
    '/analytics/events',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const a = await requireAuth(req);
      const b = parse(
        z
          .object({
            events: z
              .array(
                z
                  .object({
                    name: z.enum(ANALYTICS_EVENTS),
                    at: z.iso.datetime(),
                    props: z
                      .record(
                        z.string().max(40),
                        z.union([z.string().max(60), z.number(), z.boolean()]),
                      )
                      .optional(),
                  })
                  .strict(),
              )
              .min(1)
              .max(50),
          })
          .strict(),
        req.body,
      );
      // Stored only when the user opted in (setting synced from the app).
      const s = await deps.db.query.userSettings.findFirst({
        where: eq(userSettings.id, a.userId),
      });
      if ((s?.data as { analyticsConsent?: boolean } | undefined)?.analyticsConsent !== true) {
        reply.status(202);
        return { stored: 0 };
      }
      const platform = (req.headers['x-app-platform'] as string | undefined)?.slice(0, 20) ?? null;
      const appVersion = (req.headers['x-app-version'] as string | undefined)?.slice(0, 20) ?? null;
      await deps.db
        .insert(analyticsEvents)
        .values(
          b.events.map((e) => ({
            name: e.name,
            day: e.at.slice(0, 10),
            userId: a.userId,
            platform,
            appVersion,
            props: e.props && Object.keys(e.props).length <= 8 ? e.props : null,
          })),
        );
      reply.status(202);
      return { stored: b.events.length };
    },
  );
}
