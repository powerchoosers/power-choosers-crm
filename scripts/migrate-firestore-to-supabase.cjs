// Migration Script: Firestore -> Supabase
// Run with: node scripts/migrate-firestore-to-supabase.js

const admin = require('firebase-admin');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// --- CONFIGURATION ---
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY 
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY) 
  : null;

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY 
  ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') 
  : undefined;

if (!serviceAccount && (!projectId || !clientEmail || !privateKey)) {
  console.error('❌ Missing Firebase Credentials.');
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: serviceAccount 
      ? admin.credential.cert(serviceAccount)
      : admin.credential.cert({ projectId, clientEmail, privateKey })
  });
}
const db = admin.firestore();

// Supabase Setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase Credentials.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// --- HELPER: Timestamp Converter ---
const sanitize = (str) => {
  if (typeof str !== 'string') return str;
  return str.replace(/\u0000/g, '');
};

const toIso = (val) => {
  if (!val) return null;
  try {
    let d;
    if (val.toDate) d = val.toDate(); // Firestore Timestamp
    else d = new Date(val);
    
    if (isNaN(d.getTime())) return null; // Invalid date
    return d.toISOString();
  } catch (e) {
    return null;
  }
};

const toDate = (val) => {
    const iso = toIso(val);
    return iso ? iso.split('T')[0] : null;
};

// --- MIGRATION RUNNER ---
async function migrateCollection(collectionName, tableName, transformFn) {
  console.log(`\n🚀 Starting migration: ${collectionName} -> ${tableName}`);
  
  const snapshot = await db.collection(collectionName).get();
  if (snapshot.empty) {
    console.log(`⚠️ No documents found in ${collectionName}`);
    return;
  }

  console.log(`Found ${snapshot.size} documents. Processing...`);

  const batchSize = 100;
  let batch = [];
  let count = 0;
  let errors = 0;

  for (const doc of snapshot.docs) {
    try {
      const data = doc.data();
      const transformed = transformFn(doc.id, data);
      
      if (transformed) {
        batch.push(transformed);
      }
    } catch (e) {
      console.error(`Error transforming doc ${doc.id}:`, e.message);
      errors++;
    }

    if (batch.length >= batchSize) {
      const { error } = await supabase.from(tableName).upsert(batch);
      if (error) {
        console.error('Error inserting batch:', error);
        console.error(error); // Detailed error
        errors += batch.length;
      } else {
        count += batch.length;
        process.stdout.write(`.`);
      }
      batch = [];
    }
  }

  // Flush remaining
  if (batch.length > 0) {
    const { error } = await supabase.from(tableName).upsert(batch);
    if (error) {
      console.error('Error inserting final batch:', error);
      errors += batch.length;
    } else {
      count += batch.length;
    }
  }

  console.log(`\n✅ Finished ${tableName}: ${count} inserted, ${errors} errors.`);
}

// --- TRANSFORMERS ---

const transformUser = (id, data) => {
    // Extract top-level fields
    const firstName = data.firstName || (data.general && data.general.firstName);
    const lastName = data.lastName || (data.general && data.general.lastName);
    const email = data.email || (data.general && data.general.email) || id; // Use ID as email if it looks like one
    
    // Everything else goes into settings JSON
    return {
        id: id,
        email: email,
        first_name: firstName,
        last_name: lastName,
        photo_url: data.photoURL || (data.general && data.general.photoURL),
        hosted_photo_url: data.hostedPhotoURL || (data.general && data.general.hostedPhotoURL),
        job_title: data.jobTitle || (data.general && data.general.jobTitle),
        phone: data.phone || (data.general && data.general.phone),
        linkedin_url: data.linkedIn || (data.general && data.general.linkedIn),
        bio: data.bio || (data.general && data.general.bio),
        
        settings: data, // Store full object as settings for flexibility
        
        created_at: toIso(data.createdAt) || new Date().toISOString(),
        updated_at: toIso(data.updatedAt) || new Date().toISOString()
    };
};

