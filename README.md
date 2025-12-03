# Power Choosers CRM

A comprehensive Customer Relationship Management system built for energy service providers, featuring advanced call insights, contact management, automated workflows, and intelligent data enrichment.

## 🌟 Features

### 📞 **Advanced Call Management**
- **Twilio Voice Integration** - High-quality voice calls with browser-based dialer
- **Conversational Intelligence** - AI-powered call transcripts and insights
- **Call Recording & Playback** - Automatic recording with secure playback
- **Real-time Call Insights** - Live sentiment analysis and conversation tracking
- **Smart Call Logging** - Automatic contact matching and call history
- **Call Status Tracking** - Real-time call status updates and webhooks
- **Call Bridge to Mobile** - Seamless call transfer to mobile devices
- **Call Scripts** - Dynamic call scripts with AI-powered suggestions

### 👥 **Contact & Account Management**
- **Unified Contact Database** - Comprehensive contact and account profiles
- **Energy Contract Tracking** - Current rates, suppliers, contract end dates
- **Relationship Mapping** - Contact-to-account associations and hierarchies
- **Bulk Import/Export** - CSV import with intelligent field mapping
- **Advanced Search & Filtering** - Multi-criteria search across all data
- **Contact Merging** - Intelligent duplicate detection and merging
- **Inline Editing** - Quick field editing without page reloads
- **Parent/Subsidiary Relationships** - Account hierarchy management

### 🔍 **Data Enrichment & Intelligence**
- **Lusha Enrichment (Cache-first)** - Company/contact enrichment with credit-safe cache and on-demand reveal
- **Apollo Integration** - Advanced prospecting and data enrichment
- **Coresignal Integration** - Company intelligence and relationship mapping
- **Algolia Search** - Fast, typo-tolerant full-text search across all entities
- **Favicon System** - Automatic company logo/favicon generation with 7-source fallback
- **Domain Extraction** - Intelligent domain parsing from websites and emails

### 🤖 **AI-Powered Insights**
- **Transcript Analysis** - Automatic extraction of key conversation points
- **Sentiment Analysis** - Real-time mood and engagement tracking
- **Contract Intelligence** - Automatic extraction of rates, terms, and timelines
- **Next Steps Detection** - AI-suggested follow-up actions
- **Pain Point Identification** - Automatic detection of customer concerns
- **Email Content Generation** - AI-powered email templates and content

### 📊 **Business Intelligence**
- **Energy Health Dashboard** - Contract status and renewal tracking
- **Call Analytics** - Performance metrics and call outcome analysis
- **Activity Timeline** - Comprehensive activity tracking across all touchpoints
- **Deal Pipeline** - Opportunity tracking and sales forecasting
- **Insights Dashboard** - Aggregated insights across all interactions
- **Badge System** - Real-time notification badges for tasks, calls, emails

### 🔄 **Workflow Automation**
- **Email Sequences** - Automated follow-up campaigns with tracking
- **Task Management** - Automated task creation and assignment
- **List Management** - Dynamic contact lists and segmentation
- **Bulk Actions** - Mass operations across contacts and accounts
- **Sequence Builder** - Visual sequence creation with conditional logic
- **Scheduled Emails** - Time-based email delivery with tracking

### 📧 **Email Management**
- **Gmail API Integration** - Server-side email sending via Google service account
- **Custom Email Tracking** - 1x1 transparent pixel for open tracking with deduplication
- **Click Tracking** - Link wrapping with redirect tracking for click analytics
- **Email Threading** - Conversation threading and reply management
- **Gmail Inbox Sync** - Automatic inbox synchronization
- **Scheduled Sending** - Time-based email delivery with sequence automation
- **Email Performance Analytics** - Detailed open/click rates and engagement metrics
- **Bot Detection** - Filters out email client proxies and bots
- **Device Detection** - Tracks mobile, desktop, tablet, and bot opens

### 🎯 **Task & Activity Management**
- **Task Types** - Phone calls, emails, LinkedIn tasks, custom tasks
- **Task Navigation** - Quick navigation between related tasks
- **Task Detail Pages** - Comprehensive task views with context
- **Activity Manager** - Unified activity tracking system
- **Recent Calls Widget** - Quick access to call history
- **Task Notifications** - Real-time task alerts and reminders

