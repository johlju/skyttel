import assert from 'node:assert/strict';
import { evaluationEnvironment } from '../../scripts/model-evaluation/environment.js';
import { outputRecordingWorklet } from '../../scripts/model-evaluation/playback.js';
import { speechConnection } from '../../scripts/model-evaluation/speech.js';

let requests = 0;
const environment = await evaluationEnvironment(
  { id: 'launch-check', title: 'Launch through tsx', voice: true, steps: [] },
  {
    providerApiKey: 'controlled-no-paid-access',
    modelFetch: async () => {
      throw new Error('Unexpected model request');
    },
    liveFetch: async () => {
      requests++;
      return Response.json(
        { error: { message: 'Controlled unavailable provider' } },
        { status: 503 },
      );
    },
    deliverResponse: (request, response) =>
      new URL(request.url).pathname === '/__evaluation_output.js'
        ? new Response(outputRecordingWorklet, { headers: { 'Content-Type': 'text/javascript' } })
        : response,
  },
);
let connection: Awaited<ReturnType<typeof speechConnection>> | undefined;
try {
  connection = await speechConnection(environment);
  await assert.rejects(connection.start(), /evaluation_voice_start_5\d\d/);
  assert.equal(requests, 1);
  console.log('Speech connection reached the controlled provider through tsx.');
} finally {
  await connection?.close();
  await environment.close();
}
