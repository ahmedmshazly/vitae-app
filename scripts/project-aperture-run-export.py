#!/usr/bin/env python3
"""Project an Aperture connections_deep export into vitae.graph.bundle JSON.

Filters (locked by import plan):
  * Only people with is_connection == "yes"
  * Strip similar_profiles (do not invent lookalike people)
  * Emit KNOWS from self → each connection (injected after Aperture build.
    Aperture's EdgeType enum does not include KNOWS)

Usage (from the Vitae repo root):

  APERTURE_CONSOLE=/path/to/aperture/apps/console \\
  python scripts/project-aperture-run-export.py \\
    --export=snapshots/aperture-run-export \\
    --self-identity-key=linkedin:person:jordan-kim \\
    --self-title='Jordan Kim'

  # Or omit self-identity-key and pass --self-title only (synthetic key).

Chunks automatically if a single bundle would exceed --max-bytes (default 14 MiB).
"""

from __future__ import annotations

import argparse
import json
import sys
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def _load_fathom(aperture_console: Path) -> None:
    console = str(aperture_console.resolve())
    if console not in sys.path:
        sys.path.insert(0, console)
    # Import after path fix.
    global BundleBuilder, project_person  # noqa: PLW0603
    from fathom.api.services.vitae_export import BundleBuilder, project_person  # type: ignore


def _profile_id(person: dict[str, Any]) -> str | None:
    for key in ("profile_id", "id", "urn"):
        value = person.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _strip_lookalikes(payload: dict[str, Any]) -> dict[str, Any]:
    clean = deepcopy(payload)
    clean["similar_profiles"] = []
    # Interests may nest people, keep only org buckets the projector uses.
    interests = clean.get("interests")
    if isinstance(interests, dict):
        clean["interests"] = {
            "companies": interests.get("companies") or [],
            "groups": interests.get("groups") or [],
            "schools": interests.get("schools") or [],
        }
    return _sanitize_collections(clean)