### 👔 **Agent & Team Management**
- **Agent Dashboard** - Individual agent performance tracking
- **Team Overview** - Multi-agent management and monitoring
- **Agent Status** - Real-time agent availability and activity
- **Agent Activities** - Detailed activity logs per agent

### 📰 **Content Management**
- **News Management** - Energy industry news and updates
- **Post Editor** - Content creation and publishing
- **Client Management** - Client-specific content and communications

### 🔧 **System Features**
- **IndexedDB Caching** - Fast local caching with intelligent expiry
- **Background Loaders** - Pre-loading data for instant page loads
- **Real-time Updates** - Live data synchronization across all views
- **Offline Support** - Cached data available when offline
- **Performance Optimization** - Zero-cost Firestore reads when cache available
- **Event Delegation** - Efficient event handling for dynamic content
- **Duplicate Listener Prevention** - Smart event handler management

## 🚀 Quick Start

### Prerequisites
- Node.js 22.x
- Twilio Account with Voice API access
- Firebase project for data storage
- (Optional) Lusha API key for enrichment
- (Optional) Apollo API key for prospecting
- (Optional) Coresignal API key for company intelligence
- (Optional) Algolia account for search

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd power-choosers-crm
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Set the following in your `.env` file:
   ```bash
   # Twilio Configuration
   TWILIO_ACCOUNT_SID=your_account_sid
   TWILIO_AUTH_TOKEN=your_auth_token
   TWILIO_PHONE_NUMBER=your_twilio_number
   TWILIO_INTELLIGENCE_SERVICE_SID=your_ci_service_sid
   
   # Firebase Configuration
   FIREBASE_PROJECT_ID=your_project_id
   FIREBASE_PRIVATE_KEY=your_private_key
   FIREBASE_CLIENT_EMAIL=your_client_email
   
   # API Configuration
   PUBLIC_BASE_URL=https://power-choosers-crm.vercel.app
   API_BASE_URL=https://power-choosers-crm.vercel.app
   
   # Data Enrichment (Optional)
   LUSHA_API_KEY=your_lusha_key
   APOLLO_API_KEY=your_apollo_key
   CORESIGNAL_API_KEY=your_coresignal_key
   
   # Search (Optional)
   ALGOLIA_APP_ID=your_algolia_app_id
   ALGOLIA_API_KEY=your_algolia_api_key
   ALGOLIA_SEARCH_KEY=your_algolia_search_key
   
   # Email Services (Gmail API)
   GOOGLE_SERVICE_ACCOUNT_KEY=your_service_account_json_key
   GMAIL_SENDER_EMAIL=your_sender_email@powerchoosers.com
   GMAIL_SENDER_NAME=Your Name
   
   # Optional: Enhanced AI
   GEMINI_API_KEY=your_gemini_key
   ```

4. **Start the development server**
   ```bash
   npm start
   # or
   node server.js
   ```

5. **Open the application**
   Navigate to `http://localhost:3000/crm-dashboard.html`

## 🏗️ Architecture

### Frontend
- **Vanilla JavaScript** - No framework dependencies for maximum performance
- **Modular Design** - Separate modules for each page/feature
- **Responsive UI** - Mobile-friendly interface with dark theme
- **Real-time Updates** - Live data synchronization across all views
- **IndexedDB Caching** - Fast local storage with intelligent expiry
- **Background Loaders** - Pre-load data for instant page loads

### Backend
- **Cloud Run Deployment** - Node.js server deployed on Google Cloud Run
- **Firebase Integration** - Real-time database with offline support
- **Twilio APIs** - Voice, SMS, and Conversational Intelligence
- **AI Processing** - Gemini AI for enhanced insights
- **Gmail API** - Server-side email sending with service account authentication
- **Custom Email Tracking** - Self-hosted tracking pixel and click tracking system

### Data Flow
```
Call Initiated → TwiML Created → Recording Started → 
Recording Complete → Transcript Generated → AI Insights Created → 
Data Posted to /api/calls → Frontend Displays with Fallback Parsing
```

### Caching Strategy
- **IndexedDB Cache Manager** - Centralized caching system
- **Collection-specific Expiry** - Tasks: 3 minutes, Others: 15 minutes
- **Cache-first Loading** - Background loaders check cache before Firestore
- **Automatic Invalidation** - Cache updates on data changes
- **Stale Data Prevention** - Validation filters prevent blank renders

