#!/usr/bin/env python3
"""Publish tagged releases using the GitHub Actions temporary repository token."""
import argparse
import hashlib
import io
import json
import os
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSIONS = ('1.0.0', '1.0.1', '1.1.0', '1.1.1', '1.2.0')
CURRENT = ('1.1.1', '1.2.0')
PLUGIN_ID = 'keep-reader-ready@local.invalid'

def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)

def gh_json(args, missing_ok=False):
    result = subprocess.run(['gh', *args], text=True, capture_output=True)
    if result.returncode:
        if missing_ok and ('Not Found' in result.stderr or 'release not found' in result.stderr):
            return None
        raise RuntimeError(result.stderr.strip())
    return json.loads(result.stdout)

def build_version(version, directory):
    if version not in CURRENT:
        target = directory / 'assets'
        target.mkdir()
        for src in sorted((ROOT/'archive/releases'/version).glob('*')):
            if src.is_file(): (target/src.name).write_bytes(src.read_bytes())
        return target
    source = run(['git', 'archive', 'v'+version], cwd=ROOT, capture_output=True).stdout
    with tarfile.open(fileobj=io.BytesIO(source)) as archive:
        archive.extractall(directory, filter='data')
    run([sys.executable, 'build.py'], cwd=directory)
    return directory/'dist'

def publish(version, assets, repository):
    tag = 'v'+version
    existing = gh_json(['api', f'repos/{repository}/releases/tags/{tag}'], missing_ok=True)
    files = sorted(p for p in assets.iterdir() if p.is_file())
    if not existing:
        title = f'{tag} — '+('English / 简体中文' if version in CURRENT else 'Historical archive / 历史档案')
        command = ['gh', 'release', 'create', tag, '--verify-tag', '--title', title,
                   '--notes-file', str(ROOT/'docs/release-notes'/(tag+'.md')),
                   '--latest' if version=='1.2.0' else '--latest=false']
        if version not in CURRENT: command.append('--prerelease')
        run(command + [str(p) for p in files], cwd=ROOT)
        return
    by_name = {asset['name']: asset for asset in existing['assets']}
    for path in files:
        if path.name not in by_name:
            run(['gh','release','upload',tag,str(path)],cwd=ROOT)
            continue
        with tempfile.TemporaryDirectory() as temp:
            run(['gh','release','download',tag,'--pattern',path.name,'--dir',temp],cwd=ROOT)
            if hashlib.sha256((Path(temp)/path.name).read_bytes()).digest() != hashlib.sha256(path.read_bytes()).digest():
                raise RuntimeError('Refusing to overwrite a different published asset: '+path.name)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--version', choices=('all',*CURRENT), default='all')
    args=parser.parse_args()
    repository=os.environ.get('GH_REPO','Hanson-Wang-chn/zotero-keep-reader-ready')
    versions=VERSIONS if args.version=='all' else (args.version,)
    updates={}
    for locale in ('en-US','zh-CN'):
        path=ROOT/'updates'/(locale+'.json')
        updates[locale]=json.loads(path.read_text()) if path.exists() else {'addons':{PLUGIN_ID:{'updates':[]}}}
    with tempfile.TemporaryDirectory() as temp:
        for version in versions:
            directory=Path(temp)/version
            directory.mkdir()
            assets=build_version(version,directory)
            if not any(assets.glob('*.xpi')): raise RuntimeError('Missing installer: '+version)
            publish(version,assets,repository)
            if version in CURRENT:
                for locale in updates:
                    filename=f'keep-reader-ready-{version}-{locale}.xpi'
                    digest=hashlib.sha256((assets/filename).read_bytes()).hexdigest()
                    entry={'version':version,'update_link':f'https://github.com/{repository}/releases/download/v{version}/{filename}',
                           'update_hash':'sha256:'+digest,'applications':{'zotero':{'strict_min_version':'10.0.6','strict_max_version':'10.0.*'}}}
                    entries=updates[locale]['addons'][PLUGIN_ID]['updates']
                    entries[:]=[item for item in entries if item['version']!=version]+[entry]
                    entries.sort(key=lambda item:tuple(map(int,item['version'].split('.'))))
    (ROOT/'updates').mkdir(exist_ok=True)
    for locale,data in updates.items():
        (ROOT/'updates'/(locale+'.json')).write_text(json.dumps(data,indent=2)+'\n')
    run(['git','add','updates'],cwd=ROOT)
    if subprocess.run(['git','diff','--cached','--quiet'],cwd=ROOT).returncode:
        run(['git','config','user.name','github-actions[bot]'],cwd=ROOT)
        run(['git','config','user.email','41898282+github-actions[bot]@users.noreply.github.com'],cwd=ROOT)
        run(['git','commit','-m','Update language-specific plugin release channels'],cwd=ROOT)
        run(['git','push','origin','HEAD:main'],cwd=ROOT)

if __name__=='__main__':
    main()