const transformAgent = (id, data) => ({
    id: id,
    name: data.name,
    email: data.email || id,
    territory: data.territory,
    skills: data.skills || [],
    status: data.status || 'offline',
    role: data.role || 'sales_agent',
    goals: data.goals || {},
    performance: data.performance || {},
    "assignedPhoneNumber": data.assignedPhoneNumber,
    "assignedEmailAddress": data.assignedEmailAddress,
    "lastActive": toIso(data.lastActive),
    "createdAt": toIso(data.createdAt) || new Date().toISOString(),
    metadata: data
});

const transformAccount = (id, data) => ({
  id: id,
  name: data.accountName || data.name || data.companyName || data.company,
  domain: data.domain || data.website || data.site,
  industry: data.industry,
  status: data.status || 'active',
  employees: parseInt(data.employees) || null,
  revenue: data.revenue ? String(data.revenue) : null,
  description: data.description,
  logo_url: data.logoUrl || data.logo || data.companyLogo || data.iconUrl,
  
  // Contact Info
  phone: data.companyPhone || data.phone || data.primaryPhone,
  linkedin_url: data.linkedin || data.linkedinUrl,
  address: data.address,
  city: data.city || data.locationCity,
  state: data.state || data.locationState,
  zip: data.zipCode || data.zip,
  country: data.country,
  
  // Energy Fields
  electricity_supplier: data.electricitySupplier,
  annual_usage: data.annualUsage,
  current_rate: data.currentRate,
  contract_end_date: toDate(data.contractEndDate),
  service_addresses: data.serviceAddresses || [],
  
  ownerId: data.ownerId,
  createdAt: toIso(data.createdAt) || new Date().toISOString(),
  updatedAt: toIso(data.updatedAt) || new Date().toISOString(),
  metadata: data
});

const transformContact = (id, data) => ({
  id: id,
  accountId: data.accountId || data.accountID,
  firstName: data.firstName,
  lastName: data.lastName,
  name: data.name || [data.firstName, data.lastName].filter(Boolean).join(' '),
  email: data.email,
  phone: data.phone,
  mobile: data.mobile || data.mobilePhone,
  workPhone: data.workPhone || data.workDirectPhone,
  title: data.title || data.jobTitle,
  linkedinUrl: data.linkedinUrl || data.linkedin,
  status: data.status || 'active',
  
  ownerId: data.ownerId,
  lastActivityAt: toIso(data.lastActivityAt),
  lastContactedAt: toIso(data.lastContactedAt),
  createdAt: toIso(data.createdAt) || new Date().toISOString(),
  updatedAt: toIso(data.updatedAt) || new Date().toISOString(),
  metadata: data
});

const transformDeal = (id, data) => ({
    id: id,
    title: data.title,
    accountId: data.accountId,
    stage: data.stage || 'interested',
    amount: parseFloat(data.totalDealValue) || parseFloat(data.amount) || 0,
    closeDate: toDate(data.projectedCloseDate || data.closeDate),
    ownerId: data.ownerId,
    assignedTo: data.assignedTo,
    
    annualUsage: parseFloat(data.annualUsage) || 0,
    mills: parseFloat(data.mills) || 0,
    contractLength: parseInt(data.contractLength) || 0,
    commissionType: data.commissionType || 'annual',
    yearlyCommission: parseFloat(data.yearlyCommission) || 0,
    
    createdAt: toIso(data.createdAt) || new Date().toISOString(),
    updatedAt: toIso(data.updatedAt) || new Date().toISOString(),
    metadata: data
});

const transformEmail = (id, data) => ({
    id: id,
    contactId: data.contactId,
    accountId: data.accountId,
    threadId: data.threadId,
    
    from: sanitize(data.from),
    to: Array.isArray(data.to) ? data.to : (data.to ? [data.to] : []),
    cc: Array.isArray(data.cc) ? data.cc : (data.cc ? [data.cc] : []),
    bcc: Array.isArray(data.bcc) ? data.bcc : (data.bcc ? [data.bcc] : []),
    subject: sanitize(data.subject),
    
    html: sanitize(data.html),
    text: sanitize(data.text || data.content),
    
    status: data.status || (data.type === 'scheduled' ? 'scheduled' : 'received'),
    type: data.type || (data.isSentEmail ? 'sent' : 'received'),
    is_read: data.unread === false, // Note inversion
    is_starred: !!data.starred,
    is_deleted: !!data.deleted,
    
    scheduledSendTime: toIso(data.scheduledSendTime),
    aiPrompt: sanitize(data.aiPrompt),
    
    openCount: data.openCount || 0,
    clickCount: data.clickCount || 0,
    opens: data.opens || [],
    clicks: data.clicks || [],
    
    timestamp: toIso(data.date || data.sentAt || data.receivedAt || data.timestamp),
    createdAt: toIso(data.createdAt) || new Date().toISOString(),
    updatedAt: toIso(data.updatedAt) || new Date().toISOString(),
    metadata: data
});