### Background Loaders
- **BackgroundContactsLoader** - Pre-loads contact data
- **BackgroundAccountsLoader** - Pre-loads account data
- **BackgroundTasksLoader** - Pre-loads task data with ownership filtering
- **BackgroundCallsLoader** - Pre-loads call history
- **BackgroundEmailsLoader** - Pre-loads email data
- **BackgroundSequencesLoader** - Pre-loads email sequences
- **BackgroundListsLoader** - Pre-loads contact lists

## 📁 Project Structure

```
power-choosers-crm/
├── crm-dashboard.html          # Main application interface
├── index.html                  # Landing page
├── server.js                   # Local development server
├── package.json                # Dependencies and scripts
├── styles/
│   └── main.css               # Application styles
├── scripts/
│   ├── main.js                # Core application logic
│   ├── firebase.js            # Firebase integration
│   ├── cache-manager.js       # IndexedDB cache system
│   ├── data-manager.js       # Data access layer
│   ├── activity-manager.js    # Activity tracking
│   ├── algolia-search.js     # Algolia search integration
│   ├── click-to-call.js      # Phone number click handlers
│   ├── click-to-email.js    # Email click handlers
│   ├── email-tracking.js    # Email open/click tracking
│   ├── gmail-inbox-sync.js  # Gmail integration
│   ├── contact-merger.js    # Duplicate contact merging
│   ├── bulk-assignment.js   # Bulk operations
│   ├── task-notifications.js # Task alerts
│   ├── badge-loader.js      # Notification badges
│   ├── notifications.js     # Toast notifications
│   ├── toast-manager.js     # Notification system
│   ├── fix-duplicate-listeners.js # Event handler management
│   ├── background-*-loader.js # Background data loaders
│   ├── pages/                 # Page-specific modules
│   │   ├── dashboard.js      # Dashboard (in main.js)
│   │   ├── people.js          # Contact management
│   │   ├── contact-detail.js  # Individual contact view
│   │   ├── accounts.js        # Account management
│   │   ├── account-detail.js   # Individual account view
│   │   ├── calls.js           # Call management
│   │   ├── emails-redesigned.js # Email management
│   │   ├── email-detail.js    # Individual email view
│   │   ├── sequences.js       # Email sequences list
│   │   ├── sequence-builder.js # Sequence creation
│   │   ├── tasks.js           # Task management
│   │   ├── task-detail.js     # Individual task view
│   │   ├── deals.js           # Deal pipeline
│   │   ├── insights.js        # Insights dashboard
│   │   ├── lists-overview.js  # Lists management
│   │   ├── list-detail.js     # Individual list view
│   │   ├── client-management.js # Client management
│   │   ├── agents.js          # Agent management
│   │   ├── agent-details.js   # Individual agent view
│   │   ├── news.js            # News management
│   │   ├── post-editor.js     # Content editor
│   │   ├── call-scripts.js    # Call scripts
│   │   └── settings.js        # System settings
│   └── widgets/               # Reusable UI components
│       ├── phone.js           # Phone dialer widget
│       ├── live-call-insights.js # Real-time call insights
│       ├── health.js           # Energy health widget
│       ├── maps.js             # Google Maps widget
│       ├── notes.js            # Notes widget
│       ├── deal.js             # Deal calculator widget
│       ├── apollo.js           # Apollo enrichment widget
│       └── coresignal.js      # Coresignal widget
├── api/                       # API endpoints
│   ├── calls.js              # Call data management
│   ├── calls/                # Call-related endpoints
│   ├── email/                # Email-related endpoints
│   │   ├── sendgrid-send.js  # Gmail API email sending (legacy filename)
│   │   ├── gmail-service.js  # Gmail API service with user profile lookup
│   │   ├── tracking-helper.js # Tracking pixel and link wrapping
│   │   ├── track/            # Email tracking endpoints
│   │   │   ├── [id].js      # Open tracking pixel endpoint
│   │   │   └── click/[id].js # Click tracking redirect endpoint
│   │   ├── inbound-email.js # Inbound email processing (SendGrid webhook)
│   │   └── webhook.js        # Email webhooks
│   ├── twilio/               # Twilio integrations
│   │   ├── voice.js          # Voice API
│   │   ├── recording.js      # Recording webhooks
│   │   ├── conversational-intelligence.js # CI processing
│   │   ├── ai-insights.js    # AI insights generation
│   │   └── ...               # Other Twilio endpoints
│   ├── apollo/               # Apollo API integration
│   ├── algolia/              # Algolia search endpoints
│   ├── maps/                 # Google Maps integration
│   ├── search.js             # Global search
│   ├── upload/               # File upload handling
│   ├── complete-sequence-task.js # Sequence automation
│   ├── generate-scheduled-emails.js # Email scheduling
│   ├── send-scheduled-emails.js # Scheduled email delivery
│   └── ...                   # Other API endpoints
└── Images/                   # Application assets
```

