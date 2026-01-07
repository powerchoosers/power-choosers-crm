import { db } from '../api/_firebase.js';

function parseArgs(argv) {
  const out = {
    delete: false,
    sequenceId: null,
    contactId: null,
    max: null,
    help: false
  };

  for (const arg of argv) {
    if (arg === '--delete') out.delete = true;
    else if (arg.startsWith('--sequenceId=')) out.sequenceId = arg.split('=')[1] || null;
    else if (arg.startsWith('--contactId=')) out.contactId = arg.split('=')[1] || null;
    else if (arg.startsWith('--max=')) {
      const n = Number(arg.split('=')[1]);
      out.max = Number.isFinite(n) ? n : null;
    } else if (arg === '--help' || arg === '-h') {
      out.help = true;
    }
  }

  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log('Usage: node scripts/delete-duplicate-sequence-tasks.js [--delete] [--sequenceId=seq-...] [--contactId=contact-...] [--max=500]');
    process.exit(0);
  }

  if (!db) {
    console.error('Firestore not initialized. Ensure FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY are set.');
    process.exit(1);
  }

  const candidatesSnap = await db
    .collection('tasks')
    .where('completedReason', '==', 'duplicate_sequence_task_cleanup')
    .get();

  const candidates = [];
  candidatesSnap.forEach((doc) => {
    const data = doc.data() || {};
    if (args.sequenceId && data.sequenceId !== args.sequenceId) return;
    if (args.contactId && data.contactId !== args.contactId) return;
    candidates.push({ docId: doc.id, ...data });
  });

  console.log(`Found ${candidates.length} tasks marked duplicate_sequence_task_cleanup.`);

  const limited = typeof args.max === 'number' ? candidates.slice(0, args.max) : candidates;
  if (limited.length !== candidates.length) {
    console.log(`Limiting to ${limited.length} due to --max.`);
  }

  if (!args.delete) {
    console.log('Dry run only. Re-run with --delete to permanently remove these task docs.');
    return;
  }

  let deleted = 0;
  let failed = 0;

  for (const t of limited) {
    try {
      await db.collection('tasks').doc(t.docId).delete();
      deleted++;
    } catch (e) {
      failed++;
      console.warn(`Failed to delete ${t.docId}: ${e?.message || e}`);
    }
  }

  console.log(`Delete complete. Deleted ${deleted}. Failed ${failed}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

