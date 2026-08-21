/**
 * OpenAPI 3.1 document for Vitae `/api/v1`. Built in code so contract tests can
 * regenerate and diff against the checked-in artifact.
 */
import type {
  OpenAPIObject,
  OperationObject,
  PathItemObject,
  PathsObject,
} from 'openapi3-ts/oas31';
import { SOURCE_TYPES } from '@vitae/core';
import { V1_MOUNT_PREFIXES } from './mounts.js';

const errorRef = { $ref: '#/components/schemas/Error' };

function errorResponse(description: string) {
  return {
    description,
    content: {
      'application/json': {
        schema: errorRef,
      },
    },
  };
}

const secured = [{ bearerAuth: [] }];

function op(
  operationId: string,
  summary: string,
  opts: {
    tags?: string[];
    security?: typeof secured | [];
    requestBody?: OperationObject['requestBody'];
    responses?: OperationObject['responses'];
    parameters?: OperationObject['parameters'];
  } = {},
): OperationObject {
  return {
    operationId,
    summary,
    tags: opts.tags,
    security: opts.security === undefined ? secured : opts.security,
    parameters: opts.parameters,
    requestBody: opts.requestBody,
    responses: {
      ...(opts.responses ?? {
        '200': { description: 'OK' },
      }),
      '401': errorResponse('Unauthorized (default-deny)'),
      default: errorResponse('Error'),
    },
  };
}

/** Minimal stub so every mount prefix has at least one documented path. */
function stubGet(path: string, operationId: string, summary: string, tag: string): PathsObject {
  return {
    [path]: {
      get: op(operationId, summary, { tags: [tag], responses: { '200': { description: 'OK' } } }),
    },
  };
}

function mergePaths(...parts: PathsObject[]): PathsObject {
  const out: PathsObject = {};
  for (const part of parts) {
    for (const [path, item] of Object.entries(part)) {
      const existing = out[path] as PathItemObject | undefined;
      out[path] = existing ? { ...existing, ...item } : item;
    }
  }
  return out;
}