const transformTask = (id, data) => ({
    id: id,
    title: data.title || data.taskName || data.name,
    description: data.description || data.notes,
    status: data.status || (data.completed ? 'completed' : 'pending'),
    priority: data.priority || 'medium',
    dueDate: toIso(data.dueDate || data.due),
    
    contactId: data.contactId,
    accountId: data.accountId,
    ownerId: data.ownerId,
    
    createdAt: toIso(data.createdAt) || new Date().toISOString(),
    updatedAt: toIso(data.updatedAt) || new Date().toISOString(),
    metadata: data
});

const transformCall = (id, data) => ({
  id: id,
  callSid: data.callSid,
  from: data.from,
  to: data.to,
  direction: data.direction,
  status: data.status,
  duration: parseInt(data.duration) || 0,
  timestamp: toIso(data.timestamp || data.startTime) || new Date().toISOString(),
  recordingUrl: data.recordingUrl || data.recording,
  transcript: data.transcript,
  summary: data.summary,
  aiInsights: data.aiInsights || data.conversationalIntelligence || data.aiAnalysis,
  
  accountId: data.accountId,
  contactId: data.contactId,
  createdAt: toIso(data.createdAt) || new Date().toISOString(),
  metadata: data
});

const transformCallLog = (id, data) => ({
  id: id,
  callSid: data.callSid,
  from: data.from,
  to: data.to,
  status: data.status,
  duration: parseInt(data.duration) || 0,
  timestamp: toIso(data.timestamp || data.startTime) || new Date().toISOString(),
  metadata: data
});

const transformCallDetail = (id, data) => ({
  id: id,
  transcript: data.transcript,
  formattedTranscript: data.formattedTranscript,
  aiInsights: data.aiInsights,
  conversationalIntelligence: data.conversationalIntelligence,
  metadata: data
});

const transformList = (id, data) => ({
  id: id,
  name: data.name,
  kind: data.kind || data.type || 'people',
  ownerId: data.ownerId,
  assignedTo: data.assignedTo,
  createdBy: data.createdBy,
  createdAt: toIso(data.createdAt) || new Date().toISOString(),
  metadata: data
});

const transformListMember = (id, data) => ({
  id: id,
  listId: data.listId,
  targetId: data.targetId,
  targetType: data.targetType || 'people',
  addedAt: toIso(data.addedAt) || new Date().toISOString()
});

const transformSequence = (id, data) => ({
  id: id,
  name: data.name,
  description: data.description,
  steps: data.steps || [],
  status: data.status || 'active',
  ownerId: data.ownerId,
  createdAt: toIso(data.createdAt) || new Date().toISOString(),
  updatedAt: toIso(data.updatedAt) || new Date().toISOString(),
  metadata: data
});

const transformSequenceMember = (id, data) => ({
  id: id,
  sequenceId: data.sequenceId,
  targetId: data.targetId,
  targetType: data.targetType || 'people',
  hasEmail: !!data.hasEmail,
  skipEmailSteps: !!data.skipEmailSteps,
  createdAt: toIso(data.createdAt) || new Date().toISOString(),
  updatedAt: toIso(data.updatedAt) || new Date().toISOString()
});

const transformSequenceActivation = (id, data) => ({
  id: id,
  sequenceId: data.sequenceId,
  contactIds: data.contactIds || (data.contactId ? [data.contactId] : []),
  status: data.status,
  processedContacts: data.processedContacts || 0,
  totalContacts: data.totalContacts || 0,
  ownerId: data.ownerId,
  errorMessage: data.errorMessage,
  createdAt: toIso(data.createdAt) || new Date().toISOString(),
  updatedAt: toIso(data.updatedAt) || new Date().toISOString()
});

