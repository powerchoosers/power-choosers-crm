# Power Choosers CRM

A comprehensive Customer Relationship Management system built for energy service providers, featuring advanced call insights, contact management, and automated workflows.

## 🌟 Features

### 📞 **Advanced Call Management**
- **Twilio Voice Integration** - High-quality voice calls with browser-based dialer
- **Conversational Intelligence** - AI-powered call transcripts and insights
- **Call Recording & Playback** - Automatic recording with secure playback
- **Real-time Call Insights** - Live sentiment analysis and conversation tracking
- **Smart Call Logging** - Automatic contact matching and call history

### 👥 **Contact & Account Management**
- **Unified Contact Database** - Comprehensive contact and account profiles
- **Energy Contract Tracking** - Current rates, suppliers, contract end dates
- **Relationship Mapping** - Contact-to-account associations and hierarchies
- **Bulk Import/Export** - CSV import with intelligent field mapping
- **Advanced Search & Filtering** - Multi-criteria search across all data
 - **Lusha Enrichment (Cache‑first)** - Company/contact enrichment with credit‑safe cache and on‑demand reveal

### 🤖 **AI-Powered Insights**
- **Transcript Analysis** - Automatic extraction of key conversation points
- **Sentiment Analysis** - Real-time mood and engagement tracking
- **Contract Intelligence** - Automatic extraction of rates, terms, and timelines
- **Next Steps Detection** - AI-suggested follow-up actions
- **Pain Point Identification** - Automatic detection of customer concerns

### 📊 **Business Intelligence**
- **Energy Health Dashboard** - Contract status and renewal tracking
- **Call Analytics** - Performance metrics and call outcome analysis
- **Activity Timeline** - Comprehensive activity tracking across all touchpoints
- **Deal Pipeline** - Opportunity tracking and sales forecasting

### 🔄 **Workflow Automation**
- **Email Sequences** - Automated follow-up campaigns with tracking
- **Task Management** - Automated task creation and assignment
- **List Management** - Dynamic contact lists and segmentation
- **Bulk Actions** - Mass operations across contacts and accounts

## 🚀 Quick Start

### Prerequisites
- Node.js 16+ 
- Twilio Account with Voice API access
- Firebase project for data storage

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
   
   # Lusha (serverless API)
   LUSHA_API_KEY=your_lusha_key
   
   # Optional: Enhanced AI
   GEMINI_API_KEY=your_gemini_key
   ```

4. **Start the development server**
   ```bash
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

### Backend
- **Serverless Functions** - Deployed on Vercel for scalability
- **Firebase Integration** - Real-time database with offline support
- **Twilio APIs** - Voice, SMS, and Conversational Intelligence
- **AI Processing** - Gemini AI for enhanced insights

### Data Flow
```
Call Initiated → TwiML Created → Recording Started → 
Recording Complete → Transcript Generated → AI Insights Created → 
Data Posted to /api/calls → Frontend Displays with Fallback Parsing
```

### Lusha Enrichment (2025‑09)
- Cache‑first widget uses Firebase to avoid re‑spending credits for previously revealed results
- Explicit Refresh button performs a live search (1 credit); cached searches cost 0
- Per‑contact Reveal uses `requestId` from the initial search
- Full company data (logo, description, social) is cached alongside contacts
- “Add Contact” links to the current account when opened from Account Detail and includes any revealed email/phones
- Pagination UI mirrors Accounts page: 5 results per page, arrow buttons, centered page number

### Calls System Ground Rules (2025-09)
- One row per Twilio Call SID. All updates (status/recording/insights) write to the same Call SID.
- `POST /api/calls` requires a valid Call SID. If missing, the API returns `202 { pending: true }` and does not create a row.
- No cross-call merging by phone pair or contact/account.
- CORS allows `GET, POST, DELETE, OPTIONS`. `DELETE /api/calls` accepts `id|callSid|twilioSid|ids[]` via body or query and removes both the SID doc and any legacy non-SID IDs.
- Frontend must guard optional helpers (e.g., account icon helper) with a white vector fallback to prevent render crashes.

