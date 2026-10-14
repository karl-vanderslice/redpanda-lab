import { isDeepStrictEqual } from 'node:util';

export const fixtures = {
  profiles: [
    { profileId: 'cf-mara', name: 'Mara Vale', bio: 'Fictional editor writing about shared places and practical care.' },
    { profileId: 'cf-ellis', name: 'Ellis Reed', bio: 'Fictional contributor observing materials, routes and everyday design.' },
  ],
  posts: [
    { postId: 'cf-bench', authorId: 'cf-mara', title: 'A bench is a small agreement', summary: 'What a place to pause asks of the people who maintain it.', body: 'A bench does not need to announce itself. It needs a dry seat, a clear path and enough space for someone to put down a bag. In our imagined town, the workshop keeps a notebook beside the door. Each repair begins with a description of how the bench is used, not with a drawing.\n\nThis week the notebook records three small changes: a rounded edge, a replaced slat and a gap wide enough for rain to leave. None makes a grand opening. Together they make the afternoon easier for the next person.\n\nPublic care is often a sequence of modest decisions. The useful question is not who owns the photograph, but who will notice the loose screw next month.' },
    { postId: 'cf-route', authorId: 'cf-ellis', title: 'The route behind the map', summary: 'A fictional walk along the service lane reveals the work a map leaves out.', body: 'The printed map draws a clean line between the square and the mill. A walker finds a less tidy route: a gate opened after deliveries, a narrow corner and a sheltered stretch beside the tool shed.\n\nWe asked our fictional mapmaker to draw those details too. The result is not a faster route. It is a more useful account of what a person will encounter, including the places where two people need to take turns.\n\nA good map admits its limits. A gate can be closed, a surface can be wet and a familiar shortcut can become unsuitable. The line is an invitation to pay attention, not a guarantee.' },
  ],
};
export const fixtureCommand = { id: 'fixture-commonfield-v1', type: 'fixture', ...fixtures };
export const fail = (status, message, details = {}) => Object.assign(new Error(message), { status, ...details });
const idPattern = /^[a-zA-Z0-9_-]{1,80}$/;
function identifier(value, field) {
  if (typeof value !== 'string' || !idPattern.test(value)) throw fail(400, `${field} must contain 1–80 letters, digits, underscores or hyphens.`);
  return value;
}
function text(value, field, max) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw fail(400, `${field} must be nonempty text, at most ${max} characters, without control characters.`);
  return value;
}
export function validate(value, internal = false) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw fail(400, 'Expected a command object.');
  identifier(value.id, 'id');
  const shapes = {
    profile: ['profileId', 'name', 'bio'], publish: ['viewerId', 'postId', 'title', 'summary', 'body', 'visibility'],
    follow: ['viewerId', 'targetId', 'following'], like: ['viewerId', 'postId', 'liked'],
    feed: ['viewerId', 'mode'], read: ['viewerId', 'postId', 'surface'],
  };
  if (value.type === 'fixture' && internal && isDeepStrictEqual(value, fixtureCommand)) return structuredClone(value);
  if (typeof value.type !== 'string' || !Object.hasOwn(shapes, value.type)) throw fail(400, 'Unknown command type.');
  const fields = shapes[value.type];
  if (Object.keys(value).some(key => !['id', 'type', ...fields].includes(key))) throw fail(400, 'Unexpected command field.');
  const command = { id: value.id, type: value.type };
  for (const field of fields) {
    const item = value[field];
    if (field.endsWith('Id')) command[field] = identifier(item, field);
    else if (field === 'following' || field === 'liked') {
      if (typeof item !== 'boolean') throw fail(400, `${field} must be a boolean, not a toggle.`);
      command[field] = item;
    } else if (field === 'mode') {
      if (item !== 'all' && item !== 'following') throw fail(400, 'mode must be all or following.');
      command[field] = item;
    } else if (field === 'visibility') {
      if (item !== 'public') throw fail(400, 'Only public posts are supported. There is no private publishing.');
      command[field] = item;
    } else if (field === 'surface') {
      if (item !== 'article') throw fail(400, 'Reads describe local article opens only.');
      command[field] = item;
    } else command[field] = text(item, field, { name: 80, bio: 320, title: 160, summary: 400, body: 8000 }[field]);
  }
  return command;
}

