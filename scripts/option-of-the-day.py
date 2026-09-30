#!/usr/bin/env python3
"""Picks the option of the day for the front page from Valhalla's OpenAPI spec.

Usage: scripts/option-of-the-day.py [--spec path/to/newer/openapi.yaml] [--commit sha]

With --spec, that spec replaces the repository's openapi.yaml first, and an option that changed
between the two is picked. Otherwise, or when nothing changed, the pick is random. Only costing
options and location options take part.
"""
import argparse
import datetime
import html
import random
import re
import shutil
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
SPEC = ROOT / 'openapi.yaml'
PAGE = ROOT / 'index.html'
START = '<!-- option-of-the-day:start -->'
END = '<!-- option-of-the-day:end -->'
SUFFIX = 'CostingOptions'
# what an option is compared and shown by
FIELDS = ('type', 'default', 'minimum', 'maximum', 'enum', 'description')
# the coordinates themselves aren't options
NOT_OPTIONS = {'lat', 'lon'}


def ref_name(ref):
    return ref.rsplit('/', 1)[1]


def resolve(schemas, schema):
    """The properties of a schema, with its allOf parts and $refs merged in."""
    if '$ref' in schema:
        return resolve(schemas, schemas[ref_name(schema['$ref'])])
    properties = {}
    for part in schema.get('allOf', []):
        properties.update(resolve(schemas, part))
    properties.update(schema.get('properties', {}))
    return properties


def describe(schemas, spec):
    """The fields of one option, with a $ref (e.g. to the RoadClass enum) merged in."""
    if '$ref' in spec:
        spec = {**schemas[ref_name(spec['$ref'])], **{key: value for key, value in spec.items() if key != '$ref'}}
    option = {key: spec[key] for key in FIELDS if key in spec}
    if spec.get('type') == 'array':
        items = spec.get('items', {})
        option['type'] = f"array of {ref_name(items['$ref']) if '$ref' in items else items.get('type', 'values')}"
    option['description'] = ' '.join(str(spec.get('description', '')).split())
    return option


def extract(path):
    """Every costing and location option in a spec, by an id that is stable across versions."""
    schemas = yaml.safe_load(path.read_text())['components']['schemas']
    options = {}

    costings = {}
    for costing, ref in schemas[SUFFIX]['properties'].items():
        costings.setdefault(ref_name(ref['$ref']).removesuffix(SUFFIX), []).append(costing)
    base = resolve(schemas, schemas['Base' + SUFFIX])
    groups = [('Base', base, 'all costings')]
    for group, names in costings.items():
        own = {key: value for key, value in resolve(schemas, schemas[group + SUFFIX]).items() if base.get(key) != value}
        groups.append((group, own, ', '.join(names)))
    for group, properties, scope in groups:
        for name, spec in properties.items():
            options[f'{group}.{name}'] = {'name': name, 'scope': f'costing option · {scope}', **describe(schemas, spec)}

    for name, spec in resolve(schemas, schemas['Location']).items():
        if name in NOT_OPTIONS:
            continue
        if name == 'search_filter':
            for sub, sub_spec in resolve(schemas, spec).items():
                options[f'Location.{name}.{sub}'] = {'name': f'{name}.{sub}', 'scope': 'location option', **describe(schemas, sub_spec)}
        else:
            options[f'Location.{name}'] = {'name': name, 'scope': 'location option', **describe(schemas, spec)}
    return options


def changes(old, new):
    """What differs between two versions of an option, for the page."""
    notes = []
    for field in FIELDS:
        if old.get(field) == new.get(field):
            continue
        if field == 'description':
            notes.append('description updated')
        else:
            notes.append(f"{field}: {old.get(field, '–')} → {new.get(field, '–')}")
    return notes


def inline(text):
    """The Markdown the spec uses in descriptions, as HTML."""
    text = html.escape(text, quote=False)
    text = re.sub(r'`([^`]+)`', r'<code>\1</code>', text)
    text = re.sub(r'\*\*([^*]+)\*\*', r'<b>\1</b>', text)
    return re.sub(r'\[([^\]]+)\]\((https?://[^)\s]+)\)', r'<a href="\2">\1</a>', text)


def value(option, field):
    if field not in option:
        return '–'
    return html.escape(', '.join(map(str, option[field])) if isinstance(option[field], list) else str(option[field]).lower() if isinstance(option[field], bool) else str(option[field]))


def render(option_id, option, badge, notes, commit):
    rows = [('type', 'type'), ('default', 'default'), ('min', 'minimum'), ('max', 'maximum')]
    if 'enum' in option:
        rows.append(('values', 'enum'))
    details = ''.join(f'<dt>{label}</dt><dd>{value(option, field)}</dd>' for label, field in rows)
    badge_html = f' <span class="ootd-badge">{badge}</span>' if badge else ''
    notes_html = ''.join(f'<li>{html.escape(note)}</li>' for note in notes)
    source = f' · valhalla@{html.escape(commit)}' if commit else ''
    return f'''{START}
    <section id="option-of-the-day" data-option="{html.escape(option_id)}">
      <h2>Costing option of the day</h2>
      <div class="ootd">
        <div class="ootd-head"><code>{html.escape(option['name'])}</code>{badge_html}</div>
        <small class="ootd-scope">{html.escape(option['scope'])}</small>
        {f'<ul class="ootd-changes">{notes_html}</ul>' if notes else ''}
        <dl>{details}</dl>
        <p>{inline(option['description']) or 'No description.'}</p>
        <small class="ootd-source">{datetime.date.today().isoformat()}{source}</small>
      </div>
    </section>
    {END}'''


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--spec', type=Path, help='a newer openapi.yaml to take over')
    parser.add_argument('--commit', help='the Valhalla commit the spec comes from, shown on the page')
    args = parser.parse_args()

    old = extract(SPEC)
    if args.spec and args.spec.resolve() != SPEC:
        shutil.copyfile(args.spec, SPEC)
    new = extract(SPEC)

    page = PAGE.read_text()
    current = re.search(r'data-option="([^"]*)"', page)
    changed = [option_id for option_id, option in new.items() if old.get(option_id) != option]
    if changed:
        option_id = random.choice(changed)
        badge = 'changed in Valhalla' if option_id in old else 'new in Valhalla'
        notes = changes(old[option_id], new[option_id]) if option_id in old else []
    else:
        # not the same as yesterday
        option_id = random.choice([option_id for option_id in new if not current or option_id != html.unescape(current.group(1))])
        badge, notes = None, []

    section = render(option_id, new[option_id], badge, notes, args.commit)
    pattern = re.compile(re.escape(START) + '.*?' + re.escape(END), re.S)
    if not pattern.search(page):
        raise SystemExit(f'{PAGE} has no {START} … {END} markers')
    PAGE.write_text(pattern.sub(lambda _: section, page))
    print(f'{option_id}{f" ({badge})" if badge else ""}')


if __name__ == '__main__':
    main()
