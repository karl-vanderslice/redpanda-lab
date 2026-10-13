// The reducer is the only domain-state writer. It never calls the model or reads a clock.
export function createState() {
  const conversations = new Map();
  const jobs = new Map();
  const operations = new Map();
  const events = [];
  let revision = 0;

  function apply(event, position) {
    if (event?.version !== 1 || typeof event.id !== 'string') throw new Error('Unsupported chat event');
    if (operations.has(event.id)) return;
    const entry = { ...event, partition: position.partition, offset: position.offset };
    events.push(entry);
    revision += 1;
    let result = { accepted: false, reason: 'Invalid transition' };
    const job = jobs.get(event.jobId);
    const conversation = conversations.get(event.conversationId);
    switch (event.type) {
      case 'conversation.created':
        if (!conversations.has(event.conversationId)) {
          conversations.set(event.conversationId, {
            id: event.conversationId, title: event.title, createdAt: event.at, messages: [],
          });
          result = { accepted: true, conversationId: event.conversationId };
        }
        break;
      case 'job.submitted':
        if (conversation && !jobs.has(event.jobId)) {
          jobs.set(event.jobId, {
            id: event.jobId, conversationId: event.conversationId, prompt: event.prompt,
            mode: event.mode, dueAt: event.dueAt, createdAt: event.at,
            status: 'pending', attempts: 0, transitions: [
              { status: 'pending', at: event.at, offset: position.offset },
            ],
          });
          result = { accepted: true, jobId: event.jobId };
        } else result.reason = 'Conversation does not exist';
        break;
      case 'job.cancelled':
        if (job?.status === 'pending') {
          job.status = 'cancelled';
          job.finishedAt = event.at;
          job.transitions.push({ status: 'cancelled', at: event.at, offset: position.offset });
          result = { accepted: true, jobId: job.id };
        } else result.reason = 'Only pending jobs can be cancelled; start won the log order';
        break;
      case 'job.started':
        if (job?.status === 'pending' && Date.parse(event.at) >= Date.parse(job.dueAt)) {
          job.status = 'running';
          job.attemptId = event.attemptId;
          job.owner = event.owner;
          job.startedAt = event.at;
          job.attempts += 1;
          job.input = event.input;
          job.transitions.push({ status: 'running', at: event.at, offset: position.offset });
          conversations.get(job.conversationId).messages.push({
            id: `${job.id}:user`, jobId: job.id, role: 'user', content: job.prompt, at: event.at,
          });
          result = { accepted: true, jobId: job.id, attemptId: event.attemptId };
        } else result.reason = 'Job cancelled, already started, or not due';
        break;
      case 'job.completed':
      case 'job.failed':
        if (job?.status === 'running' && job.attemptId === event.attemptId) {
          job.status = event.type === 'job.completed' ? 'completed' : 'failed';
          job.finishedAt = event.at;
          job.outcomeUnknown = event.outcomeUnknown === true;
          job.error = event.error ?? null;
          job.usage = event.usage ?? null;
          job.transitions.push({ status: job.status, at: event.at, offset: position.offset });
          if (job.status === 'completed') {
            job.reply = event.reply;
            conversations.get(job.conversationId).messages.push({
              id: `${job.id}:assistant`, jobId: job.id, role: 'assistant',
              content: event.reply, at: event.at, model: event.model,
            });
          }
          result = { accepted: true, jobId: job.id };
        }
        break;
      default:
        throw new Error(`Unsupported chat event type: ${event.type}`);
    }
    operations.set(event.id, { id: event.id, signature: event.signature, ...result, ...position });
  }

  return {
    apply, conversations, jobs, operations, events,
    get revision() { return revision; },
    conversation(id) {
      const value = conversations.get(id);
      return value ? { ...value, jobs: [...jobs.values()].filter(job => job.conversationId === id) } : null;
    },
  };
}