def _has_text(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _sanitize_collections(payload: dict[str, Any]) -> dict[str, Any]:
    """Drop / fix rows that would mint illegal identity keys (e.g. linkedin:company:)."""
    from fathom.api.services.vitae_export import slug  # type: ignore

    def usable_org_name(value: Any) -> str | None:
        text = value.strip() if isinstance(value, str) and value.strip() else None
        if not text:
            return None
        # Non-Latin names can slug to "", company_key then becomes linkedin:company:
        if not slug(text):
            return None
        return text

    def clean_exp(rows: Any) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        if not isinstance(rows, list):
            return out
        for item in rows:
            if not isinstance(item, dict):
                continue
            title = item.get("title") or item.get("role")
            if not _has_text(title):
                continue
            fixed = dict(item)
            company = usable_org_name(item.get("company")) or usable_org_name(
                item.get("organization")
            )
            fixed["company"] = company
            fixed["organization"] = company
            out.append(fixed)
        return out

    payload["experiences"] = clean_exp(payload.get("experiences"))
    payload["volunteering"] = clean_exp(payload.get("volunteering"))

    schools = payload.get("schools")
    if isinstance(schools, list):
        cleaned_schools: list[dict[str, Any]] = []
        for s in schools:
            if not isinstance(s, dict):
                continue
            name = usable_org_name(s.get("school") or s.get("name") or s.get("title"))
            if not name:
                continue
            fixed = dict(s)
            fixed["school"] = name
            cleaned_schools.append(fixed)
        payload["schools"] = cleaned_schools

    orgs = payload.get("organizations")
    if isinstance(orgs, list):
        cleaned_orgs: list[dict[str, Any]] = []
        for o in orgs:
            if not isinstance(o, dict):
                continue
            name = usable_org_name(o.get("title") or o.get("name"))
            if not name:
                continue
            fixed = dict(o)
            fixed["title"] = name
            cleaned_orgs.append(fixed)
        payload["organizations"] = cleaned_orgs

    interests = payload.get("interests")
    if isinstance(interests, dict):
        for bucket in ("companies", "groups", "schools"):
            rows = interests.get(bucket) or []
            if not isinstance(rows, list):
                interests[bucket] = []
                continue
            keep = []
            for item in rows:
                if not isinstance(item, dict):
                    continue
                name = usable_org_name(item.get("name"))
                if not name:
                    continue
                keep.append({**item, "name": name})
            interests[bucket] = keep

    skills = payload.get("skills")
    if isinstance(skills, list):
        payload["skills"] = [
            s
            for s in skills
            if isinstance(s, dict) and usable_org_name(s.get("name"))  # same slug rule
        ]
        # rewrite names to stripped text
        fixed_skills = []
        for s in payload["skills"]:
            name = usable_org_name(s.get("name"))
            if name:
                fixed_skills.append({**s, "name": name})
        payload["skills"] = fixed_skills

    languages = payload.get("languages")
    if isinstance(languages, list):
        payload["languages"] = [
            lang
            for lang in languages
            if (isinstance(lang, str) and usable_org_name(lang))
            or (isinstance(lang, dict) and usable_org_name(lang.get("name")))
        ]

    return payload


def _prune_nulls(value: Any) -> Any:
    """Zod optional fields reject JSON null, drop nulls recursively."""
    if isinstance(value, dict):
        return {k: _prune_nulls(v) for k, v in value.items() if v is not None}
    if isinstance(value, list):
        return [_prune_nulls(v) for v in value]
    return value


def _bundle_dict(builder: Any, *, run_id: str | None) -> dict[str, Any]:
    bundle = builder.build()
    data = _prune_nulls(bundle.model_dump(mode="json", exclude_none=True))
    # Ensure exported_at is timezone-aware ISO (Zod datetime with offset).
    exported = str(data.get("source", {}).get("exported_at", ""))
    if exported and not (
        exported.endswith("Z") or "+" in exported[10:] or exported.count("-") >= 3
    ):
        data.setdefault("source", {})["exported_at"] = datetime.now(timezone.utc).isoformat()
    if run_id:
        data.setdefault("source", {})["run_id"] = run_id
    return data


def _inject_knows(
    data: dict[str, Any],
    *,
    self_ref: str,
    connection_refs: list[str],
    source_ref: str | None,
) -> None:
    existing = {(e["type"], e["src"], e["dst"]) for e in data.get("edges", [])}
    for dst in connection_refs:
        key = ("KNOWS", self_ref, dst)
        if key in existing or self_ref == dst:
            continue
        edge: dict[str, Any] = {
            "type": "KNOWS",
            "src": self_ref,
            "dst": dst,
            "props": {},
            "source": "import_aperture",
            "confidence": 0.9,
        }
        if source_ref:
            edge["source_ref"] = source_ref
        data["edges"].append(edge)
        existing.add(key)


def _counts(data: dict[str, Any]) -> dict[str, int]:
    by_type: dict[str, int] = {}
    for node in data.get("nodes", []):
        t = str(node.get("type"))
        by_type[t] = by_type.get(t, 0) + 1
    by_type["edges"] = len(data.get("edges", []))
    return by_type


def _write(path: Path, data: dict[str, Any]) -> int:
    text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return len(text.encode("utf-8"))


def project_chunk(
    people: list[dict[str, Any]],
    *,
    run_id: str | None,
    self_identity_key: str,
    self_title: str,
    self_headline: str | None,
) -> dict[str, Any]:
    b = BundleBuilder(system="aperture", run_id=run_id)
    source_ref = f"aperture:run:{run_id}" if run_id else None

    self_ref = b.node(
        identity_key=self_identity_key,
        type="person",
        title=self_title,
        subtitle=self_headline,
        confidence=1.0,
        props={"is_self": True},
    )

    connection_refs: list[str] = []
    for person in people:
        pid = _profile_id(person)
        if not pid:
            continue
        payload = _strip_lookalikes(person)
        ref = project_person(
            b,
            profile_id=pid,
            name=person.get("name") if isinstance(person.get("name"), str) else None,
            headline=person.get("headline") if isinstance(person.get("headline"), str) else None,
            url=(
                person.get("profile_link")
                if isinstance(person.get("profile_link"), str)
                else person.get("url") if isinstance(person.get("url"), str) else None
            ),
            payload=payload,
        )
        connection_refs.append(ref)

    data = _bundle_dict(b, run_id=run_id)
    _inject_knows(
        data,
        self_ref=self_ref,
        connection_refs=connection_refs,
        source_ref=source_ref,
    )
    return _prune_nulls(data)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--export",
        type=Path,
        default=Path("snapshots/aperture-run-export"),
        help="Directory containing people.json + manifest.json",
    )
    parser.add_argument(
        "--aperture-console",
        type=Path,
        default=(
            Path(__import__("os").environ["APERTURE_CONSOLE"]
            if __import__("os").environ.get("APERTURE_CONSOLE")
            else None
        ),
        help="Path to Aperture's apps/console directory. Defaults to APERTURE_CONSOLE.",
    )
    parser.add_argument("--self-identity-key", type=str, default=None)
    parser.add_argument("--self-title", type=str, default="Jordan Kim")
    parser.add_argument("--self-headline", type=str, default=None)
    parser.add_argument("--chunk-size", type=int, default=40)
    parser.add_argument("--max-bytes", type=int, default=14 * 1024 * 1024)
    parser.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Output path (default: <export>/vitae.graph.bundle.json)",
    )
    args = parser.parse_args()

    if args.aperture_console is None:
        parser.error("--aperture-console or APERTURE_CONSOLE is required")

    export_dir: Path = args.export
    people_path = export_dir / "people.json"
    manifest_path = export_dir / "manifest.json"
    if not people_path.is_file():
        print(f"missing {people_path}", file=sys.stderr)
        return 1

    _load_fathom(args.aperture_console)

    people_raw = json.loads(people_path.read_text(encoding="utf-8"))
    if not isinstance(people_raw, list):
        print("people.json must be a JSON array", file=sys.stderr)
        return 1

    connections = [
        p
        for p in people_raw
        if isinstance(p, dict) and str(p.get("is_connection", "")).lower() == "yes"
    ]
    run_id = None
    if manifest_path.is_file():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        run_id = manifest.get("run_id") if isinstance(manifest, dict) else None

    self_key = args.self_identity_key or "linkedin:person:self"
    print(
        f"people.json={len(people_raw)} connections={len(connections)} "
        f"run_id={run_id} self={self_key!r}"
    )

    out_base = args.out or (export_dir / "vitae.graph.bundle.json")
    chunks: list[list[dict[str, Any]]] = []
    if not connections:
        print("no connections to project", file=sys.stderr)
        return 1

    # First try one bundle; split if oversized.
    full = project_chunk(
        connections,
        run_id=run_id,
        self_identity_key=self_key,
        self_title=args.self_title,
        self_headline=args.self_headline,
    )
    probe = json.dumps(full, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if len(probe) <= args.max_bytes:
        chunks = [connections]
    else:
        size = max(1, args.chunk_size)
        chunks = [connections[i : i + size] for i in range(0, len(connections), size)]
        print(
            f"single bundle would be {len(probe)} bytes > {args.max_bytes}; "
            f"splitting into {len(chunks)} chunks of ≤{size}"
        )

    written: list[Path] = []
    for index, chunk in enumerate(chunks):
        data = project_chunk(
            chunk,
            run_id=f"{run_id}:{index}" if run_id and len(chunks) > 1 else run_id,
            self_identity_key=self_key,
            self_title=args.self_title,
            self_headline=args.self_headline,
        )
        path = (
            out_base
            if len(chunks) == 1
            else out_base.with_name(f"{out_base.stem}.{index:02d}{out_base.suffix}")
        )
        nbytes = _write(path, data)
        written.append(path)
        counts = _counts(data)
        print(
            f"wrote {path} ({nbytes} bytes) nodes={len(data['nodes'])} "
            f"edges={counts['edges']} people={counts.get('person', 0)} "
            f"orgs={counts.get('organization', 0)} roles={counts.get('role', 0)}"
        )
        if nbytes > args.max_bytes:
            print(
                f"WARNING: {path} still exceeds max-bytes ({nbytes} > {args.max_bytes}); "
                "reduce --chunk-size",
                file=sys.stderr,
            )
            return 1

    print(f"done: {len(written)} bundle(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
