r"""Export and import guided tour templates as JSON fixtures.

Export once from the server where the template was authored, keep the JSON
(and the audio folder) in the ansible repo, and import it on every server:

    sonari-guided-tour export --project "default yolobat workshop-awst26-bat09" \\
        --variant bat -o bat.json
    sonari-guided-tour import bat.json

Import is idempotent: an unchanged fixture prints ``unchanged`` and exits 0
without touching the database.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

from pydantic import ValidationError
from sqlalchemy import select

from sonari import models
from sonari.services.guided_tour import get_template_project
from sonari.services.guided_tour_fixture import (
    GuidedTourFixture,
    export_template_fixture,
    import_template_fixture,
)
from sonari.system.database import create_async_db_engine, get_async_session, get_database_url
from sonari.system.settings import Settings, get_settings

__all__ = ["main", "parse_args", "run"]


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="sonari-guided-tour",
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sub = p.add_subparsers(dest="command", required=True)

    exp = sub.add_parser("export", help="Write an annotation project as a guided tour fixture")
    source = exp.add_mutually_exclusive_group(required=True)
    source.add_argument("--project", help="Annotation project name")
    source.add_argument("--project-id", type=int, help="Annotation project id")
    source.add_argument(
        "--template",
        action="store_true",
        help="Export this server's existing template for --variant",
    )
    exp.add_argument("--variant", required=True, choices=["bird", "bat"])
    exp.add_argument("-o", "--output", type=Path, help="Output file (default: stdout)")

    imp = sub.add_parser("import", help="Replace a guided tour template from a fixture")
    imp.add_argument("fixture", type=Path, help="Fixture JSON file")
    imp.add_argument(
        "--audio-dir",
        type=Path,
        help="Root audio directory (default: SONARI_AUDIO_DIR from settings)",
    )
    imp.add_argument(
        "--username",
        help="User recorded as creator of the template's events and new tags (default: none)",
    )
    imp.add_argument("--force", action="store_true", help="Re-import even if the fixture is unchanged")
    imp.add_argument("--dry-run", action="store_true", help="Validate and report, then roll back")

    return p.parse_args(argv)


async def _find_project_id(session, args: argparse.Namespace) -> int:
    if args.project_id is not None:
        return args.project_id
    if args.template:
        template = await get_template_project(session, args.variant)
        if template is None:
            raise ValueError(f"No {args.variant} template on this server.")
        return template.id
    project_id = (
        await session.execute(
            select(models.AnnotationProject.id).where(models.AnnotationProject.name == args.project),
        )
    ).scalar_one_or_none()
    if project_id is None:
        raise ValueError(f"Annotation project not found: {args.project!r}")
    return project_id


async def _export(session, args: argparse.Namespace) -> int:
    project_id = await _find_project_id(session, args)
    fixture = await export_template_fixture(session, project_id, args.variant)
    text = json.dumps(fixture.model_dump(mode="json"), indent=2, ensure_ascii=False) + "\n"
    if args.output:
        args.output.write_text(text, encoding="utf-8")
        events = sum(len(t.sound_event_annotations) for t in fixture.tasks)
        print(
            f"Wrote {args.output}: {len(fixture.tasks)} tasks, {events} sound events, "
            f"{len(fixture.recordings)} recordings in {fixture.audio_folder}/",
            file=sys.stderr,
        )
    else:
        sys.stdout.write(text)
    return 0


async def _import(session, args: argparse.Namespace, settings: Settings) -> int:
    try:
        fixture = GuidedTourFixture.model_validate_json(args.fixture.read_text(encoding="utf-8"))
    except (OSError, ValidationError) as exc:
        print(f"Invalid fixture {args.fixture}: {exc}", file=sys.stderr)
        return 1

    created_by_id = None
    if args.username:
        created_by_id = (
            await session.execute(select(models.User.id).where(models.User.username == args.username))
        ).scalar_one_or_none()
        if created_by_id is None:
            print(f"User not found: {args.username!r}", file=sys.stderr)
            return 1

    result = await import_template_fixture(
        session,
        fixture,
        audio_dir=args.audio_dir or settings.audio_dir,
        created_by_id=created_by_id,
        force=args.force,
    )
    for warning in result.warnings:
        print(f"warning: {warning}", file=sys.stderr)

    if result.status == "unchanged":
        print(f"{fixture.variant}: unchanged (template {result.template_id}, sha256 {result.checksum[:12]})")
        return 0

    summary = (
        f"{fixture.variant}: {'would import' if args.dry_run else 'imported'} "
        f"{result.tasks} tasks, {result.sound_events} sound events "
        f"(registered {result.registered_recordings} recordings, created {result.created_tags} tags) "
        f"into template {result.template_id}"
    )
    if args.dry_run:
        await session.rollback()
    else:
        await session.commit()
    print(summary)
    return 0


async def run(settings: Settings, args: argparse.Namespace) -> int:
    engine = create_async_db_engine(get_database_url(settings))
    try:
        async with get_async_session(engine) as session:
            try:
                if args.command == "export":
                    return await _export(session, args)
                return await _import(session, args, settings)
            except ValueError as exc:
                await session.rollback()
                print(f"Error: {exc}", file=sys.stderr)
                return 1
    finally:
        await engine.dispose()


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    return asyncio.run(run(get_settings(), args))


if __name__ == "__main__":
    raise SystemExit(main())
