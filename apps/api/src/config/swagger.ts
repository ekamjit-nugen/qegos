/**
 * Swagger / OpenAPI Documentation Middleware
 *
 * Serves interactive API documentation via Swagger UI at /docs.
 * Reads the OpenAPI 3.1.0 spec from docs/openapi.yaml.
 *
 * Enabled in all environments (useful for staging QA and local dev).
 * In production, consider restricting access via reverse proxy or auth.
 */

import { type Express } from 'express';
import swaggerUi from 'swagger-ui-express';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parse as parseYaml } from 'yaml';

/**
 * Mount Swagger UI at /docs and serve the raw spec at /docs/openapi.json.
 */
export function mountSwaggerDocs(app: Express): void {
  try {
    // Resolve path relative to project root (docs/ is at repo root)
    const specPath = resolve(__dirname, '../../../../docs/openapi.yaml');
    const specContent = readFileSync(specPath, 'utf-8');
    const spec = parseYaml(specContent) as Record<string, unknown>;

    // Serve raw JSON spec
    app.get('/docs/openapi.json', (_req, res): void => {
      res.json(spec);
    });

    // Swagger UI options
    const swaggerOptions: swaggerUi.SwaggerUiOptions = {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'QEGOS API Documentation',
      customfavIcon: '',
      swaggerOptions: {
        persistAuthorization: true,
        docExpansion: 'list',
        filter: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
      },
    };

    // Mount Swagger UI at /docs
    app.use(
      '/docs',
      swaggerUi.serve,
      swaggerUi.setup(spec, swaggerOptions),
    );

    console.log('[swagger] API docs available at /docs'); // eslint-disable-line no-console
  } catch (err) {
    // Non-fatal: if spec is missing, just skip docs
    console.warn('[swagger] Could not load OpenAPI spec — docs endpoint disabled:', (err as Error).message); // eslint-disable-line no-console
  }
}