function detailedPaths(): PathsObject {
  return {
    '/auth/dev-login': {
      post: op('authDevLogin', 'Developer sign-in (dev only)', {
        tags: ['auth'],
        security: [],
        responses: {
          '200': {
            description: 'Session token issued',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    token: { type: 'string' },
                    user: {
                      type: 'object',
                      properties: {
                        email: { type: 'string' },
                        via: { type: 'string', enum: ['dev', 'google'] },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }),
    },
    '/auth/logout': {
      post: op('authLogout', 'Clear the session cookie', {
        tags: ['auth'],
        security: [],
        responses: { '200': { description: 'Logged out' } },
      }),
    },
    '/auth/me': {
      get: op('authMe', 'Current user (null when anonymous)', {
        tags: ['auth'],
        security: [],
        responses: {
          '200': {
            description: 'Auth status',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    user: {
                      oneOf: [
                        { type: 'null' },
                        {
                          type: 'object',
                          properties: {
                            email: { type: 'string' },
                            via: { type: 'string' },
                          },
                        },
                      ],
                    },
                    self: { nullable: true },
                    devLoginEnabled: { type: 'boolean' },
                  },
                },
              },
            },
          },
        },
      }),
    },
    '/nodes': {
      get: op('listNodes', 'List nodes', {
        tags: ['nodes'],
        parameters: [
          { name: 'type', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } },
          { name: 'includeDeleted', in: 'query', schema: { type: 'boolean' } },
          { name: 'q', in: 'query', schema: { type: 'string' } },
        ],
      }),
      post: op('createNode', 'Create a typed node', {
        tags: ['nodes'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['type', 'title'],
                properties: {
                  type: { type: 'string' },
                  title: { type: 'string' },
                  props: { type: 'object', additionalProperties: true },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Created' },
          '422': errorResponse('Validation failed'),
        },
      }),
    },
    '/nodes/{id}': {
      get: op('getNode', 'Get a node with edges and owner', {
        tags: ['nodes'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Node detail' },
          '404': errorResponse('Not found'),
        },
      }),
      patch: op('patchNode', 'Update a node (writes a revision)', {
        tags: ['nodes'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Updated' },
          '404': errorResponse('Not found'),
          '422': errorResponse('Validation failed'),
        },
      }),
      delete: op('deleteNode', 'Soft-delete a node', {
        tags: ['nodes'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Soft-deleted' },
          '404': errorResponse('Not found'),
        },
      }),
    },
    '/nodes/{id}/restore': {
      post: op('restoreNode', 'Restore a soft-deleted node', {
        tags: ['nodes'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      }),
    },
    '/edges': {
      post: op('createEdge', 'Create a typed edge', {
        tags: ['edges'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['type', 'src', 'dst'],
                properties: {
                  type: { type: 'string' },
                  src: { type: 'string' },
                  dst: { type: 'string' },
                  props: { type: 'object', additionalProperties: true },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Created' },
          '422': errorResponse('Validation failed'),
        },
      }),
    },
    '/edges/{id}': {
      patch: op('patchEdge', 'Update an edge', {
        tags: ['edges'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      }),
      delete: op('deleteEdge', 'Soft-delete an edge', {
        tags: ['edges'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      }),
    },
    '/capture': {
      post: op('commitCapture', 'Commit a capture line into linked records', {
        tags: ['capture'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  raw: { type: 'string' },
                  lastViewedId: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Capture committed' },
          '400': errorResponse('Empty capture'),
        },
      }),
    },
    '/capture/preview': {
      post: op('previewCapture', 'Parse a capture line without writing', {
        tags: ['capture'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { raw: { type: 'string' } },
              },
            },
          },
        },
      }),
    },
    '/search': {
      get: op('search', 'Full-text + filter-grammar search', {
        tags: ['search'],
        parameters: [{ name: 'q', in: 'query', required: true, schema: { type: 'string' } }],
      }),
    },
    '/search/switch': {
      get: op('searchSwitch', 'Fuzzy quick-switcher results', {
        tags: ['search'],
        parameters: [{ name: 'q', in: 'query', schema: { type: 'string' } }],
      }),
    },
    '/retention/preview': {
      get: op('retentionPreview', 'What the next purge would remove', { tags: ['retention'] }),
    },
    '/retention/purge': {
      post: op('retentionPurge', 'Hard-delete expired trash', { tags: ['retention'] }),
    },
    '/export/manifest': {
      get: op('exportManifest', 'Export counts and checksums', {
        tags: ['export'],
        parameters: [{ name: 'includeSensitive', in: 'query', schema: { type: 'boolean' } }],
      }),
    },
    '/export': {
      post: op('exportBundle', 'Stream a JSONL ZIP backup', {
        tags: ['export'],
        responses: {
          '200': {
            description: 'ZIP archive',
            content: { 'application/zip': { schema: { type: 'string', format: 'binary' } } },
          },
        },
      }),
    },
    '/dashboard': {
      get: op('getDashboard', 'Today aggregate (focus, setup, insights)', { tags: ['dashboard'] }),
    },
    '/applications': {
      get: op('listApplications', 'Career application runway and attention summary', {
        tags: ['applications'],
        parameters: [
          {
            name: 'status',
            in: 'query',
            schema: {
              type: 'string',
              enum: [
                'draft',
                'applied',
                'screening',
                'interview',
                'offer',
                'rejected',
                'withdrawn',
                'accepted',
              ],
            },
          },
          { name: 'q', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            description: 'Application summaries, stage counts, and attention totals',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApplicationListResponse' },
              },
            },
          },
          '422': errorResponse('Unknown application status'),
        },
      }),
    },
    '/applications/{id}': {
      get: op('getApplicationDossier', 'Application dossier with linked career evidence', {
        tags: ['applications'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'Application dossier',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApplicationDetailResponse' },
              },
            },
          },
          '404': errorResponse('Application not found'),
        },
      }),
    },
  };
}

