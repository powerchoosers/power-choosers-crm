# Power Choosers CRM

A comprehensive Customer Relationship Management system built for Power Choosers energy sales team.

## Features

### 🏢 Account Management
- Create, edit, and manage company accounts
- Track company information (name, industry, phone, website, address)
- View detailed account pages with contacts and activities
- Add notes and track interactions

### 👤 Contact Management
- Create and manage individual contacts
- Link contacts to specific accounts
- Track contact information (name, title, email, phone)
- Add notes and track communication history

### 📊 Dashboard
- Overview of total accounts and contacts
- Recent activities tracking
- Hot leads identification
- Quick action buttons for common tasks

### 📝 Activity Tracking
- Automatic logging of account and contact creation/updates
- Note-taking functionality
- Activity history for accounts and contacts
- Real-time activity feed on dashboard

## File Structure

```
/your-crm-repo
├── crm-index.html      # Main HTML file
├── crm-styles.css      # All CSS styles
├── crm-app.js          # Main application logic
├── firebase-config.js  # Firebase configuration
└── README.md          # This file
```

## Setup Instructions

### 1. GitHub Pages Setup
1. Create a new repository on GitHub for your CRM
2. Upload all the files to your repository
3. Enable GitHub Pages in repository settings
4. Update the file paths in `crm-index.html` to match your GitHub Pages URL

### 2. Update File Paths
In `crm-index.html`, update these lines with your actual GitHub username and repository name:

```html
<link rel="stylesheet" href="https://YOUR-GITHUB-USERNAME.github.io/YOUR-CRM-REPO/crm-styles.css">
<script src="https://YOUR-GITHUB-USERNAME.github.io/YOUR-CRM-REPO/firebase-config.js"></script>
<script src="https://YOUR-GITHUB-USERNAME.github.io/YOUR-CRM-REPO/crm-app.js"></script>
```

### 3. Firebase Configuration
The system is already configured to use your existing Firebase project:
- Project ID: `power-choosers-crm`
- Collections used: `accounts`, `contacts`, `activities`

No additional Firebase setup is required as it uses your existing configuration.

## Usage

### Navigation
- **Dashboard**: Overview and quick stats
- **Accounts**: Manage company accounts
- **Contacts**: Manage individual contacts
- **Calls Hub**: Link to your existing cold calling system

### Adding Data
1. Click "New Account" or "New Contact" buttons
2. Fill out the required information
3. Save to store in Firebase

### Account Details
- Click on any account card to view detailed information
- See all contacts associated with the account
- View activity history
- Add notes and track interactions

### Activities
- All actions are automatically logged
- View recent activities on the dashboard
- Account-specific activities on account detail pages

## Data Structure

### Accounts Collection
```javascript
{
  id: "unique-id",
  name: "Company Name",
  industry: "Manufacturing",
  phone: "555-123-4567",
  website: "https://company.com",
  address: "123 Main St, City, State",
  createdAt: timestamp,
  updatedAt: timestamp
}
```

### Contacts Collection
```javascript
{
  id: "unique-id",
  firstName: "John",
  lastName: "Doe",
  title: "Manager",
  accountId: "account-id",
  accountName: "Company Name",
  email: "john@company.com",
  phone: "555-123-4567",
  notes: "Contact notes",
  createdAt: timestamp,
  updatedAt: timestamp
}
```

### Activities Collection
```javascript
{
  id: "unique-id",
  type: "account_created",
  description: "Created account: Company Name",
  accountId: "account-id",
  accountName: "Company Name",
  contactId: "contact-id", // optional
  contactName: "John Doe", // optional
  noteContent: "Note text", // optional
  createdAt: timestamp
}
```

## Customization

### Adding New Fields
1. Update the HTML forms in `crm-index.html`
2. Modify the form submission handlers in `crm-app.js`
3. Update the display functions to show new fields

### Styling Changes
- All styles are in `crm-styles.css`
- Uses CSS Grid and Flexbox for responsive design
- Color scheme based on Power Choosers branding

### Adding New Features
- Add new view containers in `crm-index.html`
- Create navigation buttons and update routing
- Add corresponding functions in `crm-app.js`

## Responsive Design

The CRM is fully responsive and works on:
- Desktop computers
- Tablets (landscape and portrait)
- Mobile phones
- All modern browsers

## Browser Compatibility

- Chrome (recommended)
- Firefox
- Safari
- Edge

## Support

For questions or issues:
1. Check the browser console for error messages
2. Verify Firebase connection
3. Ensure all file paths are correct for GitHub Pages

## Future Enhancements

Potential features to add:
- Email integration
- Calendar integration
- Advanced reporting
- Task management
- Document storage
- Mobile app
- Export functionality

## Security Notes

- All data is stored in Firebase with your existing security rules
- No sensitive data should be stored in the client-side code
- Consider implementing user authentication for production use