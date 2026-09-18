import { api } from '../../lib/api.js';
import type { ConnectionDraft } from './EdgeSubEditorRow.js';

/** A save journal survives recoverable failures in the non-transactional API. */
export async function saveConnections(
  nodeId: string,
  next: ConnectionDraft[],
  committed: Map<string, ConnectionDraft>,
) {
  const kept = new Set<string>();
  for (const draft of next) {
    const previous = [...committed.values()].find(
      (item) =>
        item.key === draft.key &&
        item.target.id === draft.target.id &&
        item.sub.edgeType === draft.sub.edgeType &&
        item.sub.direction === draft.sub.direction,
    );
    let edgeId = previous?.edgeId;
    if (edgeId) {
      if (JSON.stringify(previous?.props) !== JSON.stringify(draft.props)) {
        await api.patch(`/edges/${edgeId}`, { props: draft.props });
      }
    } else {
      const result = await api.post<{ edge: { id: string } }>('/edges', {
        type: draft.sub.edgeType,
        src: draft.sub.direction === 'out' ? nodeId : draft.target.id,
        dst: draft.sub.direction === 'out' ? draft.target.id : nodeId,
        props: draft.props,
      });
      edgeId = result.edge.id;
    }
    committed.set(edgeId, { ...draft, props: { ...draft.props }, edgeId });
    kept.add(edgeId);
  }
  for (const edgeId of committed.keys()) {
    if (kept.has(edgeId)) continue;
    await api.del(`/edges/${edgeId}`);
    committed.delete(edgeId);
  }
}