## 📁 Project Structure

```
power-choosers-crm/
├── crm-dashboard.html          # Main application interface
├── index.html                  # Landing page
├── server.js                   # Local development server
├── vercel.json                 # Vercel deployment configuration
├── package.json                # Dependencies and scripts
├── styles/
│   └── main.css               # Application styles
├── scripts/
│   ├── main.js                # Core application logic
│   ├── firebase.js            # Firebase integration
│   ├── pages/                 # Page-specific modules
│   │   ├── calls.js           # Call management
│   │   ├── people.js          # Contact management
│   │   ├── accounts.js        # Account management
│   │   └── ...
│   └── widgets/               # Reusable UI components
│       ├── live-call-insights.js
│       ├── health.js
│       └── ...
├── api/                       # Serverless functions
│   ├── calls.js              # Call data management
│   ├── twilio/               # Twilio integrations
│   │   ├── voice.js          # Voice API
│   │   ├── recording.js      # Recording webhooks
│   │   └── conversational-intelligence.js
│   └── ...
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
4. Configure security rules

### Deployment
The application is designed to deploy on Vercel:
- Frontend: Static files served from Vercel
- Backend: Serverless functions in `/api` directory
- Database: Firebase Firestore
- CDN: Automatic via Vercel

## 🎯 Key Features in Detail

### Call Insights System
- **Automatic Transcription** - Twilio Conversational Intelligence
- **AI Analysis** - Sentiment, topics, next steps, pain points
- **Fallback Parsing** - Intelligent transcript parsing when AI fails
- **Cross-Page Consistency** - Same insights across all views

### Contact Management
- **Unified Profiles** - Contacts and accounts in one system
- **Energy Data** - Current rates, suppliers, contract details
- **Activity Tracking** - Complete interaction history
- **Bulk Operations** - Mass updates and imports

### Email Integration
- **AI-Generated Content** - Context-aware email templates
- **Tracking & Analytics** - Open rates and engagement metrics
- **Sequence Automation** - Multi-step follow-up campaigns
- **Personalization** - Dynamic content based on contact data

## 🔒 Security

- **Environment Variables** - All secrets stored securely
- **CORS Protection** - Configured for production domains
- **Firebase Rules** - Database security at the data level
- **Twilio Webhooks** - Secure webhook validation
- **HTTPS Only** - All communications encrypted
 - **Lusha Keys** - API keys are read only from environment (never in client code)

## 📈 Performance

- **Serverless Architecture** - Automatic scaling
- **CDN Distribution** - Global content delivery
- **Lazy Loading** - On-demand resource loading
- **Caching Strategy** - Optimized data retrieval
- **Real-time Updates** - Efficient data synchronization

## 🛠️ Development

### Local Development
```bash
# Start development server
node server.js

# The server runs on http://localhost:3000
# API calls are proxied to Vercel deployment
```

### Adding New Features
1. Create page module in `scripts/pages/`
2. Add API endpoints in `api/` directory
3. Update navigation in `main.js`
4. Add styles in `main.css`

### Testing
- **Manual Testing** - Use the built-in call dialer
- **API Testing** - Test endpoints via browser dev tools
- **Integration Testing** - Full call flow testing

## 📞 Support

For technical support or feature requests:
- Check the `plan.md` file for detailed implementation notes
- Review API documentation in the `/api` directory
- Test with the built-in debugging tools

## 🚀 Deployment Status

- **Production**: https://powerchoosers.com/crm-dashboard
- **API**: https://power-choosers-crm.vercel.app
- **Status**: ✅ Fully operational with all features working

---

**Power Choosers CRM** - Streamlining energy service provider operations with AI-powered insights and comprehensive contact management.