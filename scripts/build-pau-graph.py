"""Build a Graphify graph from reviewed public facts, without LLM extraction.

Development dependency: graphifyy==0.9.95. Run after scripts/render.py.
The deployed Node reader traverses this exported graph; no Python runtime is needed.
"""
from pathlib import Path
import hashlib
import json
from graphify.build import build_from_json
from graphify.validate import validate_extraction
from graphify.export import to_json

ROOT = Path(__file__).resolve().parents[1]
source = ROOT / 'dist/assets/pau-knowledge.json'
knowledge = json.loads(source.read_text(encoding='utf-8'))
source_file = 'dist/assets/pau-knowledge.json'
extraction = {
    'nodes': [dict(id=f['id'], label=f['title'], file_type='concept',
                   source_file=source_file, fact_id=f['id'], text=f['text'], href=f['href'])
              for f in knowledge['facts']],
    'edges': [dict(source=r['from'], target=r['to'], relation=r['relation'],
                   confidence='EXTRACTED', source_file=source_file)
              for r in knowledge['relationships']],
}
errors = validate_extraction(extraction)
assert not errors, errors
graph = build_from_json(extraction, directed=True, root=ROOT, dedup=False)
graph.graph['source_sha256'] = hashlib.sha256(json.dumps(knowledge, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')).hexdigest()
graph.graph['source_version'] = knowledge['version']
graph.graph['scope'] = 'Reviewed public Pau portfolio facts only'
graph.graph['build_method'] = 'Graphify build_from_json; explicit curated facts and relationships'
assert graph.number_of_nodes() == len(knowledge['facts'])
assert to_json(graph, {}, str(ROOT / 'dist/assets/pau-graph.json'), force=True)
print(f'Graphify export: {graph.number_of_nodes()} nodes, {graph.number_of_edges()} edges')
