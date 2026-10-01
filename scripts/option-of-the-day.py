#!/usr/bin/env python3
"""Picks the option of the day for the front page from Valhalla's OpenAPI spec.

Usage: scripts/option-of-the-day.py [--spec path/to/newer/openapi.yaml] [--option ID]
       scripts/option-of-the-day.py --update-workflow

With --spec, that spec replaces the repository's openapi.yaml first, and an option that changed
between the two is picked. Otherwise, or when nothing changed, the pick is random. Costing options,
location options and the top-level options of the requests take part. --option features that option
instead, as picked in the workflow's run form.

The run form lists every option to pick from. --update-workflow writes that list into the workflow from
the current spec; the workflow can't do it itself, as its token may not change workflow files.
"""
import argparse
import html
import json
import random
import re
import shutil
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
SPEC = ROOT / 'openapi.yaml'
PAGE = ROOT / 'index.html'
WORKFLOW = ROOT / '.github/workflows/option-of-the-day.yml'
# what the run form of the workflow offers besides the options, and means "pick one as usual"
RANDOM = '(random)'
START = '<!-- option-of-the-day:start -->'
END = '<!-- option-of-the-day:end -->'
SUFFIX = 'CostingOptions'
# what an option is compared and shown by
FIELDS = ('type', 'default', 'minimum', 'maximum', 'enum', 'description')
# the coordinates themselves aren't options
NOT_OPTIONS = {'lat', 'lon'}
# what a request is about rather than how it's answered, and the costing options, which count on their own
NOT_REQUEST_OPTIONS = {'locations', 'sources', 'targets', 'shape', 'encoded_polyline', 'costing_options'}


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
    if 'oneOf' in spec and 'type' not in spec:
        option['type'] = ' or '.join(part.get('type', ref_name(part.get('$ref', '#/value'))) for part in spec['oneOf'])
    if spec.get('type') == 'array':
        items = spec.get('items', {})
        option['type'] = f"array of {ref_name(items['$ref']) if '$ref' in items else items.get('type', 'values')}"
    option['description'] = ' '.join(str(spec.get('description', '')).split())
    return option


def extract(path):
    """Every costing, location and request option in a spec, by an id that is stable across versions."""
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

    # an option the endpoints share, in the same shape, is one option
    endpoints = {}
    for path, operations in spec_paths(path).items():
        body = operations.get('post', {}).get('requestBody', {}).get('content', {}).get('application/json', {}).get('schema', {})
        if '$ref' in body:
            endpoints[path] = resolve(schemas, body)
    shared = {}
    for path, properties in endpoints.items():
        for name, spec in properties.items():
            if name not in NOT_REQUEST_OPTIONS:
                shared.setdefault((name, repr(spec)), (spec, []))[1].append(path)
    variants = {}
    for name, _ in shared:
        variants[name] = variants.get(name, 0) + 1
    for (name, _), (spec, paths) in shared.items():
        option_id = f'Request.{name}' if variants[name] == 1 else f"Request.{name}.{'+'.join(paths)}"
        options[option_id] = {'name': name, 'scope': f'request option · {endpoint_scope(paths, list(endpoints))}', **describe(schemas, spec)}
    return options


def spec_paths(path):
    return yaml.safe_load(path.read_text())['paths']


def endpoint_scope(paths, everything):
    if paths == everything:
        return 'all endpoints'
    missing = [path for path in everything if path not in paths]
    if len(missing) < len(paths):
        return f"all endpoints but {', '.join(missing)}"
    return ', '.join(paths)


def changes(old, new):
    """What differs between two versions of an option, for the page."""
    notes = []
    for field in FIELDS:
        if old.get(field) == new.get(field):
            continue
        if field == 'description':
            notes.append('description updated')
        elif field == 'enum':
            added = [str(item) for item in new.get('enum', []) if item not in old.get('enum', [])]
            removed = [str(item) for item in old.get('enum', []) if item not in new.get('enum', [])]
            notes += [f'{label}: {", ".join(items)}' for label, items in (('new values', added), ('values removed', removed)) if items]
        else:
            notes.append(f"{field}: {old.get(field, '–')} → {new.get(field, '–')}")
    return notes


def inline(text):
    """The Markdown the spec uses in descriptions, as HTML."""
    text = html.escape(text, quote=False)
    text = re.sub(r'`([^`]+)`', r'<code class="wp-code">\1</code>', text)
    text = re.sub(r'\*\*([^*]+)\*\*', r'<b>\1</b>', text)
    return re.sub(r'\[([^\]]+)\]\((https?://[^)\s]+)\)', r'<a class="wp-link" href="\2">\1</a>', text)


def value(option, field):
    if isinstance(option[field], bool):
        return str(option[field]).lower()
    return html.escape(str(option[field]))


# the info icon of the design system, for the note on what changed
INFO_ICON = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" '
             'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5v.5"/></svg>')