const transformActivity = (id, data) => ({
    id: id,
    userId: data.agentEmail || data.userId || data.user,
    type: data.type,
    timestamp: toIso(data.timestamp),
    details: data.details || data,
    createdAt: toIso(data.timestamp || data.createdAt) || new Date().toISOString(),
    metadata: data
});

const transformPost = (id, data) => ({
    id: id,
    title: data.title,
    slug: data.slug || id,
    content: data.content || data.body,
    status: data.status || 'draft',
    category: data.category,
    featuredImage: data.featuredImage || data.image,
    publishDate: toIso(data.publishDate),
    authorId: data.authorId || data.author,
    createdAt: toIso(data.createdAt) || new Date().toISOString(),
    updatedAt: toIso(data.updatedAt) || new Date().toISOString(),
    metadata: data
});

const transformNotification = (id, data) => ({
    id: id,
    userId: data.userId || data.ownerId,
    ownerId: data.ownerId,
    title: data.title,
    message: data.message || data.body,
    type: data.type || 'info',
    read: !!data.read,
    link: data.link || data.url,
    data: data.data || {},
    createdAt: toIso(data.createdAt) || new Date().toISOString(),
    metadata: data
});

const transformThread = (id, data) => ({
  id: id,
  subjectNormalized: data.subjectNormalized,
  participants: data.participants || [],
  lastSnippet: data.lastSnippet,
  lastFrom: data.lastFrom,
  lastMessageAt: toIso(data.lastMessageAt),
  messageCount: data.messageCount || 0,
  createdAt: toIso(data.createdAt) || new Date().toISOString(),
  updatedAt: toIso(data.updatedAt) || new Date().toISOString(),
  metadata: data
});

const transformSuppression = (id, data) => ({
  id: id, // Email is the ID
  reason: data.reason,
  details: data.details,
  source: data.source,
  suppressedAt: toIso(data.suppressedAt),
  createdAt: toIso(data.createdAt) || new Date().toISOString()
});

async function run() {
  try {
    console.log('🏁 Starting Nodal Point Data Migration (Clean Sweep)...');
    
    // 1. Users / Agents
    await migrateCollection('users', 'users', transformUser);
    await migrateCollection('agents', 'agents', transformAgent);
    
    // 2. Core Entities
    await migrateCollection('accounts', 'accounts', transformAccount);
    await migrateCollection('people', 'contacts', transformContact);
    await migrateCollection('contacts', 'contacts', transformContact); 
    
    // 3. Communication
    await migrateCollection('threads', 'threads', transformThread);
    await migrateCollection('emails', 'emails', transformEmail);
    await migrateCollection('calls', 'calls', transformCall);
    await migrateCollection('call_logs', 'call_logs', transformCallLog);
    await migrateCollection('callDetails', 'call_details', transformCallDetail);
    await migrateCollection('suppressions', 'suppressions', transformSuppression);
    
    // 4. Workflow
    await migrateCollection('tasks', 'tasks', transformTask);
    await migrateCollection('deals', 'deals', transformDeal);
    await migrateCollection('posts', 'posts', transformPost);
    
    // 5. Lists & Sequences
    await migrateCollection('lists', 'lists', transformList);
    await migrateCollection('listMembers', 'list_members', transformListMember);
    await migrateCollection('sequences', 'sequences', transformSequence);
    await migrateCollection('sequenceMembers', 'sequence_members', transformSequenceMember);
    await migrateCollection('sequenceActivations', 'sequence_activations', transformSequenceActivation);
    
    // 6. Logs & Notifications
    await migrateCollection('agent_activities', 'activities', transformActivity);
    await migrateCollection('activities', 'activities', transformActivity); // Also check activities collection
    await migrateCollection('notifications', 'notifications', transformNotification);
    
    console.log('\n🎉 Migration Complete!');
    process.exit(0);
  } catch (e) {
    console.error('Fatal Error:', e);
    process.exit(1);
  }
}

run();
