import { toErrorResponse } from '@/lib/api/errors';
import { checkIpRateLimit } from '@/lib/api/ip-rate-limit';
import { appEnv } from '@/lib/config/env';

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Atlaris API Docs</title>
    <style>
      html, body, #app {
        margin: 0;
        padding: 0;
        height: 100%;
      }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script
      src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.35.3/dist/browser/standalone.min.js"
      integrity="sha384-Zqadwwz76fe1YiVyCJ61XimHtA6HeUwqfkmqbWl43n0mE7pztnGiLNMHITuVuumS"
      crossorigin="anonymous"
      onerror="document.getElementById('app').textContent = 'Failed to load API docs UI.';"
    ></script>
    <script>
      (function init() {
        var target = document.getElementById('app');
        if (!target) return;

        if (window.Scalar && typeof window.Scalar.createApiReference === 'function') {
          window.Scalar.createApiReference('#app', {
            url: '/api/docs/openapi'
          });
        } else {
          target.textContent = 'API docs UI failed to initialize.';
        }
      })();
    </script>
  </body>
</html>`;

export const GET = async (request: Request) => {
  if (!appEnv.isDevelopment && !appEnv.isTest) {
    return new Response('Not Found', { status: 404 });
  }

  // IP-based rate limiting for unauthenticated endpoint
  try {
    checkIpRateLimit(request, 'docs');
  } catch (error) {
    return toErrorResponse(error);
  }

  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
    },
  });
};