## 🔧 Configuration

### Twilio Setup
1. Create a Twilio account and get your credentials
2. Set up a Voice API application
3. Configure Conversational Intelligence service
4. Set webhook URLs to point to your deployment

### Firebase Setup
1. Create a Firebase project
2. Enable Firestore database
3. Generate service account credentials
4. Configure security rules (see `firestore-rules-FINAL.txt`)

### Lusha Enrichment
- Cache-first widget uses Firebase to avoid re-spending credits
- Explicit Refresh button performs live search (1 credit)
- Cached searches cost 0 credits
- Per-contact Reveal uses `requestId` from initial search
- Full company data (logo, description, social) is cached

### Apollo Integration
- API key stored in environment variables
- Widget provides company and contact enrichment
- Data cached locally to reduce API calls

### Coresignal Integration
- Company intelligence and relationship mapping
- Employee data and organizational charts
- Integration via widget system

### Algolia Search
- Fast, typo-tolerant search across contacts, accounts, calls
- Reindex endpoints for manual updates
- Real-time search with instant results

### Deployment
The application is deployed on Google Cloud Run:
- Frontend: Static files served via Cloud Run
- Backend: Node.js server (`server.js`) handling all API routes
- Database: Firebase Firestore with security rules
- API Base URL: Configured via `PUBLIC_BASE_URL` environment variable
- All API calls route through Cloud Run deployment

## 🎯 Key Features in Detail

### Call Insights System
- **Automatic Transcription** - Twilio Conversational Intelligence
- **AI Analysis** - Sentiment, topics, next steps, pain points
- **Fallback Parsing** - Intelligent transcript parsing when AI fails
- **Cross-Page Consistency** - Same insights across all views
- **Real-time Updates** - Live insights during active calls

### Contact Management
- **Unified Profiles** - Contacts and accounts in one system
- **Energy Data** - Current rates, suppliers, contract details
- **Activity Tracking** - Complete interaction history
- **Bulk Operations** - Mass updates and imports
- **Inline Editing** - Quick field updates without page reload
- **Phone Field Management** - Multiple phone types with preferred phone selection
- **Email Management** - Multiple email addresses with status tracking

### Email Integration
- **Gmail API Sending** - Server-side email delivery via Google service account
- **Custom Tracking System** - Self-hosted 1x1 pixel tracking with deduplication
- **Click Tracking** - Link wrapping with redirect tracking for analytics
- **AI-Generated Content** - Context-aware email templates using Perplexity/Gemini
- **Sequence Automation** - Multi-step follow-up campaigns with delays
- **Personalization** - Dynamic content based on contact data (no template placeholders)
- **Gmail Inbox Sync** - Automatic inbox synchronization and threading
- **Scheduled Sending** - Time-based email delivery with sequence automation
- **Open/Click Analytics** - Real-time tracking with device and bot detection

### Task Management
- **Multiple Task Types** - Phone calls, emails, LinkedIn tasks, custom tasks
- **Task Navigation** - Quick navigation between related tasks
- **Task Detail Pages** - Comprehensive views with full context
- **Ownership Filtering** - Users see only their assigned tasks
- **Task Completion** - Automatic sequence progression
- **Task Notifications** - Real-time alerts and reminders

### Caching & Performance
- **IndexedDB Cache** - Fast local storage with intelligent expiry
- **Cache-first Loading** - Zero Firestore reads when cache available
- **Background Pre-loading** - Data ready before user navigates
- **Stale Data Prevention** - Validation prevents blank renders
- **Automatic Invalidation** - Cache updates on data changes
- **Collection-specific Expiry** - Optimized expiry times per data type

