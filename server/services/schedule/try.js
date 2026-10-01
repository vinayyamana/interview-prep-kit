const { allocate } = require('./allocate');

const kit = {
  role: { requirements: [
    { id: 'r1', priority: 'must', topic: 'Node.js internals' },
    { id: 'r2', priority: 'must', topic: 'MongoDB scaling' },
    { id: 'r3', priority: 'nice', topic: 'Containers' },
  ] },
  questions: [
    { id: 'q1', requirement_ids: ['r1'], category: 'technical', difficulty: 3 },
    { id: 'q2', requirement_ids: ['r2'], category: 'technical', difficulty: 2 },
    { id: 'q3', requirement_ids: ['r3'], category: 'technical', difficulty: 1 },
  ],
};

console.log(JSON.stringify(allocate(kit, 3), null, 2));