export function createModel() {
  const profiles = new Map(), posts = new Map(), operations = new Map();
  let lastOffset = null, duplicates = 0;
  function outcome(command) {
    const reject = reason => ({ accepted: false, changed: false, reason, data: null });
    const accept = (changed, data) => ({ accepted: true, changed, reason: null, data });
    if (command.type === 'fixture') {
      if (profiles.size || posts.size) return reject('Fixture installation requires an empty projection.');
      return accept(true, { profiles: command.profiles, posts: command.posts, fixture: true });
    }
    if (command.type === 'profile') {
      if (profiles.has(command.profileId)) return reject('Profile ID already exists.');
      return accept(true, { profileId: command.profileId, name: command.name, bio: command.bio });
    }
    const viewer = profiles.get(command.viewerId);
    if (!viewer) return reject('Viewer profile does not exist.');
    if (command.type === 'publish') {
      if (posts.has(command.postId)) return reject('Post ID already exists.');
      return accept(true, { postId: command.postId, authorId: command.viewerId, title: command.title, summary: command.summary, body: command.body, visibility: 'public' });
    }
    if (command.type === 'feed') return accept(viewer.mode !== command.mode, { viewerId: command.viewerId, mode: command.mode });
    if (command.type === 'follow') {
      if (!profiles.has(command.targetId)) return reject('Target profile does not exist.');
      if (command.targetId === command.viewerId) return reject('A profile cannot follow itself.');
      return accept(viewer.follows.has(command.targetId) !== command.following, { viewerId: command.viewerId, targetId: command.targetId, following: command.following });
    }
    const post = posts.get(command.postId);
    if (!post) return reject('Post does not exist.');
    if (command.type === 'like') return accept(post.likes.has(command.viewerId) !== command.liked, { viewerId: command.viewerId, postId: command.postId, liked: command.liked });
    return accept(true, { viewerId: command.viewerId, postId: command.postId, surface: 'article', reads: post.reads.length + 1, distinctReaders: post.readers.size + (post.readers.has(command.viewerId) ? 0 : 1) });
  }
  function addProfile(data, fixture) {
    profiles.set(data.profileId, { ...data, fixture, mode: 'all', follows: new Set() });
  }
  function addPost(data, record, metadata, fixture, ordinal = 0) {
    posts.set(data.postId, { ...data, visibility: 'public', fixture, at: record.at, offset: metadata.offset, ordinal, likes: new Set(), reads: [], readers: new Set() });
  }
  function apply(record, metadata) {
    if (!record || record.schema !== 1 || Object.keys(record).sort().join(',') !== 'at,command,outcome,schema' || !Number.isSafeInteger(record.at) || record.at < 0 || record.at > 8640000000000000 || metadata.partition !== 0) throw new Error('Invalid activity record envelope.');
    const command = validate(record.command, true);
    if (metadata.key !== command.id) throw new Error('Activity record key must match command ID.');
    const prior = operations.get(command.id);
    if (prior) {
      if (!isDeepStrictEqual(prior.command, command) || !isDeepStrictEqual(prior.record.outcome, record.outcome)) throw new Error('Conflicting durable activity ID.');
      duplicates += 1; lastOffset = metadata.offset; return prior;
    }
    const expected = outcome(command);
    if (!isDeepStrictEqual(expected, record.outcome)) throw new Error('Activity outcome does not match deterministic replay.');
    if (expected.accepted) {
      const data = expected.data;
      switch (command.type) {
        case 'fixture':
          for (const profile of data.profiles) addProfile(profile, true);
          data.posts.forEach((post, index) => addPost(post, record, metadata, true, index));
          break;
        case 'profile': addProfile(data, false); break;
        case 'publish': addPost(data, record, metadata, false); break;
        case 'feed': profiles.get(data.viewerId).mode = data.mode; break;
        case 'follow': {
          const set = profiles.get(data.viewerId).follows;
          if (data.following) set.add(data.targetId); else set.delete(data.targetId);
          break;
        }
        case 'like': {
          const set = posts.get(data.postId).likes;
          if (data.liked) set.add(data.viewerId); else set.delete(data.viewerId);
          break;
        }
        case 'read': {
          const post = posts.get(data.postId);
          post.reads.push({ id: command.id, viewerId: data.viewerId, at: record.at, offset: metadata.offset });
          post.readers.add(data.viewerId);
          break;
        }
      }
    }
    const operation = { command, record, offset: metadata.offset, ...expected };
    operations.set(command.id, operation); lastOffset = metadata.offset;
    return operation;
  }
  function snapshot() {
    return { lastOffset, duplicates,
      profiles: [...profiles.values()].map(profile => ({ ...profile, follows: [...profile.follows].sort() })),
      posts: [...posts.values()].map(post => ({ ...post, likes: [...post.likes].sort(), reads: [...post.reads], readers: [...post.readers].sort(), readCount: post.reads.length, distinctReaders: post.readers.size })).sort((a, b) => BigInt(a.offset) === BigInt(b.offset) ? b.ordinal - a.ordinal : BigInt(a.offset) > BigInt(b.offset) ? -1 : 1),
      operations: [...operations.values()] };
  }
  function feed(viewerId) {
    const state = snapshot();
    const viewer = state.profiles.find(profile => profile.profileId === viewerId);
    if (!viewer) throw fail(404, 'Viewer profile does not exist.');
    return { viewer, posts: state.posts.filter(post => viewer.mode === 'all' || viewer.follows.includes(post.authorId)) };
  }
  return { operations, outcome, apply, snapshot, feed };
}
