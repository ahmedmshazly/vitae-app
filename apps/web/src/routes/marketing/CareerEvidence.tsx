/** The evidence-led alternative to a blank-document résumé workflow. */
import { Link } from 'react-router-dom';
import { Glyph } from '@vitae/ui';
import { MarketingShell, ProductFrame } from './Chrome.js';
import { CloudAction } from './CloudAction.js';

const EVIDENCE_STAGES = [
  {
    name: 'Source',
    detail: 'A role, project, interaction, artifact, or note anchors the claim in a real part of your history.',
  },
  {
    name: 'Achievement atom',
    detail: 'Your contribution and observed outcome become a reusable, inspectable unit of career evidence.',
  },
  {
    name: 'Target signal',
    detail: 'A role description gives the selection a purpose without rewriting the underlying record.',
  },
  {
    name: 'Reviewed output',
    detail: 'You select and edit the evidence, then compile an ATS-safe PDF that remains linked to the target.',
  },
] as const;

export function CareerEvidence() {
  return (
    <MarketingShell>
      <section className="mk-page-hero" aria-labelledby="evidence-heading">
        <div className="mk__inner mk-page-hero__layout">
          <div>
            <h1 id="evidence-heading">Your next résumé should not depend on what you can remember under pressure.</h1>
            <p>
              Vitae keeps career evidence connected to the work, role, source, and outcome behind it.
              When a target appears, you review a visible selection instead of starting from a blank document.
            </p>
            <div className="mk-page-hero__actions">
              <CloudAction className="mk-action mk-action--primary mk-action--lg" />
              <Link className="mk-text-link" to="/guides/turn-work-into-evidence">Read the evidence guide <span aria-hidden="true">→</span></Link>
            </div>
          </div>
          <div className="mk-page-hero__aside">
            <p>What stays attached to a claim</p>
            <ul>
              <li><Glyph name="project" size={17} /> The work and your contribution</li>
              <li><Glyph name="link" size={17} /> Supporting people, skills, and sources</li>
              <li><Glyph name="resume" size={17} /> The target and reviewed output</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mk-section mk-section--inset" aria-labelledby="evidence-route-heading">
        <div className="mk__inner">
          <div className="mk-section__intro mk-section__intro--split">
            <h2 id="evidence-route-heading">Build a trace from work to output.</h2>
            <p>
              Vitae helps preserve the route between a professional claim and the records that support it.
              It can score and select evidence deterministically, but it leaves the final editorial decision with you.
            </p>
          </div>
          <ol className="mk-evidence-route" aria-label="Career evidence route">
            {EVIDENCE_STAGES.map((stage, index) => (
              <li key={stage.name}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <strong>{stage.name}</strong>
                  <p>{stage.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mk-section" aria-labelledby="record-evidence-heading">
        <div className="mk__inner mk-feature-spread">
          <div className="mk-feature-spread__copy">
            <h2 id="record-evidence-heading">Capture enough detail to use the work twice.</h2>
            <p>
              The best moment to preserve an achievement is closer to the work itself, not the week
              before an application. Structured forms make room for dates, source, confidence, linked
              records, and the context your future self will need.
            </p>
            <ol className="mk-ledger">
              <li><span>01</span><div><strong>Record the work</strong><p>Add the role, project, artifact, or interaction that anchors your claim.</p></div></li>
              <li><span>02</span><div><strong>Describe the change</strong><p>Keep the contribution and observed outcome specific enough to inspect and defend.</p></div></li>
              <li><span>03</span><div><strong>Link the proof</strong><p>Connect skills, people, sources, and related work rather than burying them in prose.</p></div></li>
            </ol>
          </div>
          <ProductFrame
            src="/landing/form.png"
            alt="Vitae structured record form showing sections, validation, and contextual fields"
            label="Structured record · preserve depth on your terms"
          />
        </div>
      </section>

      <section className="mk-section" aria-labelledby="tailor-heading">
        <div className="mk__inner mk-outcomes-layout">
          <div className="mk-section__intro mk-section__intro--sticky">
            <h2 id="tailor-heading">Tailoring is selection, not invention.</h2>
            <p>
              A target role can surface relevant evidence and explain the selection. You can block,
              pin, reorder, and rewrite the record before it becomes an output.
            </p>
          </div>
          <div className="mk-outcome-ledger">
            <article>
              <span className="mk-outcome-ledger__glyph" aria-hidden="true"><Glyph name="document" size={19} /></span>
              <div>
                <p>ROLE DESCRIPTION</p>
                <h3>Start from the opportunity, not a generic template.</h3>
                <span>Parse a target role and keep its requirements adjacent to the record you are tailoring.</span>
              </div>
            </article>
            <article>
              <span className="mk-outcome-ledger__glyph" aria-hidden="true"><Glyph name="adjust" size={19} /></span>
              <div>
                <p>VISIBLE SELECTION</p>
                <h3>Review why each achievement atom belongs.</h3>
                <span>Scores are inspectable and the final selection remains under your control.</span>
              </div>
            </article>
            <article>
              <span className="mk-outcome-ledger__glyph" aria-hidden="true"><Glyph name="resume" size={19} /></span>
              <div>
                <p>ATS-SAFE OUTPUT</p>
                <h3>Compile the reviewed record into a PDF.</h3>
                <span>Vitae compiles an ATS-safe LaTeX PDF while retaining the target and output history for revision.</span>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="mk-section mk-section--inset" aria-labelledby="honesty-heading">
        <div className="mk__inner mk-boundary">
          <div>
            <h2 id="honesty-heading">The output should remain true when someone asks about it.</h2>
            <p>
              Vitae is deliberately not a claim generator. It organizes and compiles career evidence,
              but the person applying remains responsible for what the document says.
            </p>
          </div>
          <ul aria-label="Career evidence boundaries">
            <li><strong>No invented experience</strong><span>The system works from your evidence, not from a generated professional persona.</span></li>
            <li><strong>No hidden selection</strong><span>Relevant atoms and their scores remain available for inspection and editing.</span></li>
            <li><strong>No locked output</strong><span>Targets, evidence, and outputs remain part of the career record and can be exported.</span></li>
          </ul>
        </div>
      </section>

      <section className="mk-closing" aria-labelledby="evidence-closing-heading">
        <div className="mk__inner mk-closing__layout">
          <div>
            <h2 id="evidence-closing-heading">Make the work you did easier to carry forward.</h2>
            <p>Begin with one achievement you know you will want to explain again.</p>
          </div>
          <div className="mk-closing__actions">
            <CloudAction className="mk-action mk-action--primary mk-action--lg" />
            <Link className="mk-action mk-action--lg" to="/guides/tailor-a-resume">Read the tailoring guide</Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
