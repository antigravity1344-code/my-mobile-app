/** Offline capability probe; deliberately has no transport, shell or agent SDK. */
export function simulateLauncher(task, target) {
  if (task.status !== 'RUNNING') throw new Error('RUNNING_REQUIRED');
  if (!['CODEX_HEADLESS', 'CHATGPT_UX_UI'].includes(target)) throw new Error('UNKNOWN_TARGET');
  return {
    taskId: task.id, target, simulated: true, launched: false,
    reason: target === 'CODEX_HEADLESS'
      ? 'LIVE_RUNNER_AND_MODEL_AUTH_NOT_CONFIGURED'
      : 'EXISTING_CHATGPT_CONVERSATION_LIFECYCLE_NOT_AVAILABLE',
  };
}