def render(option_id, option, badge, notes):
    kind, _, costings = option['scope'].partition(' · ')
    scope = f'<span class="wp-badge wp-badge--plain">{html.escape(kind)}</span>' + (f'<span class="caption">for {html.escape(costings)}</span>' if costings else '')
    # type and default always, as "no default" says something too; the range only when there is one
    facts = [('type', option.get('type', '–')), ('default', value(option, 'default') if 'default' in option else '–')]
    facts += [(label, value(option, field)) for label, field in (('min', 'minimum'), ('max', 'maximum')) if field in option]
    facts_html = ''.join(f'<div class="wp-stat"><span class="wp-stat-label">{label}</span><span class="code">{text}</span></div>' for label, text in facts)
    values_html = ''.join(f'<span class="wp-tag">{html.escape(str(item))}</span>' for item in option.get('enum', []))
    badge_html = f'<span class="wp-badge wp-badge--magenta">{badge}</span>' if badge else ''
    notes_html = ''.join(f'<p>{html.escape(note)}</p>' for note in notes)
    return f'''{START}
      <section id="option-of-the-day" class="wp-card ootd" data-option="{html.escape(option_id)}">
        <h2 class="heading">Option of the Day</h2>
        <div class="ootd-name"><code class="stat">{html.escape(option['name'])}</code>{badge_html}</div>
        <div class="ootd-scope">{scope}</div>
        {f'<div class="wp-callout" role="note">{INFO_ICON}<div>{notes_html}</div></div>' if notes else ''}
        <p class="body">{inline(option['description']) or 'No description.'}</p>
        <div class="wp-stats">{facts_html}</div>
        {f'<div class="ootd-values"><small class="caption">one of</small>{values_html}</div>' if values_html else ''}
      </section>
      {END}'''


# the list of options in the workflow's run form sits between these lines
LIST_START = '# option ids:start'
LIST_END = '# option ids:end'


def update_workflow(options):
    text = WORKFLOW.read_text()
    start = text.index(LIST_START)
    end = text.index(LIST_END)
    indent = text[text.rindex('\n', 0, start) + 1:start]
    items = ''.join(f"{indent}- {json.dumps(option_id)}\n" for option_id in [RANDOM, *sorted(options)])
    WORKFLOW.write_text(text[:start] + LIST_START + '\n' + items + indent + text[end:])


def workflow_options():
    text = WORKFLOW.read_text()
    block = text[text.index(LIST_START):text.index(LIST_END)]
    return {json.loads(line.strip()[2:]) for line in block.splitlines()[1:] if line.strip().startswith('- ')} - {RANDOM}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--spec', type=Path, help='a newer openapi.yaml to take over')
    parser.add_argument('--option', help=f'the id of the option to feature; empty or {RANDOM} picks one as usual')
    parser.add_argument('--update-workflow', action='store_true', help="write the options of the current spec into the workflow's run form")
    args = parser.parse_args()

    if args.update_workflow:
        update_workflow(extract(SPEC))
        return

    old = extract(SPEC)
    if args.spec and args.spec.resolve() != SPEC:
        shutil.copyfile(args.spec, SPEC)
    new = extract(SPEC)

    page = PAGE.read_text()
    current = re.search(r'data-option="([^"]*)"', page)
    changed = [option_id for option_id, option in new.items() if old.get(option_id) != option]
    if set(new) != workflow_options():
        # shown on the run in GitHub
        print('::warning::The option picker of the workflow is out of date; run scripts/option-of-the-day.py --update-workflow and commit the workflow.')
    if args.option and args.option != RANDOM:
        if args.option not in new:
            raise SystemExit(f'There is no option {args.option} in the spec.')
        option_id = args.option
        badge = None if option_id not in changed else 'changed in Valhalla' if option_id in old else 'new in Valhalla'
        notes = changes(old[option_id], new[option_id]) if badge and option_id in old else []
    elif changed:
        option_id = random.choice(changed)
        badge = 'changed in Valhalla' if option_id in old else 'new in Valhalla'
        notes = changes(old[option_id], new[option_id]) if option_id in old else []
    else:
        # not the same as yesterday
        option_id = random.choice([option_id for option_id in new if not current or option_id != html.unescape(current.group(1))])
        badge, notes = None, []

    # the optional parts leave empty lines behind
    section = '\n'.join(line for line in render(option_id, new[option_id], badge, notes).splitlines() if line.strip())
    pattern = re.compile(re.escape(START) + '.*?' + re.escape(END), re.S)
    if not pattern.search(page):
        raise SystemExit(f'{PAGE} has no {START} … {END} markers')
    PAGE.write_text(pattern.sub(lambda _: section, page))
    print(f'{option_id}{f" ({badge})" if badge else ""}')


if __name__ == '__main__':
    main()
