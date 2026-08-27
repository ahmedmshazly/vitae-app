/**
 * Cover letters against a target (FR-RES-020) and their compile pair
 * (FR-RES-021).
 *
 * The compile assertions are shaped like the résumé slice next door: they check
 * the honest response shape and tolerate a build service that is not running,
 * because the point of FR-RES-013 is that an absent compiler degrades rather
 * than fails.
 */
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { authHeader, getAuthedApp } from '../../__tests__/helpers/app.js';

afterAll(async () => {
  await new Promise((r) => setTimeout(r, 100));
});

describe('letters routes', () => {
  it('stores a cover-letter draft against a target and rejects a missing target', async () => {
    const { app, token } = await getAuthedApp();
    const target = await request(app)
      .post('/api/v1/targets')
      .set(authHeader(token))
      .send({ role_title: 'Cover Letter Split', jd_raw: 'Requirements\n- Writing' })
      .expect(201);
    const role = await request(app)
      .post('/api/v1/nodes')
      .set(authHeader(token))
      .send({ type: 'role', title: `Letter Role ${Date.now()}`, props: { employment_type: 'full_time' } })
      .expect(201);
    const atom = await request(app)
      .post('/api/v1/atoms')
      .set(authHeader(token))
      .send({
        owner_node: role.body.node.id,
        kind: 'achievement',
        variants: [{ emphasis: 'technical', text: 'Shipped clear writing systems.', is_default: true }],
      })
      .expect(201);

    const created = await request(app)
      .post('/api/v1/letters')
      .set(authHeader(token))
      .send({
        target_id: target.body.target.id,
        blocks: [
          { kind: 'hook', text: 'I am excited about the role.' },
          { kind: 'body', atom_id: atom.body.id },
          { kind: 'closer', text: 'Looking forward to speaking.' },
        ],
      })
      .expect(201);
    expect(created.body.letter.status).toBe('draft');
    expect(created.body.letter.blocks).toHaveLength(3);

    const listed = await request(app)
      .get(`/api/v1/letters?targetId=${target.body.target.id}`)
      .set(authHeader(token))
      .expect(200);
    expect(listed.body.letters.some((row: { id: string }) => row.id === created.body.letter.id)).toBe(true);

    await request(app)
      .post('/api/v1/letters')
      .set(authHeader(token))
      .send({ target_id: 'missing-target', blocks: [{ kind: 'hook', text: 'nope' }] })
      .expect(422);
  });

  it('compiles a letter to the same artifact pair shape a résumé compiles to', async () => {
    const { app, token } = await getAuthedApp();
    const target = await request(app)
      .post('/api/v1/targets')
      .set(authHeader(token))
      .send({ role_title: 'Letter Compile Shape', jd_raw: 'Requirements\n- Writing' })
      .expect(201);
    const letter = await request(app)
      .post('/api/v1/letters')
      .set(authHeader(token))
      .send({
        target_id: target.body.target.id,
        recipient: { name: 'Marie Uwase', title: 'Head of Engineering' },
        blocks: [
          { kind: 'hook', text: 'I am writing about the role.' },
          { kind: 'body', text: 'I have shipped **measurable** systems.' },
          { kind: 'closer', text: 'Looking forward to speaking.' },
        ],
      })
      .expect(201);

    const res = await request(app)
      .post(`/api/v1/letters/${letter.body.letter.id}/compile`)
      .set(authHeader(token))
      .expect(200);

    expect(res.body).toHaveProperty('ok');
    expect(res.body).toHaveProperty('pages');
    expect(res.body).toHaveProperty('offline');
    expect(res.body).toHaveProperty('error');
    expect(res.body).toHaveProperty('logTail');
    expect(res.body.template).toBe('letter-classic@1.0.0');
    expect(typeof res.body.tex).toBe('string');
    expect(res.body.tex).toContain('\\documentclass');
    // The escape layer is the same one the résumé renderer uses, so the
    // markdown became a macro and the greeting names the recorded recipient.
    expect(res.body.tex).toContain('\\textbf{measurable}');
    expect(res.body.tex).toContain('Dear Marie Uwase,');
    expect(res.body.tex).not.toMatch(/«[^»]*»/);

    // Two outcomes are acceptable here and a third is not. Either the build
    // service answered, in which case a real PDF of one or two pages came back,
    // or it was unreachable, in which case `offline` says so. Asserting only
    // the response shape, as this case first did, would also pass for a
    // compiler that was up and failing, which is the one result worth catching.
    if (res.body.offline) {
      expect(res.body.ok, 'an offline compile is not a successful one').toBe(false);
      expect(res.body.pdfBase64).toBeNull();
    } else {
      expect(res.body.ok, `compile failed: ${res.body.logTail ?? ''}`).toBe(true);
      expect(typeof res.body.pdfBase64).toBe('string');
      // A PDF, not an error page rendered as one.
      expect(Buffer.from(res.body.pdfBase64, 'base64').subarray(0, 5).toString()).toBe('%PDF-');
      expect(res.body.pages).toBeGreaterThanOrEqual(1);
      expect(res.body.pages).toBeLessThanOrEqual(2);
    }

    // Preview stores nothing.
    const after = await request(app)
      .get(`/api/v1/letters/${letter.body.letter.id}`)
      .set(authHeader(token))
      .expect(200);
    expect(after.body.letter.status).toBe('draft');
    expect(after.body.letter.pages).toBeNull();
  });

  it('degrades to the source when the compiler is unreachable, and keeps the draft a draft', async () => {
    const { app, token } = await getAuthedApp();
    const target = await request(app)
      .post('/api/v1/targets')
      .set(authHeader(token))
      .send({ role_title: 'Letter Finalize Shape', jd_raw: 'Requirements\n- Writing' })
      .expect(201);
    const letter = await request(app)
      .post('/api/v1/letters')
      .set(authHeader(token))
      .send({
        target_id: target.body.target.id,
        blocks: [{ kind: 'hook', text: 'I am writing about the role.' }],
      })
      .expect(201);
    const id = letter.body.letter.id as string;

    const res = await request(app)
      .post(`/api/v1/letters/${id}/finalize`)
      .set(authHeader(token))
      .expect(200);
    expect(typeof res.body.tex).toBe('string');

    const after = await request(app).get(`/api/v1/letters/${id}`).set(authHeader(token)).expect(200);
    if (res.body.offline || !res.body.ok) {
      // Nothing compiled, so nothing may claim to have been finalized.
      expect(after.body.letter.status).toBe('draft');
      expect(after.body.letter.pdf_key).toBeNull();
      await request(app)
        .get(`/api/v1/letters/${id}/artifacts/pdf`)
        .set(authHeader(token))
        .expect(409);
    } else {
      expect(after.body.letter.status).toBe('final');
      expect(after.body.letter.template_key).toBe('letter-classic');
      // Artifacts are recorded only when storage actually kept them. Tests stub
      // the adapter; an unconfigured real adapter throws into the storage-outage
      // branch. What has to hold is that the key and the hash agree with each
      // other: a letter claiming a stored PDF and no hash for it, or the reverse,
      // is a record that cannot be honoured.
      if (after.body.letter.pdf_key) {
        expect(after.body.letter.artifact_hashes.pdf).toEqual(expect.any(String));
      } else {
        expect(after.body.letter.artifact_hashes.pdf).toBeUndefined();
      }
    }
  });

  it('refuses to compile a letter that is not there', async () => {
    const { app, token } = await getAuthedApp();
    await request(app)
      .post('/api/v1/letters/missing-letter/compile')
      .set(authHeader(token))
      .expect(404);
  });
});
