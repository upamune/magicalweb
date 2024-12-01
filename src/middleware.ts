import { defineMiddleware, sequence } from 'astro:middleware';
import { RedirectMap } from './utils/redirectMap';

export const onRequest = defineMiddleware((context, next) => {
    const url = context.url;
    const pathname = url.pathname;
    const redirectMap = RedirectMap.getInstance();
  
    if (redirectMap.hasRedirect(pathname)) {
      const rule = redirectMap.getRedirect(pathname);
      if (rule) {
        return context.redirect(rule.destination, rule.permanent ? 301 : 302);
      }
    }
    return next();
});
