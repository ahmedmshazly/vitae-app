/**
 * Form-descriptor vocabulary (FR-CAP-002). Descriptors carry what a Zod schema
 * can't express, labels, sections, widgets, placeholders, help text, and which
 * edge sub-editors a type's form shows. A vitest cross-check
 * (`descriptors.test.ts`) keeps every descriptor field honest against the
 * corresponding props schema.
 */
import type { EdgeType, NodeType } from '../types.js';

/** Which input widget renders a field. */
export type FieldWidget =
  | 'text'
  | 'textarea'
  | 'select'
  | 'tags'
  | 'suggest-list' // tags, but autocompleted from existing values (see suggestKind)
  | 'date'
  | 'datetime'
  | 'number'
  | 'checkbox'
  | 'rating' // 1-5 dots (ClosenessDots visual language)
  | 'url'
  | 'email-list'
  | 'string-list'
  | 'money'
  | 'object-list';

/** Semantic pool a `suggest-list` field autocompletes against (GET /suggest/values). */
export type SuggestKind = 'skill' | 'tech' | 'topic' | 'tag' | 'city';

export interface SelectOption {
  value: string;
  label: string;
}

export interface FieldDescriptor {
  /** Key inside `props` (dot-free; nested objects use dedicated widgets). */
  key: string;
  label: string;
  widget: FieldWidget;
  /** For `select`. */
  options?: SelectOption[];
  placeholder?: string;
  help?: string;
  /** Section id this field belongs to (defaults to the first section). */
  section?: string;
  /** Render the value in mono (dates, counts, ids, the brand convention). */
  mono?: boolean;
  /** For `number`/`rating`. */
  min?: number;
  max?: number;
  /** For `object-list`: the shape of each row. */
  itemFields?: FieldDescriptor[];
  /** Mark fields the schema requires (e.g. role.employment_type). */
  required?: boolean;
  /** For `money`: key of the numeric part inside the object (default 'amount'). */
  amountKey?: string;
  /** For `money`: also edit a monthly|yearly `period` key (account.cost). */
  withPeriod?: boolean;
  /** For `suggest-list`: which existing-value pool to autocomplete against. */
  suggestKind?: SuggestKind;
}

/** An inline relationship editor shown on a node's form. */
export interface EdgeSubEditor {
  edgeType: EdgeType;
  /** 'out': this node is src; 'in': this node is dst. */
  direction: 'out' | 'in';
  label: string;
  /** Node types the picker offers for the other endpoint. */
  targetTypes: NodeType[];
  cardinality: 'one' | 'many';
  /** Edge props editable inline when linking (subset of the edge's fields). */
  inlineProps?: FieldDescriptor[];
  help?: string;
}

/**
 * Whose record is this?
 *
 * Types like `role`, `education` and `publication` only mean something as
 * somebody's. Historically that person was implicit, the owner, which left
 * these records either silently assumed to be mine or, when created in the UI,
 * attached to nobody at all. Declaring the subject makes the owning edge an
 * explicit, pickable part of creating the record: me, an existing person, or a
 * new one.
 *
 * `direction` means exactly what it does on `EdgeSubEditor`: 'in', this node is
 * the edge dst, so the edge runs person → node (HELD, AUTHORED, EARNED ...);
 * 'out', this node is the src, so it runs node → person (SHARED_BY).
 */
export interface SubjectDescriptor {
  edgeType: EdgeType;
  direction: 'out' | 'in';
  /** Prompt shown above the person picker ("Whose role is this?"). */
  label: string;
  /**
   * Block submission until a subject is chosen. This is a *form* rule, not an
   * API one: `POST /nodes` still accepts a subject-less create so existing
   * programmatic callers (capture, importers, scripts) keep working and can
   * attach the edge themselves.
   */
  required: boolean;
  /** Preselect the `is_self` person. False for types usually about someone else. */
  defaultToSelf: boolean;
}

export interface FormSection {
  id: string;
  label: string;
}

export interface TypeFormDescriptor {
  type: NodeType;
  /** Label for the envelope `title` field ("Full name" for person, ...). */
  titleLabel: string;
  titlePlaceholder?: string;
  subtitleLabel?: string;
  sections: FormSection[];
  fields: FieldDescriptor[];
  edges: EdgeSubEditor[];
  /** Whose record this is. Absent for types that belong to no one (organization, skill). */
  subject?: SubjectDescriptor;
  envelope: {
    /** Show envelope start/end date fields. */
    dates: boolean;
    dateLabels?: { start?: string; end?: string };
    sensitivityDefault?: 'normal' | 'sensitive';
  };
}

export interface EdgeFormDescriptor {
  type: EdgeType;
  label: string;
  description: string;
  /** '*' = any node type. */
  srcTypes: NodeType[] | '*';
  dstTypes: NodeType[] | '*';
  fields: FieldDescriptor[];
}
