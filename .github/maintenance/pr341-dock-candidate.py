"""One-shot, exact-source build preparation and unreferenced candidate storage."""
import gzip
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import urllib.request

ROOT = Path('.')
OUT = ROOT / '.artifacts/dock-candidate'
META = ROOT / '.github/maintenance/pr341-dock-manifest.json'
MANIFEST = json.loads(META.read_text())
REPO = 'safal207/robys-coffee-house-demo'
BRANCH = 'feat/unified-order-flow'
GENERATED = set('app.js bootstrap-v2.js conversion.js featured-gallery.js social-offer.js discover-rotation.js discover-rotation-v2.js discover-rotation-v3.js index.html discover.html menu.html ru/coffee-gazipasa.html menu-app.js order-store.js order-shell.js order-launcher.js smart-choice/index.html smart-choice/app-v2.js smart-choice/cart-v2.js smart-choice/experiments-v2.js smart-choice/analytics-v2.js smart-choice/decision-trace-v2.js smart-choice/release-qa.js smart-choice/simulator-v2.js sw.js integrity-manifest.json'.split())

def git(*args):
    return subprocess.check_output(['git', *args], text=True).strip()

def sha256(data):
    return hashlib.sha256(data).hexdigest()

def bound_context():
    assert os.environ['GITHUB_REPOSITORY'] == REPO
    assert os.environ['GITHUB_REF'] == 'refs/heads/' + BRANCH
    assert git('rev-parse', 'HEAD') == os.environ['GITHUB_SHA']
    assert git('rev-parse', 'HEAD^') == '492e5a8090103d2d940a4183cc33c0da5ace210d'
    # The only follow-up source change is SHARE-001's content-bound cache assertion.
    assert git('rev-parse', 'HEAD:scripts/verify-menu-share.mjs') == '12a70d5cf7fc952f91c6ef7003a066125641ecfe'

def apply():
    bound_context()
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'checkout.sha').write_text(git('rev-parse', 'HEAD') + '\n')
    assert not git('status', '--porcelain', '--untracked-files=all'), 'Dirty input checkout'
    for name, expected in MANIFEST['existingBlobs'].items():
        raw = (ROOT / name).read_bytes()
        actual = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
        assert actual == expected, 'Base bytes changed: ' + name
    for name in MANIFEST['newFiles']:
        assert not (ROOT / name).exists(), 'New path already exists: ' + name
    raw = gzip.decompress((ROOT / '.github/maintenance/pr341-dock.patch.gz').read_bytes())
    assert sha256(raw) == MANIFEST['patchSha256'], 'Patch checksum mismatch'
    patch = OUT / 'reviewed-source.patch'
    patch.write_bytes(raw)
    subprocess.run(['git', 'apply', '--check', str(patch)], check=True)
    subprocess.run(['git', 'apply', str(patch)], check=True)
    for name, expected in MANIFEST['changedSha256'].items():
        assert sha256((ROOT / name).read_bytes()) == expected, 'Applied byte mismatch: ' + name
    subprocess.run(['git', 'add', '-N', '--', *MANIFEST['newFiles']], check=True)
    (OUT / 'applied-source.json').write_text(json.dumps(MANIFEST, indent=2) + '\n')

def store():
    bound_context()
    # No catalogue, price, persistence-domain, lockfile, budget, CSP-policy or baseline edits.
    subprocess.run(['git', 'diff', '--quiet', 'HEAD', '--', 'menu-catalog.js', 'src/order-store.ts', 'package-lock.json', 'scripts/verify-menu-share.mjs'], check=True)
    changed = git('diff', '--name-only', 'HEAD').splitlines()
    allowed = set(MANIFEST['changedSha256']) | GENERATED
    assert changed and set(changed) <= allowed, 'Unexpected changes: ' + repr(changed)
    assert set(MANIFEST['changedSha256']) <= set(changed), 'Missing source changes'
    for name, expected in MANIFEST['changedSha256'].items():
        if name != 'sw.js':
            assert sha256((ROOT / name).read_bytes()) == expected, 'Source changed after apply: ' + name
    subprocess.run(['git', 'diff', '--check'], check=True)
    (OUT / 'candidate.patch').write_bytes(subprocess.check_output(['git', 'diff', '--binary', 'HEAD']))
    subprocess.run(['git', 'add', '--', *changed], check=True)
    local_tree = git('write-tree')
    entries, hashes = [], {}
    for name in changed:
        raw = (ROOT / name).read_bytes()
        content = raw.decode('utf-8')
        entries.append({'path': name, 'mode': '100644', 'type': 'blob', 'content': content})
        hashes[name] = sha256(raw)
        target = OUT / 'candidate-files' / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(raw)
    def api(method, endpoint, body=None):
        data = None if body is None else json.dumps(body).encode()
        request = urllib.request.Request('https://api.github.com/repos/' + REPO + '/' + endpoint, data=data, method=method,
            headers={'Authorization': 'Bearer ' + os.environ['GH_TOKEN'], 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json'})
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.load(response)
    head = os.environ['GITHUB_SHA']
    pr = api('GET', 'pulls/341')
    assert pr['state'] == 'open' and not pr['merged'] and pr['draft']
    assert pr['head']['sha'] == head and pr['head']['ref'] == BRANCH and pr['head']['repo']['full_name'] == REPO, 'PR moved; do not overwrite'
    parent = api('GET', 'git/commits/' + head)
    tree = api('POST', 'git/trees', {'base_tree': parent['tree']['sha'], 'tree': entries})
    assert tree['sha'] == local_tree, 'Stored tree differs from tested bytes'
    commit = api('POST', 'git/commits', {'message': 'fix(order): avoid mobile dock overlap and share one catalogue module', 'tree': tree['sha'], 'parents': [head]})
    result = {'checkoutSha': head, 'sourceBase': MANIFEST['base'], 'candidateCommit': commit['sha'], 'candidateTree': tree['sha'], 'filesSha256': hashes,
        'runId': os.environ['GITHUB_RUN_ID'], 'branchUpdated': False, 'merged': False, 'deployed': False,
        'boundary': 'Unreferenced build/test candidate. Final-head CI, Lighthouse, visual and SW upgrade gates remain required.'}
    (OUT / 'candidate.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))

if __name__ == '__main__':
    if sys.argv[1:] == ['apply']:
        apply()
    elif sys.argv[1:] == ['store']:
        store()
    else:
        raise SystemExit('Expected apply or store')