/** One GET stub per mount that is not already covered by detailedPaths. */
function stubPathsForMounts(): PathsObject {
  const detailed = new Set(Object.keys(detailedPaths()));
  const stubs: PathsObject[] = [];

  for (const prefix of V1_MOUNT_PREFIXES) {
    const covered = [...detailed].some(
      (p) => p === prefix || p.startsWith(`${prefix}/`) || p.startsWith(`${prefix}{`),
    );
    // `/people` is covered only if we have /people paths; favors is a different prefix.
    if (covered) continue;
    const tag = prefix.replace(/^\//, '').split('/')[0] ?? 'misc';
    const path = prefix.includes('{') ? prefix : prefix;
    // Prefer a collection GET on the mount root.
    if (detailed.has(path)) continue;
    stubs.push(
      stubGet(path, `stub${tag.charAt(0).toUpperCase()}${tag.slice(1)}`, `${prefix} mount`, tag),
    );
  }

  return mergePaths(...stubs);
}

export function buildOpenApiDocument(): OpenAPIObject {
  const paths = mergePaths(detailedPaths(), stubPathsForMounts());

  return {
    openapi: '3.1.0',
    info: {
      title: 'Vitae API',
      version: '1.0.0',
      description:
        'Private single-user life & career OS REST surface. All `/api/v1` routes are default-deny except auth helpers. Errors use `{ error: { code, message, details?, request_id } }`. Cookie session and Bearer JWT are equivalent.',
    },
    servers: [
      { url: 'http://localhost:4000/api/v1', description: 'Local API' },
      { url: 'http://localhost:4000', description: 'Local origin (for /health)' },
    ],
    tags: [
      { name: 'auth' },
      { name: 'nodes' },
      { name: 'edges' },
      { name: 'capture' },
      { name: 'search' },
      { name: 'retention' },
      { name: 'export' },
      { name: 'dashboard' },
      { name: 'applications' },
    ],
    paths: {
      ...paths,
      // Liveness lives outside /api/v1; documented against the origin server.
      '/health': {
        servers: [{ url: 'http://localhost:4000' }],
        get: {
          operationId: 'health',
          summary: 'Liveness probe',
          tags: ['ops'],
          security: [],
          responses: {
            '200': {
              description: 'Process is up',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['ok', 'service'],
                    properties: {
                      ok: { type: 'boolean' },
                      service: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description:
            'Owner session JWT from Google or POST /auth/dev-login. Cookie session is equivalent.',
        },
      },
      schemas: {
        ApplicationStatus: {
          type: 'string',
          enum: [
            'draft',
            'applied',
            'screening',
            'interview',
            'offer',
            'rejected',
            'withdrawn',
            'accepted',
          ],
        },
        ApplicationSummary: {
          type: 'object',
          required: [
            'id',
            'title',
            'role_title',
            'status',
            'interview_count',
            'notes_md',
            'source',
            'created_at',
            'updated_at',
          ],
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            role_title: { type: 'string' },
            status: { $ref: '#/components/schemas/ApplicationStatus' },
            organization: { type: ['object', 'null'], additionalProperties: true },
            referred_by: { type: ['object', 'null'], additionalProperties: true },
            applied_on: { type: ['string', 'null'], format: 'date' },
            deadline: { type: ['string', 'null'], format: 'date' },
            next_step: { type: ['string', 'null'] },
            next_step_date: { type: ['string', 'null'], format: 'date' },
            channel: { type: ['string', 'null'] },
            location_mode: { type: ['string', 'null'] },
            salary_range: { type: ['string', 'null'] },
            job_url: { type: ['string', 'null'] },
            target_id: { type: ['string', 'null'] },
            resume_id: { type: ['string', 'null'] },
            interview_count: { type: 'integer', minimum: 0 },
            next_interview: { type: ['object', 'null'], additionalProperties: true },
            attention: { type: ['object', 'null'], additionalProperties: true },
            notes_md: { type: 'string' },
            source: { type: 'string', enum: [...SOURCE_TYPES] },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        ApplicationListResponse: {
          type: 'object',
          required: ['applications', 'counts', 'total', 'active', 'needs_attention'],
          properties: {
            applications: {
              type: 'array',
              items: { $ref: '#/components/schemas/ApplicationSummary' },
            },
            counts: { type: 'object', additionalProperties: { type: 'integer', minimum: 0 } },
            total: { type: 'integer', minimum: 0 },
            active: { type: 'integer', minimum: 0 },
            needs_attention: { type: 'integer', minimum: 0 },
          },
        },
        ApplicationDossier: {
          allOf: [
            { $ref: '#/components/schemas/ApplicationSummary' },
            {
              type: 'object',
              required: ['posting', 'interviews', 'target', 'resume'],
              properties: {
                posting: { type: ['object', 'null'], additionalProperties: true },
                interviews: {
                  type: 'array',
                  items: { type: 'object', additionalProperties: true },
                },
                target: { type: ['object', 'null'], additionalProperties: true },
                resume: { type: ['object', 'null'], additionalProperties: true },
              },
            },
          ],
        },
        ApplicationDetailResponse: {
          type: 'object',
          required: ['application'],
          properties: {
            application: { $ref: '#/components/schemas/ApplicationDossier' },
          },
        },
        Error: {
          type: 'object',
          required: ['error'],
          properties: {
            error: {
              type: 'object',
              required: ['code', 'message'],
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
                details: {},
                request_id: { type: 'string' },
              },
            },
          },
        },
      },
    },
  };
}
