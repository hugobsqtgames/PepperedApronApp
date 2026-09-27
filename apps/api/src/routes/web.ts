import type { FastifyInstance, FastifyReply } from 'fastify';
import { and, eq, isNull } from 'drizzle-orm';
import { formatAmount, getUnit, unitLabel, type Ingredient, type Step } from '@pepperedapron/core';
import type { RouteCtx } from '../app';
import { AuthService } from '../auth/service';
import { list } from '../env';
import { shareLinks } from '../db/schema';
import { AppError } from '../lib/errors';
import { RecipeService, type FullRecipe } from '../services/recipes';
import { esc, page, pickLang, type WebLang } from '../web/layout';
import { legal } from '../web/legal';
import { WEB_T } from '../web/strings';

const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'none'; img-src https: http: data:; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

function html(reply: FastifyReply, body: string, status = 200) {
  return reply
    .status(status)
    .headers({
      ...SECURITY_HEADERS,
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    })
    .send(body);
}

export async function webRoutes(app: FastifyInstance, { deps }: RouteCtx) {
  const rs = new RecipeService(deps);
  const auth = new AuthService(deps);
  const stores = (t: Record<string, string>) =>
    `<div class="row"><a class="btn secondary" href="${esc(deps.env.APP_STORE_URL)}">${esc(t.getIos)}</a><a class="btn secondary" href="${esc(deps.env.PLAY_STORE_URL)}">${esc(t.getAndroid)}</a></div>`;

  const recipePage = (r: FullRecipe, lang: WebLang, appLink: string) => {
    const t = WEB_T[lang];
    let group: string | null = null;
    const ings = (r.ingredients as Ingredient[])
      .map((i) => {
        const head =
          i.group && i.group !== group ? `</ul><div class="group">${esc(i.group)}</div><ul>` : '';
        group = i.group;
        const amount = formatAmount(i, lang);
        const unit = getUnit(i.unit) ? unitLabel(i.unit, i.quantity, lang) : (i.unit ?? '');
        return `${head}<li>${amount ? `<b>${esc(amount)} ${esc(unit)}</b> ` : ''}${esc(i.name)}${i.note ? ` <span class="muted">(${esc(i.note)})</span>` : ''}</li>`;
      })
      .join('');
    const steps = (r.steps as Step[]).map((s) => `<li>${esc(s.text)}</li>`).join('');
    const meta = [
      r.totalMinutes ? `${r.totalMinutes} ${t.minutes}` : null,
      `${r.servings} ${t.servings}`,
    ]
      .filter(Boolean)
      .map((m) => `<span class="chip">${esc(m)}</span>`)
      .join('');
    return page({
      title: r.title,
      lang,
      description: r.description ?? undefined,
      image: r.photoUrl,
      appLink,
      body: `${r.photoUrl ? `<img class="hero" src="${esc(r.photoUrl)}" alt="">` : ''}<h1>${esc(r.title)}</h1>
<p class="muted">${esc(t.by)} ${esc(r.author.displayName)}</p><p>${meta}</p>${r.description ? `<p>${esc(r.description)}</p>` : ''}
<div class="row" style="margin:16px 0"><a class="btn" href="${esc(appLink)}">${esc(t.openApp)}</a></div>
<div class="card"><h2>${esc(t.ingredients)}</h2><ul>${ings}</ul></div><div class="card"><h2>${esc(t.steps)}</h2><ol>${steps}</ol></div>${stores(t)}`,
    });
  };

  const notFoundPage = (lang: WebLang) =>
    page({
      title: WEB_T[lang].notFound,
      lang,
      body: `<div class="card"><h1>${esc(WEB_T[lang].notFound)}</h1><p>${esc(WEB_T[lang].notFoundBody)}</p></div>${stores(WEB_T[lang])}`,
    });

  app.get('/r/:token', async (req, reply) => {
    const lang = pickLang(req.headers['accept-language']);
    const { token } = req.params as { token: string };
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return html(reply, notFoundPage(lang), 404);
    const link = await deps.db.query.shareLinks.findFirst({
      where: and(eq(shareLinks.token, token), isNull(shareLinks.revokedAt)),
    });
    const row = link ? await rs.getLive(deps.db, link.recipeId) : null;
    if (!row) return html(reply, notFoundPage(lang), 404);
    return html(
      reply,
      recipePage(await rs.full(deps.db, row), lang, `pepperedapron://share/${token}`),
    );
  });

  app.get('/p/:id', async (req, reply) => {
    const lang = pickLang(req.headers['accept-language']);
    const { id } = req.params as { id: string };
    const row = /^[0-9a-f-]{36}$/i.test(id) ? await rs.getLive(deps.db, id) : null;
    if (!row || row.visibility !== 'public') return html(reply, notFoundPage(lang), 404);
    return html(
      reply,
      recipePage(await rs.full(deps.db, row), lang, `pepperedapron://public/${id}`),
    );
  });

  app.get('/join/:code', async (req, reply) => {
    const lang = pickLang(req.headers['accept-language']);
    const t = WEB_T[lang];
    const code = String((req.params as { code: string }).code)
      .replace(/[^A-Z0-9]/gi, '')
      .slice(0, 12)
      .toUpperCase();
    return html(
      reply,
      page({
        title: t.joinTitle,
        lang,
        appLink: `pepperedapron://join/${code}`,
        body: `<div class="card"><h1>${esc(t.joinTitle)}</h1><p>${esc(t.joinBody)}</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${esc(code)}</p><a class="btn" href="pepperedapron://join/${esc(code)}">${esc(t.openApp)}</a></div>${stores(t)}`,
      }),
    );
  });

  // E-mail links. Verification is idempotent-safe: scanners pre-fetching the link just verify it.
  const tokenPage = async (
    reply: FastifyReply,
    lang: WebLang,
    fn: () => Promise<void>,
    okTitle: string,
    okBody: string,
  ) => {
    const t = WEB_T[lang];
    try {
      await fn();
      return html(
        reply,
        page({
          title: okTitle,
          lang,
          body: `<div class="card"><h1>${esc(okTitle)}</h1><p>${esc(okBody)}</p><a class="btn" href="pepperedapron://">${esc(t.openApp)}</a></div>`,
        }),
      );
    } catch (e) {
      if (!(e instanceof AppError)) throw e;
      return html(
        reply,
        page({
          title: t.linkInvalid,
          lang,
          body: `<div class="card"><h1>${esc(t.linkInvalid)}</h1><p>${esc(t.linkInvalidBody)}</p></div>`,
        }),
        400,
      );
    }
  };
  app.get('/auth/verify-email', async (req, reply) => {
    const lang = pickLang(req.headers['accept-language']);
    const token = String((req.query as { token?: string }).token ?? '');
    return tokenPage(
      reply,
      lang,
      () => auth.verifyEmail(token),
      WEB_T[lang].emailVerified,
      WEB_T[lang].emailVerifiedBody,
    );
  });
  app.get('/auth/confirm-email', async (req, reply) => {
    const lang = pickLang(req.headers['accept-language']);
    const token = String((req.query as { token?: string }).token ?? '');
    return tokenPage(
      reply,
      lang,
      () => auth.confirmEmailChange(token),
      WEB_T[lang].emailChanged,
      WEB_T[lang].emailVerifiedBody,
    );
  });
  // Password reset: GET only renders a form (no side effect), POST applies it.
  app.get('/auth/reset-password', async (req, reply) => {
    const lang = pickLang(req.headers['accept-language']);
    const t = WEB_T[lang];
    const token = String((req.query as { token?: string }).token ?? '').slice(0, 200);
    return html(
      reply,
      page({
        title: t.resetTitle,
        lang,
        appLink: `pepperedapron://reset-password?token=${encodeURIComponent(token)}`,
        body: `<div class="card"><h1>${esc(t.resetTitle)}</h1><form method="post" action="/auth/reset-password"><input type="hidden" name="token" value="${esc(token)}"><label>${esc(t.newPassword)}<input type="password" name="password" minlength="10" maxlength="128" required autocomplete="new-password"></label><button class="btn" type="submit">${esc(t.save)}</button></form></div>`,
      }),
    );
  });
  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string', bodyLimit: 4096 },
    (_req, body, done) => {
      done(null, Object.fromEntries(new URLSearchParams(String(body))));
    },
  );
  app.post(
    '/auth/reset-password',
    { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } },
    async (req, reply) => {
      const lang = pickLang(req.headers['accept-language']);
      const t = WEB_T[lang];
      const b = (req.body ?? {}) as { token?: string; password?: string };
      if (!b.password || b.password.length < 10 || b.password.length > 128) {
        return html(
          reply,
          page({
            title: t.resetTitle,
            lang,
            body: `<div class="card"><p>${esc(t.passwordTooShort)}</p></div>`,
          }),
          400,
        );
      }
      return tokenPage(
        reply,
        lang,
        () => auth.resetPassword(String(b.token ?? ''), b.password!),
        t.resetDone,
        '',
      );
    },
  );

  for (const kind of ['privacy', 'terms', 'notice'] as const) {
    app.get(`/legal/${kind}`, async (req, reply) => {
      const lang = pickLang(req.headers['accept-language']);
      const l = legal(kind, lang === 'fr' ? 'fr' : 'en', deps.env);
      return html(reply, page({ title: l.title, lang, body: l.html }));
    });
  }

  // Universal links (iOS) and App Links (Android).
  app.get('/.well-known/apple-app-site-association', async (_req, reply) => {
    reply.header('Content-Type', 'application/json');
    return {
      applinks: {
        details: [
          {
            appIDs: [`${deps.env.APPLE_TEAM_ID}.${deps.env.IOS_BUNDLE_ID}`],
            components: [{ '/': '/r/*' }, { '/': '/p/*' }, { '/': '/join/*' }, { '/': '/auth/*' }],
          },
        ],
      },
      webcredentials: { apps: [`${deps.env.APPLE_TEAM_ID}.${deps.env.IOS_BUNDLE_ID}`] },
    };
  });
  app.get('/.well-known/assetlinks.json', async () => [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: deps.env.ANDROID_PACKAGE,
        sha256_cert_fingerprints: list(deps.env.ANDROID_SHA256_CERT_FINGERPRINTS),
      },
    },
  ]);
}
