type Status = {
  phase: 'idle' | 'armed' | 'not-committed' | 'dropped-after-commit';
  operationId?: string;
  version?: number;
  statusUnavailable?: boolean;
};

/** Disposable provider fixture control, never installed in the production app. */
export function controlledBatchDelivery(changed: (status: Status) => void = () => {}) {
  let status: Status = { phase: 'idle' };
  let statusUnavailable = false;
  function set(next: Status) {
    status = next;
    changed({ ...status });
  }
  return {
    arm() {
      if (status.phase === 'armed') throw new Error('A batch response is already armed');
      set({ phase: 'armed' });
    },
    clear() {
      statusUnavailable = false;
      set({ phase: 'idle' });
    },
    blockStatus(blocked: boolean) {
      statusUnavailable = blocked;
      changed({ ...status, statusUnavailable });
    },
    status: () => ({ ...status, statusUnavailable }),
    async dispatch(
      incoming: Request,
      dispatch: (request: Request) => Response | Promise<Response>,
    ) {
      const rpc =
        incoming.method === 'POST' && new URL(incoming.url).pathname === '/mcp'
          ? await incoming
              .clone()
              .json()
              .catch(() => null)
          : null;
      if (rpc?.params?.name === 'read_draft_batch' && statusUnavailable)
        throw new Error('Controlled unavailable batch status transport');
      const response = await dispatch(incoming);
      if (status.phase !== 'armed' || rpc?.params?.name !== 'apply_draft_batch') return response;
      const envelope = await response
        .clone()
        .json()
        .catch(() => null);
      const text = envelope?.result?.content?.find(
        (item: { type: string }) => item.type === 'text',
      )?.text;
      const result = typeof text === 'string' ? JSON.parse(text) : null;
      if (envelope?.result?.isError || result?.status !== 'committed') {
        set({ phase: 'not-committed' });
        return response;
      }
      set({
        phase: 'dropped-after-commit',
        operationId: result.operationId,
        version: result.version,
      });
      throw new Error('Controlled lost committed MCP batch response');
    },
  };
}
