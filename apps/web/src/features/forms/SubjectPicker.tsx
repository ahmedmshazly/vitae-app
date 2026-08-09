/**
 * "Whose record is this?", the owner picker on subject-bearing entity forms.
 *
 * Records like a role, a degree or a publication only mean something as
 * somebody's. This is the affordance that lets that somebody be *anyone*: me,
 * a person already in the graph, or one created on the spot. Picking is the
 * point, the alternative (and the previous behaviour) was records silently
 * assumed to be mine, or attached to no one at all.
 *
 * Search and inline creation are `EntityPicker`'s job; this adds the "That's
 * me" shortcut and the chosen-subject row.
 */
import { useQuery } from '@tanstack/react-query';
import { EntityGlyph } from '@vitae/ui';
import type { SubjectDescriptor } from '@vitae/core';
import { api } from '../../lib/api.js';
import { EntityPicker, type PickedEntity } from '../../components/EntityPicker.js';

export interface SubjectChoice {
  id: string;
  title: string;
}

interface MeResponse {
  self: { id: string; title: string } | null;
}

/** The `is_self` person, if one exists. Shared cache key with the app shell. */
export function useSelfPerson() {
  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => api.get<MeResponse>('/auth/me'),
    staleTime: 5 * 60 * 1000,
    select: (res) => res.self,
  });
}

export function SubjectPicker({
  subject,
  value,
  onChange,
  error,
}: {
  subject: SubjectDescriptor;
  value: SubjectChoice | null;
  onChange: (next: SubjectChoice | null) => void;
  error?: string;
}) {
  const { data: self } = useSelfPerson();
  const isMe = value !== null && self !== null && value.id === self?.id;

  return (
    <fieldset className="entity-form__section subject-picker">
      <legend className="entity-form__legend">
        {subject.label}
        {subject.required && <span aria-hidden="true"> *</span>}
      </legend>

      {value ? (
        <div className="edgesub__row">
          <EntityGlyph type="person" size="sm" />
          <span className="edgesub__title">
            {value.title}
            {isMe && <span className="u-faint">, you</span>}
          </span>
          <span className="u-faint u-mono edgesub__type">{subject.edgeType}</span>
          <button
            type="button"
            className="vt-strlist__x"
            aria-label={`Clear ${subject.label}`}
            onClick={() => onChange(null)}
          >
            ×
          </button>
        </div>
      ) : (
        <div className="subject-picker__choose">
          {self && (
            <button
              type="button"
              className="vt-btn"
              onClick={() => onChange({ id: self.id, title: self.title })}
            >
              That&rsquo;s me
            </button>
          )}
          <EntityPicker
            types={['person']}
            placeholder="Search people, or type a new name…"
            onPick={(person: PickedEntity) => onChange({ id: person.id, title: person.title })}
          />
        </div>
      )}

      {error && (
        <span className="vt-fld__error" role="alert">
          {error}
        </span>
      )}
    </fieldset>
  );
}
