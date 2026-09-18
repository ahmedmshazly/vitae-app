import { Link } from 'react-router-dom';
import { edgeTypeLabel } from '@vitae/core';
import type {
  CommunityConnectionDetail,
  CommunityDetail,
  DiscoveryCommunity,
  GraphDiscovery,
} from './types.js';
import { entityHref } from '../../lib/entity-href.js';

export type DiscoveryTab = 'communities' | 'bridges' | 'disconnected';

export interface GraphDiscoveryPanelProps {
  open: boolean;
  tab: DiscoveryTab;
  discovery?: GraphDiscovery;
  loading: boolean;
  failed: boolean;
  selectedCommunityId: string | null;
  selectedBridgeId: string | null;
  communityDetail?: CommunityDetail;
  connectionDetail?: CommunityConnectionDetail;
  onClose: () => void;
  onTab: (tab: DiscoveryTab) => void;
  onCommunity: (community: DiscoveryCommunity) => void;
  onBridge: (id: string) => void;
  onConnection: (from: string, to: string) => void;
  onRecord: (id: string) => void;
  onRetry: () => void;
  onLoadMoreMembers: () => void;
}

export function GraphDiscoveryPanel({
  open,
  tab,
  discovery,
  loading,
  failed,
  selectedCommunityId,
  selectedBridgeId,
  communityDetail,
  connectionDetail,
  onClose,
  onTab,
  onCommunity,
  onBridge,
  onConnection,
  onRecord,
  onRetry,
  onLoadMoreMembers,
}: GraphDiscoveryPanelProps) {
  if (!open) return null;
  return (
    <aside className="discovery" aria-label="Map discoveries">
      <div className="discovery__head">
        <div>
          <p className="discovery__eyebrow">Whole workspace</p>
          <h2>Discover patterns</h2>
        </div>
        <button type="button" className="discovery__close" onClick={onClose} aria-label="Close discoveries">
          ×
        </button>
      </div>
      {discovery && (
        <p className="discovery__totals">
          {discovery.totals.records} records · {discovery.totals.relationships} relationships · {discovery.totals.communities} communities
        </p>
      )}
      <div className="discovery__tabs" role="tablist" aria-label="Discovery views">
        {(['communities', 'bridges', 'disconnected'] as DiscoveryTab[]).map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={tab === item}
            className={tab === item ? 'is-active' : undefined}
            onClick={() => onTab(item)}
          >
            {item === 'communities' ? 'Communities' : item === 'bridges' ? 'Bridges' : 'Disconnected'}
          </button>
        ))}
      </div>
      {loading ? (
        <p className="discovery__state">Reading the relationships in your workspace…</p>
      ) : failed ? (
        <div className="discovery__state">
          <p>Discovery couldn’t be refreshed. Your current map is still available.</p>
          <button type="button" className="graph__tool" onClick={onRetry}>Try again</button>
        </div>
      ) : !discovery ? null : (
        <div className="discovery__body">
          {tab === 'communities' && (
            <>
              <p className="discovery__explain">{discovery.explanation}</p>
              {discovery.communities.map((community) => (
                <CommunityRow
                  key={community.id}
                  community={community}
                  selected={selectedCommunityId === community.id}
                  onClick={() => onCommunity(community)}
                />
              ))}
            </>
          )}
          {tab === 'bridges' && (
            <>
              <p className="discovery__explain">Bridge records rank by how many other communities they connect to, then by their distinct cross-community neighbors.</p>
              {discovery.bridges.length ? discovery.bridges.map((bridge) => (
                <button
                  type="button"
                  key={bridge.id}
                  className={`discovery__row${selectedBridgeId === bridge.id ? ' is-selected' : ''}`}
                  onClick={() => onBridge(bridge.id)}
                >
                  <span className="discovery__rowtitle">{bridge.title}</span>
                  <span className="discovery__meta">{bridge.connectedCommunityCount} communities · {bridge.crossCommunityNeighborCount} neighbors</span>
                  <span className="discovery__subline">{bridge.communities.map((item) => item.label).join(' · ')}</span>
                </button>
              )) : <p className="discovery__state">No record currently connects more than one computed community.</p>}
            </>
          )}
          {tab === 'disconnected' && (
            <>
              <p className="discovery__explain">These groups have no recorded relationship to the rest of this map. They simply describe the structure that is here.</p>
              {discovery.disconnected.map((component) => (
                <div key={component.id} className="discovery__component">
                  <strong>{component.isolated ? 'Unconnected record' : `${component.recordCount} record component`}</strong>
                  <span>{component.relationshipCount} relationships</span>
                  <div>{component.records.map((item) => (
                    <button type="button" key={item.id} onClick={() => onRecord(item.id)}>{item.title}</button>
                  ))}</div>
                </div>
              ))}
            </>
          )}
          {communityDetail && selectedCommunityId === communityDetail.community.id && (
            <section className="discovery__detail" aria-label={`${communityDetail.community.label} details`}>
              <div className="discovery__detailhead">
                <div>
                  <p className="discovery__eyebrow">Selected community</p>
                  <h3>{communityDetail.community.label}</h3>
                </div>
                <span>{communityDetail.totalMembers} records</span>
              </div>
              <p className="discovery__types">{Object.entries(communityDetail.community.recordTypes).map(([type, count]) => `${count} ${type}`).join(' · ')}</p>
              <p className="discovery__representatives">Representative records: {communityDetail.community.representatives.map((item) => item.title).join(', ')}</p>
              <div className="discovery__connections">
                {communityDetail.community.connections.map((connection) => (
                  <button type="button" key={connection.communityId} onClick={() => onConnection(communityDetail.community.id, connection.communityId)}>
                    <span>{connection.label}</span><span>{connection.relationships} links</span>
                  </button>
                ))}
              </div>
              <div className="discovery__members">
                {communityDetail.members.map((member) => (
                  <Link key={member.id} to={entityHref(member.type, member.id)}>{member.title}<span>{member.type}</span></Link>
                ))}
              </div>
              {communityDetail.offset + communityDetail.members.length < communityDetail.totalMembers && (
                <button type="button" className="graph__tool" onClick={onLoadMoreMembers}>Show more records</button>
              )}
              {communityDetail.sceneTruncated && <p className="discovery__notice">The canvas shows up to 750 records and 1,500 elements. Search this list to reach the rest.</p>}
            </section>
          )}
          {connectionDetail && (
            <section className="discovery__detail" aria-label="Supporting relationships">
              <div className="discovery__detailhead"><h3>Links between communities</h3><span>{connectionDetail.totalRelationships} relationships</span></div>
              {connectionDetail.relationships.map((relationship) => (
                <button type="button" key={relationship.id} className="discovery__relationship" onClick={() => onRecord(relationship.src)}>
                  <span>{edgeTypeLabel(relationship.type)}</span><span>{relationship.relation ?? relationship.kind ?? 'Recorded relationship'}</span>
                </button>
              ))}
            </section>
          )}
        </div>
      )}
    </aside>
  );
}

function CommunityRow({ community, selected, onClick }: { community: DiscoveryCommunity; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`discovery__row${selected ? ' is-selected' : ''}`} onClick={onClick}>
      <span className="discovery__rowtitle">{community.label}</span>
      <span className="discovery__meta">{community.memberCount} records · {community.connections.length} connections</span>
      <span className="discovery__subline">{community.representatives.map((item) => item.title).join(' · ')}</span>
    </button>
  );
}
