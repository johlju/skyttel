"""Synthetic state used only inside the isolated devcontainer lifecycle test."""

import hashlib
import json
from pathlib import Path
import shutil
import sqlite3
import sys
import tomllib


HOME = Path.home()
BUNDLE = Path('/workspace/.devcontainer-test')
DATABASE = Path('/data/skyttel.sqlite')
CONFIG = HOME / '.codex/config.toml'
MARKERS = [
    HOME / path / 'persistence-sentinel.txt'
    for path in (
        '.codex/sqlite', '.codex/tmp', '.codex/sessions', '.codex/plugins',
        '.codex/skills', '.codex/rules', '.config', '.vscode-server', 'worktrees',
    )
] + [Path('/workspace/node_modules/persistence-sentinel.txt')]
PERSONAL = '''model = "personal-sentinel"
approval_policy = "on-request"
default_permissions = ":read-only"
[plugins.plugin-management]
enabled = true
[[skills.config]]
path = "/synthetic/skills/SKILL.md"
enabled = true
[shell_environment_policy.set]
SKYTTEL_PERSISTENCE_SENTINEL = "retained"
'''


def database_snapshot(demo=False):
    with sqlite3.connect(DATABASE) as db:
        assert db.execute('PRAGMA integrity_check').fetchone() == ('ok',)
        assert not db.execute('PRAGMA foreign_key_check').fetchall()
        if demo:
            assert db.execute('SELECT name FROM household').fetchall() == [('TestHousehold',)]
            assert db.execute(
                'SELECT role FROM membership JOIN account ON membership.userId = account.userId '
                "WHERE account.providerId = 'google' AND account.accountId = 'devcontainer-check-administrator'"
            ).fetchall() == [('administrator',)]
            assert db.execute("SELECT id FROM map_object WHERE name = 'Molnmusik'").fetchone()
            assert not db.execute("SELECT id FROM user WHERE id = 'persistence-user'").fetchall()
            assert not db.execute(
                "SELECT id FROM map_object WHERE id = 'persistence-object'"
            ).fetchall()
            assert not db.execute('SELECT id FROM session').fetchall()
            assert all(
                change['id'] != 'private-sentinel'
                for (changes,) in db.execute('SELECT changes FROM map_draft')
                for change in json.loads(changes)
            )
        else:
            assert db.execute(
                "SELECT name FROM map_object WHERE id = 'persistence-object'"
            ).fetchone() == ('Saved synthetic object',)
            assert db.execute(
                "SELECT userId, token FROM session WHERE id = 'persistence-session'"
            ).fetchone() == ('persistence-user', 'synthetic-session-token')
            changes = json.loads(db.execute(
                "SELECT changes FROM map_draft JOIN content_identity "
                "ON map_draft.userId = content_identity.id "
                "WHERE content_identity.userId = 'persistence-user'"
            ).fetchone()[0])
            assert len(changes) == 1
            assert changes[0]['id'] == 'private-sentinel'
            assert changes[0]['after']['name'] == 'Private synthetic draft'
        return hashlib.sha256('\n'.join(db.iterdump()).encode()).hexdigest()


def verify_storage(recreated=False):
    for marker in MARKERS:
        assert marker.read_text() == 'retained\n', str(marker)
    parsed = tomllib.loads(CONFIG.read_text())
    assert CONFIG.stat().st_mode & 0o777 == 0o600
    expected = tomllib.loads((BUNDLE / 'codex-config.toml').read_text())
    assert parsed['projects']['/workspace']['trust_level'] == 'trusted'
    assert parsed['permissions'] == expected['permissions']
    assert parsed['approval_policy'] == expected['approval_policy']
    assert parsed['default_permissions'] == expected['default_permissions']
    assert parsed['plugins'] == expected['plugins']
    auth = HOME / '.codex/auth.json'
    assert json.loads(auth.read_text()) == {'synthetic_marker': 'not-a-credential'}
    assert auth.stat().st_mode & 0o777 == 0o600
    if recreated:
        assert parsed.get('model') != 'personal-sentinel'
        assert parsed['default_permissions'] == expected['default_permissions']
        assert not (HOME / '.codex/persistence-sentinel.txt').exists()
        assert parsed['skills'] == expected['skills']
        assert not Path('/tmp/disposable-layer-sentinel.txt').exists()
    else:
        for key, value in tomllib.loads(PERSONAL).items():
            if key in ('approval_policy', 'default_permissions', 'plugins', 'skills'):
                continue
            assert parsed[key] == value, key
        assert parsed['skills']['config'] == (
            tomllib.loads(PERSONAL)['skills']['config'] + expected['skills']['config']
        )
        assert (HOME / '.codex/persistence-sentinel.txt').read_text() == 'retained\n'
        assert Path('/tmp/disposable-layer-sentinel.txt').read_text() == 'must disappear'


action = sys.argv[1]
if action == 'seed':
    shutil.copyfile(BUNDLE / 'fixture.sqlite', DATABASE)
    (BUNDLE / 'database-digest.txt').write_text(database_snapshot())
    CONFIG.write_text(PERSONAL)
    CONFIG.chmod(0o600)
    for marker in MARKERS:
        marker.parent.mkdir(parents=True, exist_ok=True)
        marker.write_text('retained\n')
    (HOME / '.codex/persistence-sentinel.txt').write_text('retained\n')
    auth = HOME / '.codex/auth.json'
    auth.write_text(json.dumps({'synthetic_marker': 'not-a-credential'}))
    auth.chmod(0o600)
    Path('/tmp/disposable-layer-sentinel.txt').write_text('must disappear')
elif action in ('verify', 'verify-recreated'):
    assert database_snapshot() == (BUNDLE / 'database-digest.txt').read_text()
    verify_storage(recreated=action == 'verify-recreated')
    print('Synthetic data and mounted developer settings retained.')
elif action in ('verify-demo', 'record-reset', 'verify-reset'):
    digest = database_snapshot(demo=True)
    if action != 'verify-demo':
        verify_storage(recreated=True)
        if action == 'record-reset':
            (BUNDLE / 'demo-digest.txt').write_text(digest)
        else:
            assert digest == (BUNDLE / 'demo-digest.txt').read_text()
    print('Demo data belongs to the configured administrator; previous state is absent.')
else:
    raise ValueError(f'Unknown fixture action: {action}')