### Event Management
- **Event Delegation** - Efficient handling of dynamic content
- **Duplicate Prevention** - Smart event handler guards
- **Capture Phase Handlers** - Priority event handling
- **Context Preservation** - State management across navigation

## 🔒 Security

- **Environment Variables** - All secrets stored securely
- **CORS Protection** - Configured for production domains
- **Firebase Rules** - Database security at the data level
- **Twilio Webhooks** - Secure webhook validation
- **HTTPS Only** - All communications encrypted
- **API Keys** - Read only from environment (never in client code)
- **Ownership Filtering** - Users can only access their own data
- **Admin Controls** - Role-based access control

## 📈 Performance

- **Serverless Architecture** - Automatic scaling
- **CDN Distribution** - Global content delivery
- **Lazy Loading** - On-demand resource loading
- **Caching Strategy** - Optimized data retrieval
- **Real-time Updates** - Efficient data synchronization
- **Background Loaders** - Pre-load data for instant page loads
- **Zero-cost Reads** - Cache-first approach eliminates unnecessary Firestore queries
- **IndexedDB** - Fast local storage for instant data access

## 🛠️ Development

### Local Development
```bash
# Start development server
npm start
# or
node server.js

# The server runs on http://localhost:3000
# API calls route through local server or Cloud Run deployment (via PUBLIC_BASE_URL)
```

### Adding New Features
1. Create page module in `scripts/pages/`
2. Add API endpoints in `api/` directory
3. Update navigation in `main.js`
4. Add styles in `main.css`
5. Create background loader if needed for caching
6. Add event handlers with duplicate prevention guards

### Testing
- **Manual Testing** - Use the built-in call dialer
- **API Testing** - Test endpoints via browser dev tools
- **Integration Testing** - Full call flow testing
- **Cache Testing** - Verify cache behavior and expiry

## 📞 Support

For technical support or feature requests:
- Check the `plan.md` file for detailed implementation notes
- Review API documentation in the `/api` directory
- Test with the built-in debugging tools
- Check console logs for cache and performance metrics

## 🚀 Deployment Status

- **Production**: https://powerchoosers.com/crm-dashboard
- **API**: https://power-choosers-crm-792458658491.us-south1.run.app
- **Status**: ✅ Fully operational with all features working
- **Email Tracking**: Custom pixel tracking system active
- **Email Sending**: Gmail API via service account

## 📝 Recent Updates (2025)

### Email System Overhaul
- **Gmail API Integration** - Replaced SendGrid with Gmail API for email sending
- **Custom Tracking System** - Self-hosted 1x1 pixel tracking with open/click analytics
- **Tracking Pixel** - Custom endpoint with deduplication and bot detection
- **Click Tracking** - Link wrapping with redirect tracking for click analytics
- **Device Detection** - Tracks mobile, desktop, tablet, and bot opens
- **IP Masking** - Privacy-focused IP address masking in tracking data
- **Production Logging** - Optimized logging to reduce Cloud Run costs

### Firestore Security & Compliance
- **Ownership Fields** - All documents include `ownerId`, `assignedTo`, `createdBy` fields
- **Rules Compliance** - All document creation/updates comply with Firestore security rules
- **Admin Fallbacks** - Proper fallback to admin email when user email unavailable
- **Batch Operations** - All bulk operations include proper ownership fields

### Caching System
- IndexedDB cache manager with collection-specific expiry
- Background loaders for all major data types
- Cache-first loading strategy reduces Firestore costs
- Stale data validation prevents blank renders

### Task Management
- Enhanced task detail pages with full context
- Company phone click handling with proper context
- Task navigation between related tasks
- Ownership-based filtering for non-admin users

### Contact & Account Management
- Improved contact title display in task headers
- Enhanced company phone context setting
- Better account resolution with multiple fallbacks
- Favicon system with 7-source fallback

### Performance Optimizations
- Zero-cost Firestore reads when cache available
- Background pre-loading for instant page loads
- Event delegation for efficient dynamic content
- Duplicate listener prevention system
- Production logging optimization (debug logs only in development)

---

**Power Choosers CRM** - Streamlining energy service provider operations with AI-powered insights and comprehensive contact management.
