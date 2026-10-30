import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const guide = readFileSync(
  new URL('../../docs/operations/langsmith-rollout.md', import.meta.url),
  'utf8',
);
const snippets = [...guide.matchAll(/python3 - <<'PY'\n([\s\S]*?)\nPY/g)].map((match) => match[1]);

// Execute the actual copyable snippets with synthetic input and no network access.
const harness = `
import contextlib, io, json, sys, urllib.parse
from unittest.mock import patch
case = json.load(sys.stdin)
answers = iter([case['endpoint'], 'synthetic-scope', case['action'], case['action']])
requests = []
output = io.StringIO()
error = None
def respond(request, timeout):
    assert timeout == 30
    url = urllib.parse.urlsplit(request.full_url)
    data = json.loads(request.data) if request.data else None
    requests.append({'url': request.full_url, 'method': request.get_method(),
                     'headers': dict(request.header_items()), 'data': data})
    if url.path == '/api/v1/workspaces':
        result = [{'display_name': 'Personal', 'id': 'workspace-id'}]
    elif url.path.startswith('/api/v1/agents/'):
        name = url.path.rsplit('/', 1)[1]
        result = {'environments': [
            {'environment': target, 'tracer_session_name': name + '-' + target.lower(),
             'tracer_session_id': name + '-id'}
            for target in ['DEVELOPMENT', 'PRODUCTION']]}
    elif url.path == '/sessions':
        name = data['name'] if data else urllib.parse.parse_qs(url.query)['name'][0]
        project = {'name': name, 'id': name + '-id'}
        result = project if data else [project]
    else:
        raise AssertionError('Unexpected request path: ' + url.path)
    return io.StringIO(json.dumps(result))
with patch('builtins.open', return_value=io.StringIO()), \
     patch('builtins.input', side_effect=lambda prompt: next(answers)), \
     patch('getpass.getpass', return_value='synthetic-pat') as password, \
     patch('urllib.request.urlopen', side_effect=respond), \
     contextlib.redirect_stdout(output):
    try:
        exec(case['code'], {})
    except SystemExit as exc:
        error = str(exc)
print(json.dumps({'error': error, 'passwordPrompts': password.call_count,
                  'requests': requests, 'output': output.getvalue()}))
`;

function run(code, endpoint, action = 'read') {
  const result = spawnSync('python3', ['-c', harness], {
    input: JSON.stringify({ code, endpoint, action }),
    encoding: 'utf8',
    timeout: 10_000,
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('all three setup snippets reject unsafe endpoints before reading or sending a PAT', () => {
  assert.equal(snippets.length, 3);
  for (const code of snippets) {
    for (const endpoint of [
      '',
      'http://api.smith.langchain.com',
      'https://unapproved.example',
      'https://api.smith.langchain.com.unapproved.example',
      'https://api.smith.langchain.com@unapproved.example',
      'https://user@api.smith.langchain.com',
      'https://api.smith.langchain.com:8443',
      'https://api.smith.langchain.com/path',
      'https://api.smith.langchain.com?redirect=unapproved.example',
      'https://api.smith.langchain.com#fragment',
      '//api.smith.langchain.com',
      'file:///etc/passwd',
    ]) {
      const result = run(code, endpoint);
      assert.match(result.error, /HTTPS API endpoint.*step 2/, endpoint);
      assert.equal(result.passwordPrompts, 0, endpoint);
      assert.deepEqual(result.requests, [], endpoint);
    }
  }
});

test('approved regions preserve workspace, agent, and project read/create requests', () => {
  assert.equal(snippets.length, 3);
  for (const base of [
    'https://api.smith.langchain.com',
    'https://eu.api.smith.langchain.com',
    'https://apac.api.smith.langchain.com',
    'https://aws.api.smith.langchain.com',
  ]) {
    for (const endpoint of [base, ` ${base}/ `]) {
      const workspace = run(snippets[0], endpoint);
      const agents = run(snippets[1], endpoint);
      const read = run(snippets[2], endpoint);
      const create = run(snippets[2], endpoint, 'create');
      for (const result of [workspace, agents, read, create]) {
        assert.equal(result.error, null);
        assert.equal(result.passwordPrompts, 1);
        for (const request of result.requests) {
          assert.equal(request.headers['X-api-key'], 'synthetic-pat');
        }
      }
      assert.equal(workspace.requests.length, 1);
      assert.equal(workspace.requests[0].url, `${base}/api/v1/workspaces`);
      assert.equal(workspace.requests[0].method, 'GET');
      assert.equal(workspace.requests[0].headers['X-organization-id'], 'synthetic-scope');
      assert.match(workspace.output, /SKYTTEL_LANGSMITH_WORKSPACE_ID: workspace-id/);
      for (const result of [agents, read, create]) {
        assert.equal(result.requests.length, 2);
        assert.ok(result.requests.every((r) => r.headers['X-tenant-id'] === 'synthetic-scope'));
      }
      for (const [i, name] of ['skyttel-dev', 'skyttel-prod'].entries()) {
        assert.equal(agents.requests[i].url, `${base}/api/v1/agents/${name}`);
        assert.equal(agents.requests[i].method, 'GET');
        assert.equal(read.requests[i].url, `${base}/sessions?name=${name}`);
        assert.equal(read.requests[i].method, 'GET');
        assert.equal(create.requests[i].url, `${base}/sessions`);
        assert.equal(create.requests[i].method, 'POST');
        assert.deepEqual(create.requests[i].data, { name, extra: {}, description: null });
        for (const result of [read, create]) {
          assert.ok(result.output.includes(`SKYTTEL_LANGSMITH_PROJECT: ${name}`));
        }
      }
      assert.match(agents.output, /SKYTTEL_LANGSMITH_PROJECT: skyttel-dev-development/);
      assert.match(agents.output, /SKYTTEL_LANGSMITH_PROJECT: skyttel-prod-production/);
    }
  }
});
