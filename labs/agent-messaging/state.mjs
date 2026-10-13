export const topic = 'agent-messaging.events.v1';
export const stages = ['proposal', 'critique', 'synthesis'];
export const agentFor = stage => stage === 'critique' ? 'reviewer' : 'planner';
export const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{8,80}$/.test(value);
export const stepId = (taskId, stage) => `${taskId}:${stage}`;

export function createState() {
  const tasks = new Map();
  const seen = new Set();
  let duplicates = 0;
  let rejected = 0;
  let position = null;
  function apply(event, meta) {
    if (!event || event.schema !== 1 || typeof event.eventId !== 'string' || !validId(event.taskId)) {
      rejected++; return false;
    }
    position = { partition: meta.partition, offset: meta.offset };
    if (seen.has(event.eventId)) { duplicates++; return false; }
    seen.add(event.eventId);
    if (event.type === 'task.submitted') {
      if (tasks.has(event.taskId)) { duplicates++; return false; }
      if (event.eventId !== `${event.taskId}:submitted` || typeof event.task !== 'string' || event.task.length < 1 || event.task.length > 1200) {
        rejected++; return false;
      }
      tasks.set(event.taskId, {
        id: event.taskId, task: event.task, submittedAt: event.at, status: 'pending',
        steps: stages.map(stage => ({ id: stepId(event.taskId, stage), stage, agentId: agentFor(stage), status: 'pending' })),
      });
      return true;
    }
    const task = tasks.get(event.taskId);
    const index = stages.indexOf(event.stage);
    if (!task || index < 0 || event.agentId !== agentFor(event.stage) || event.stepId !== stepId(event.taskId, event.stage)) {
      rejected++; return false;
    }
    const step = task.steps[index];
    if (index > 0 && task.steps[index - 1].status !== 'completed') { rejected++; return false; }
    if (event.type === 'step.started' && step.status === 'pending' && event.eventId === `${step.id}:started` && typeof event.instanceId === 'string') {
      Object.assign(step, { status: 'running', instanceId: event.instanceId, startedAt: event.at });
      task.status = 'running';
      return true;
    }
    if (step.status !== 'running' || step.instanceId !== event.instanceId) { duplicates++; return false; }
    if (event.type === 'step.completed' && event.eventId === `${step.id}:completed` && typeof event.text === 'string' && event.text.trim() && event.text.length <= 24000 && event.inference?.harness === 'vercel-labs/fx') {
      Object.assign(step, { status: 'completed', text: event.text, inference: event.inference, completedAt: event.at });
      task.status = index === 2 ? 'completed' : 'running';
      return true;
    }
    if (event.type === 'step.failed' && event.eventId === `${step.id}:failed` && typeof event.error === 'string') {
      Object.assign(step, { status: 'failed', error: event.error.slice(0, 600), completedAt: event.at });
      task.status = 'failed';
      return true;
    }
    rejected++; return false;
  }
  return {
    tasks, apply,
    snapshot: () => ({ tasks: [...tasks.values()].reverse(), position, duplicates, rejected, topic }),
  };
}
