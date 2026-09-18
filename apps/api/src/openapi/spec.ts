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
import { APPLICATION_STATUSES, SOURCE_TYPES } from '@vitae/core';
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

const secured: NonNullable<OperationObject['security']> = [{ bearerAuth: [] }];

function op(
  operationId: string,
  summary: string,
  opts: {
    tags?: string[];
    security?: OperationObject['security'];
    includeUnauthorized?: boolean;
    requestBody?: OperationObject['requestBody'];
    responses?: OperationObject['responses'];
    parameters?: OperationObject['parameters'];
  } = {},
): OperationObject {
  const responses = opts.responses ?? { '200': { description: 'OK' } };
  return {
    operationId,
    summary,
    tags: opts.tags,
    security: opts.security === undefined ? secured : opts.security,
    parameters: opts.parameters,
    requestBody: opts.requestBody,
    responses: {
      ...responses,
      ...(opts.includeUnauthorized === false || Object.hasOwn(responses, '401')
        ? {}
        : { '401': errorResponse('Unauthorized (default-deny)') }),
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
    '/graph/discovery': {
      get: op('getGraphDiscovery', 'Analyze communities, bridges, and disconnected records across the live workspace', {
        tags: ['graph'],
        responses: {
          '200': {
            description: 'Community discovery overview',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/GraphDiscovery' } } },
          },
        },
      }),
    },
    '/graph/discovery/community/{communityId}': {
      get: op('getGraphCommunity', 'Read a page of community members and a bounded graph scene', {
        tags: ['graph'],
        parameters: [
          { name: 'communityId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'offset', in: 'query', schema: { type: 'integer', minimum: 0 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 250 } },
          { name: 'q', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Community detail' },
          '404': errorResponse('Community not found'),
        },
      }),
    },
    '/graph/discovery/connection': {
      get: op('getGraphCommunityConnection', 'Read the recorded relationships joining two communities', {
        tags: ['graph'],
        parameters: [
          { name: 'from', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'to', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'offset', in: 'query', schema: { type: 'integer', minimum: 0 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 250 } },
        ],
        responses: {
          '200': { description: 'Supporting relationships' },
          '400': errorResponse('Both community IDs are required'),
          '404': errorResponse('Community connection not found'),
        },
      }),
    },
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
    '/auth/bootstrap': {
      post: op('authBootstrap', 'Create or resume a private Cloud workspace', {
        tags: ['auth'],
        responses: {
          '200': {
            description: 'Existing Cloud workspace resumed',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/BootstrapResponse' },
              },
            },
          },
          '201': {
            description: 'Private Cloud workspace created',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/BootstrapResponse' },
              },
            },
          },
          '409': errorResponse('Cloud is disabled, enrollment is not ready, or identity ownership conflicts'),
        },
      }),
    },
    '/auth/me': {
      get: op('authMe', 'Current session and server-derived Cloud workspace', {
        tags: ['auth'],
        security: [],
        includeUnauthorized: false,
        responses: {
          '200': {
            description: 'Auth status',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AuthMeResponse' },
              },
            },
          },
        },
      }),
    },
    '/objects': {
      get: op('getStoredObject', 'Download a privately stored object by key', {
        tags: ['objects'],
        parameters: [
          {
            name: 'key',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description: 'Storage key returned at upload time.',
          },
        ],
        responses: {
          '200': { description: 'Object bytes' },
          '400': errorResponse('Missing or invalid object key'),
          '404': errorResponse('Object not found'),
        },
      }),
    },
    '/billing': {
      get: op('getBilling', 'Cloud plan, access lifecycle, and provider state', {
        tags: ['billing'],
        responses: {
          '200': {
            description: 'Cloud billing state for the resolved workspace',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/BillingResponse' },
              },
            },
          },
          '404': errorResponse('Cloud billing is disabled'),
          '409': errorResponse('Workspace bootstrap is required'),
        },
      }),
    },
    '/billing/checkout': {
      post: op('createBillingCheckout', 'Create a provider checkout transaction', {
        tags: ['billing'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/BillingCheckoutRequest' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Provider transaction created; access still changes only after a verified webhook',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/BillingCheckoutResponse' },
              },
            },
          },
          '404': errorResponse('Cloud billing is disabled'),
          '409': errorResponse('Workspace bootstrap is required'),
          '422': errorResponse('Billing period is invalid'),
          '503': errorResponse('Billing provider is not configured'),
        },
      }),
    },
    '/billing/portal': {
      post: op('createBillingPortal', 'Create a provider-managed billing portal session', {
        tags: ['billing'],
        responses: {
          '200': {
            description: 'Provider billing portal URL',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/BillingPortalResponse' },
              },
            },
          },
          '404': errorResponse('Cloud billing is disabled'),
          '409': errorResponse('Workspace bootstrap or completed checkout is required'),
          '503': errorResponse('Billing provider is not configured'),
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
          // ILLEGAL_TRANSITION shares this code because it is the same kind of
          // refusal: the body was well formed and the change it asked for is
          // not one the record may make. It reaches this generic path because
          // the application form's own save comes through here, and a guard
          // only the dedicated endpoints ran would be no guard at all.
          '422': errorResponse(
            'Validation failed, or an application status move the machine refuses (ILLEGAL_TRANSITION)',
          ),
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
            schema: { type: 'string', enum: [...APPLICATION_STATUSES] },
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
      post: op('createApplication', 'Create an application', {
        tags: ['applications'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ApplicationWrite' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Application created',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApplicationDetailResponse' },
              },
            },
          },
          '422': errorResponse('Invalid application'),
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
      patch: op('updateApplication', 'Edit an application; props merge onto what is stored', {
        tags: ['applications'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ApplicationWrite' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Application updated',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApplicationDetailResponse' },
              },
            },
          },
          '404': errorResponse('Application not found'),
          '422': errorResponse('Invalid update, or a status move the machine refuses'),
        },
      }),
    },
    '/applications/{id}/status': {
      post: op('recordApplicationStatus', 'Record a status move, or correct a wrong one', {
        tags: ['applications'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ApplicationStatusChange' },
            },
          },
        },
        responses: {
          '200': {
            description:
              'The dossier, plus what was recorded. `recorded` is false when the status was resubmitted as itself, in which case nothing was written.',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/ApplicationDetailResponse' },
                    {
                      type: 'object',
                      required: ['transition'],
                      properties: {
                        transition: { $ref: '#/components/schemas/ApplicationTransition' },
                      },
                    },
                  ],
                },
              },
            },
          },
          '404': errorResponse('Application not found'),
          '422': errorResponse('Unknown status, or a move the machine refuses'),
        },
      }),
    },
    '/letters/{id}/compile': {
      post: op('compileLetter', 'Render and compile a letter for preview; stores nothing', {
        tags: ['letters'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description:
              'The compile result. A build service that cannot be reached still answers 200, with `offline` true and the full source, so a compiler being down does not take the flow with it.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/LetterCompileResult' },
              },
            },
          },
          '404': errorResponse('Letter not found'),
          '422': errorResponse('Letter has nothing to compile, or its target or an atom is gone'),
        },
      }),
    },
    '/letters/{id}/finalize': {
      post: op('finalizeLetter', "Compile and keep the PDF and source as this letter's artifacts", {
        tags: ['letters'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description:
              'The compile result. On success the letter comes back final with its artifacts filled; offline, it comes back untouched and still a draft.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/LetterCompileResult' },
              },
            },
          },
          '404': errorResponse('Letter not found'),
          '422': errorResponse('Letter has nothing to compile, or its target or an atom is gone'),
        },
      }),
    },
    '/letters/{id}/artifacts/{kind}': {
      get: op('getLetterArtifact', 'Short-lived signed URL for one stored letter artifact', {
        tags: ['letters'],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          {
            name: 'kind',
            in: 'path',
            required: true,
            schema: { type: 'string', enum: ['pdf', 'tex'] },
          },
        ],
        responses: {
          '200': {
            description: 'A signed URL and what it points at',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['url', 'expiresIn', 'filename', 'sha256'],
                  properties: {
                    url: { type: 'string' },
                    expiresIn: { type: 'integer' },
                    filename: { type: 'string' },
                    sha256: { type: 'string' },
                  },
                },
              },
            },
          },
          '404': errorResponse('Unknown artifact kind, or letter not found'),
          '409': errorResponse(
            'The record exists and the file does not, which is what a finalize during a storage outage leaves behind',
          ),
        },
      }),
    },
    '/productivity/tasks': {
      get: op('listProductivityTasks', 'List task nodes with placement (flagged)', {
        tags: ['productivity'],
        parameters: [
          {
            name: 'x-vitae-tz',
            in: 'header',
            required: false,
            schema: { type: 'string' },
            description: 'IANA timezone for date-only placement (ADR 0010)',
          },
        ],
        responses: {
          '200': { description: 'Task read models with placement.reason' },
          '404': errorResponse('Feature disabled or not found'),
        },
      }),
    },
    '/productivity/tasks/{id}': {
      get: op('getProductivityTask', 'Task detail with placement (flagged)', {
        tags: ['productivity'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Task read model' },
          '404': errorResponse('Missing, not a task, other workspace, or feature disabled'),
        },
      }),
    },
    '/productivity/commands': {
      post: op('postProductivityCommand', 'Execute a versioned productivity command', {
        tags: ['productivity'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['version', 'operation_id', 'type', 'payload'],
                properties: {
                  version: { type: 'integer', enum: [1] },
                  operation_id: { type: 'string' },
                  expected_revision: { type: 'integer', minimum: 0 },
                  type: {
                    type: 'string',
                    enum: [
                      'create_task',
                      'update_task',
                      'complete_task',
                      'drop_task',
                      'restore_task',
                      'reorder_tasks',
                      'wait_on_task',
                      'follow_up_task',
                      'add_time_entry',
                      'update_time_entry',
                      'set_recurrence',
                      'upsert_rule',
                      'upsert_template',
                    ],
                  },
                  payload: { type: 'object', additionalProperties: true },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: '{ replayed: false, result }' },
          '200': { description: 'Idempotent replay of operation_id' },
          '402': errorResponse('Read-only workspace (same as POST /nodes)'),
          '404': errorResponse('Missing task or wait target, or feature disabled'),
          '409': errorResponse('expected_revision does not match stored rev'),
          '422': errorResponse('Command body failed productivityCommandSchema'),
        },
      }),
    },
    '/productivity/waiting': {
      get: op('listProductivityWaiting', 'Tasks with status=waiting', {
        tags: ['productivity'],
        responses: {
          '200': { description: 'Waiting task read models' },
          '404': errorResponse('Feature disabled or not found'),
        },
      }),
    },
    '/productivity/time-entries': {
      get: op('listProductivityTimeEntries', 'List time entries, optionally by task_id', {
        tags: ['productivity'],
        parameters: [{ name: 'task_id', in: 'query', required: false, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Time entries' },
          '404': errorResponse('Unknown task_id, other workspace, or feature disabled'),
        },
      }),
    },
    '/productivity/rules': {
      get: op('listProductivityRules', 'List automation rules', {
        tags: ['productivity'],
        responses: {
          '200': { description: 'Automation rules' },
          '404': errorResponse('Feature disabled or not found'),
        },
      }),
    },
    '/productivity/templates': {
      get: op('listProductivityTemplates', 'List project/item templates', {
        tags: ['productivity'],
        responses: {
          '200': { description: 'Productivity templates stored on the templates table' },
          '404': errorResponse('Feature disabled or not found'),
        },
      }),
    },
    '/productivity/analytics': {
      get: op('getProductivityAnalytics', 'Private workspace analytics figures (flagged)', {
        tags: ['productivity'],
        parameters: [
          {
            name: 'window',
            in: 'query',
            required: false,
            schema: { type: 'integer', enum: [30, 90, 365] },
            description: 'Inclusive calendar-day window. Defaults to 30.',
          },
          {
            name: 'x-vitae-tz',
            in: 'header',
            required: false,
            schema: { type: 'string' },
            description: 'IANA timezone for day buckets (ADR 0010)',
          },
        ],
        responses: {
          '200': { description: '{ window, time_zone, completeness, figures }' },
          '404': errorResponse('Feature disabled or not found'),
        },
      }),
    },
    '/productivity/review': {
      get: op('getProductivityReview', 'Factual daily or weekly review (flagged)', {
        tags: ['productivity'],
        parameters: [
          {
            name: 'period',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['daily', 'weekly'] },
            description: 'Defaults to daily.',
          },
        ],
        responses: {
          '200': { description: '{ window, time_zone, completeness, figures, review }' },
          '404': errorResponse('Feature disabled or not found'),
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
        'Private career-system REST surface. All `/api/v1` routes are default-deny except explicit auth helpers. Hosted Cloud requests resolve an authenticated member workspace on the server. Errors use `{ error: { code, message, details?, request_id } }`. Cookie session and Bearer JWT are equivalent.',
    },
    servers: [
      { url: 'http://localhost:4000/api/v1', description: 'Local API' },
      { url: 'http://localhost:4000', description: 'Local origin (for health and provider webhooks)' },
    ],
    tags: [
      { name: 'auth' },
      { name: 'billing' },
      { name: 'webhooks' },
      { name: 'nodes' },
      { name: 'edges' },
      { name: 'capture' },
      { name: 'search' },
      { name: 'retention' },
      { name: 'export' },
      { name: 'dashboard' },
      { name: 'applications' },
      { name: 'productivity' },
    ],
    paths: {
      ...paths,
      // Provider webhooks live outside `/api/v1`: they authenticate with an
      // HMAC over the untouched raw request body, not a user session.
      '/webhooks/paddle': {
        servers: [{ url: 'http://localhost:4000' }],
        post: op('paddleWebhook', 'Receive a signed Paddle billing event', {
          tags: ['webhooks'],
          security: [{ paddleWebhookSignature: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PaddleWebhookEvent' },
              },
            },
          },
          responses: {
            '200': {
              description: 'Event was recorded; duplicate delivery is safe',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/PaddleWebhookResponse' },
                },
              },
            },
            '400': errorResponse('Webhook body or payload is invalid'),
            '401': errorResponse('Webhook signature is invalid'),
            '404': errorResponse('Cloud billing is disabled'),
          },
        }),
      },
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
        paddleWebhookSignature: {
          type: 'apiKey',
          in: 'header',
          name: 'paddle-signature',
          description:
            'Paddle HMAC header for the exact raw JSON bytes. The server rejects re-serialized or unsigned payloads.',
        },
      },
      schemas: {
        AuthUser: {
          type: 'object',
          required: ['uid', 'email', 'emailVerified', 'via'],
          properties: {
            uid: { type: 'string', description: 'Immutable authenticated provider user ID.' },
            email: { type: 'string', format: 'email' },
            emailVerified: { type: 'boolean' },
            via: { type: 'string', enum: ['google', 'dev'] },
          },
        },
        WorkspaceAccess: {
          type: 'object',
          required: ['id', 'role', 'accessState', 'trialEndsAt', 'graceEndsAt', 'deletionScheduledAt'],
          properties: {
            id: { type: 'string' },
            role: { type: 'string', enum: ['owner', 'member'] },
            accessState: {
              type: 'string',
              enum: ['trialing', 'active', 'past_due', 'read_only', 'deletion_pending'],
            },
            trialEndsAt: { type: ['string', 'null'], format: 'date-time' },
            graceEndsAt: { type: ['string', 'null'], format: 'date-time' },
            deletionScheduledAt: { type: ['string', 'null'], format: 'date-time' },
          },
        },
        SelfProfile: {
          type: 'object',
          required: ['id', 'title'],
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
          },
        },
        AuthMeResponse: {
          type: 'object',
          required: ['user', 'workspace', 'self', 'cloudEnabled', 'devLoginEnabled', 'localInstall'],
          properties: {
            user: {
              oneOf: [{ type: 'null' }, { $ref: '#/components/schemas/AuthUser' }],
            },
            workspace: {
              oneOf: [{ type: 'null' }, { $ref: '#/components/schemas/WorkspaceAccess' }],
              description: 'Null outside Cloud mode or before an account has been bootstrapped.',
            },
            self: {
              oneOf: [{ type: 'null' }, { $ref: '#/components/schemas/SelfProfile' }],
            },
            cloudEnabled: { type: 'boolean' },
            devLoginEnabled: { type: 'boolean' },
            localInstall: {
              type: 'boolean',
              description: 'True when this process is a loopback-bound personal production install.',
            },
          },
        },
        GraphDiscovery: {
          type: 'object',
          required: ['totals', 'communities', 'bridges', 'disconnected', 'explanation'],
          properties: {
            totals: {
              type: 'object',
              additionalProperties: { type: 'integer' },
              description: 'Whole-workspace record, relationship, community and component counts.',
            },
            communities: { type: 'array', items: { type: 'object' } },
            bridges: { type: 'array', items: { type: 'object' } },
            disconnected: { type: 'array', items: { type: 'object' } },
            explanation: { type: 'string' },
          },
        },
        BootstrapResponse: {
          type: 'object',
          required: ['user', 'workspace', 'self', 'created', 'claimedLegacy'],
          properties: {
            user: { $ref: '#/components/schemas/AuthUser' },
            workspace: { $ref: '#/components/schemas/WorkspaceAccess' },
            self: { $ref: '#/components/schemas/SelfProfile' },
            created: { type: 'boolean' },
            claimedLegacy: { type: 'boolean' },
          },
        },
        BillingAccess: {
          type: 'object',
          required: ['state', 'trialEndsAt', 'graceEndsAt', 'deletionScheduledAt'],
          properties: {
            state: {
              type: 'string',
              enum: ['trialing', 'active', 'past_due', 'read_only', 'deletion_pending'],
            },
            trialEndsAt: { type: ['string', 'null'], format: 'date-time' },
            graceEndsAt: { type: ['string', 'null'], format: 'date-time' },
            deletionScheduledAt: { type: ['string', 'null'], format: 'date-time' },
          },
        },
        BillingSubscription: {
          type: 'object',
          required: ['status', 'billingPeriod', 'currentPeriodEndsAt', 'cancelAtPeriodEnd'],
          properties: {
            status: { type: ['string', 'null'] },
            billingPeriod: { type: ['string', 'null'], enum: ['monthly', 'annual', null] },
            currentPeriodEndsAt: { type: ['string', 'null'], format: 'date-time' },
            cancelAtPeriodEnd: { type: 'boolean' },
          },
        },
        BillingResponse: {
          type: 'object',
          required: ['plan', 'access', 'customer', 'subscription'],
          properties: {
            plan: { type: 'string', const: 'cloud_individual' },
            access: { $ref: '#/components/schemas/BillingAccess' },
            customer: {
              type: 'object',
              required: ['configured', 'provider'],
              properties: {
                configured: { type: 'boolean' },
                provider: { type: 'string', const: 'paddle' },
              },
            },
            subscription: {
              oneOf: [{ type: 'null' }, { $ref: '#/components/schemas/BillingSubscription' }],
            },
          },
        },
        BillingCheckoutRequest: {
          type: 'object',
          additionalProperties: false,
          required: ['billingPeriod'],
          properties: {
            billingPeriod: { type: 'string', enum: ['monthly', 'annual'] },
          },
        },
        BillingCheckoutResponse: {
          type: 'object',
          required: ['transactionId'],
          properties: {
            transactionId: { type: 'string', description: 'Opaque provider transaction identifier.' },
          },
        },
        BillingPortalResponse: {
          type: 'object',
          required: ['url'],
          properties: {
            url: { type: 'string', format: 'uri' },
          },
        },
        PaddleWebhookEvent: {
          type: 'object',
          required: ['event_id', 'event_type'],
          properties: {
            event_id: { type: 'string' },
            event_type: { type: 'string' },
            occurred_at: { type: ['string', 'null'], format: 'date-time' },
            data: { type: 'object', additionalProperties: true },
          },
          additionalProperties: true,
        },
        PaddleWebhookResponse: {
          type: 'object',
          required: ['ok', 'duplicate', 'linked'],
          properties: {
            ok: { type: 'boolean', const: true },
            duplicate: { type: 'boolean' },
            linked: { type: 'boolean', description: 'Whether the event resolved to a known workspace' },
          },
        },
        ApplicationStatus: { type: 'string', enum: [...APPLICATION_STATUSES] },
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
        ApplicationWrite: {
          type: 'object',
          description:
            'The node envelope without `type`. On PATCH, `props` merges onto what is stored and an explicit null clears a key, which is not how the generic node patch behaves. Note that the application status is `props.status`; the envelope has an unrelated top-level `status` of its own, and setting it there does nothing.',
          properties: {
            title: {
              type: 'string',
              description: 'Falls back to props.role_title when omitted or blank.',
            },
            props: { $ref: '#/components/schemas/ApplicationProps' },
            subtitle: { type: 'string' },
            notes_md: { type: 'string' },
            start_date: { type: 'string' },
            end_date: { type: 'string' },
            pinned: { type: 'boolean' },
            sensitivity: { type: 'string', enum: ['normal', 'sensitive'] },
            source: { type: 'string', enum: [...SOURCE_TYPES] },
            source_ref: { type: 'string' },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
          },
        },
        ApplicationProps: {
          type: 'object',
          required: ['role_title', 'status'],
          additionalProperties: true,
          properties: {
            role_title: { type: 'string' },
            status: { $ref: '#/components/schemas/ApplicationStatus' },
            applied_on: { type: 'string' },
            deadline: { type: 'string' },
            next_step: { type: 'string' },
            next_step_date: { type: 'string' },
            channel: { type: 'string', enum: ['referral', 'cold', 'recruiter', 'inbound'] },
            location_mode: { type: 'string', enum: ['onsite', 'hybrid', 'remote'] },
            salary_range: { type: 'string' },
            job_url: { type: 'string' },
            target_id: { type: 'string' },
            resume_id: { type: 'string' },
          },
        },
        ApplicationStatusChange: {
          type: 'object',
          required: ['status'],
          properties: {
            status: { $ref: '#/components/schemas/ApplicationStatus' },
            correction: {
              type: 'boolean',
              default: false,
              description:
                'A correction says the recorded status was never true, rather than that the application moved. It skips the transition check and is available from a closed record, because an operator who mis-recorded an outcome would otherwise be held there. It cannot write a status outside the enum.',
            },
          },
        },
        ApplicationTransition: {
          type: 'object',
          required: ['from', 'to', 'correction', 'recorded'],
          properties: {
            from: { $ref: '#/components/schemas/ApplicationStatus' },
            to: { $ref: '#/components/schemas/ApplicationStatus' },
            correction: { type: 'boolean' },
            recorded: {
              type: 'boolean',
              description:
                'False when the status was resubmitted as itself. Nothing is written, because a revision recording a move that did not happen would be a false line in a history whose whole value is that every line is true.',
            },
          },
        },
        LetterCompileResult: {
          type: 'object',
          required: ['ok', 'pages', 'offline', 'error', 'logTail', 'pdfBase64', 'tex', 'template', 'letter'],
          properties: {
            ok: { type: 'boolean' },
            pages: {
              type: ['integer', 'null'],
              description: 'Null where the page count could not be determined, rather than a zero that would read as "compiled, and came out empty".',
            },
            offline: { type: 'boolean' },
            error: {
              type: ['object', 'null'],
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
                section: { type: 'string' },
              },
            },
            logTail: { type: ['string', 'null'] },
            pdfBase64: { type: ['string', 'null'] },
            tex: {
              type: 'string',
              description: 'Always present, including when the compile failed, so a download of the source is always available.',
            },
            template: { type: 'string', description: 'key@version, e.g. letter-classic@1.0.0' },
            letter: { type: 'object', additionalProperties: true },
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
