// Maps high-level title vectors to specific job title keywords
export const TITLE_VECTORS: Record<string, string[]> = {
  'Executive': [
    'CEO', 'Chief Executive Officer', 'President', 'Vice President', 'VP', 'Owner', 
    'Principal', 'Founder', 'Managing Director', 'Partner', 'Executive', 
    'Chairman', 'Board Member', 'Director', 'Head of', 'V.P.', 'Vice-President',
    'Franchisee', 'Superintendent', 'Managing Partner'
  ],
  'Operations': [
    'Operations', 'Facility Manager', 'Operations Manager', 'Director of Operations', 
    'COO', 'Chief Operating Officer', 'General Manager', 'Plant Manager', 
    'Facilities', 'Maintenance Manager', 'Project Manager', 'Site Manager',
    'Warehouse Manager', 'Shop Manager', 'Fleet Manager', 'Asset Manager',
    'Maintenance', 'Production Manager'
  ],
  'Finance': [
    'CFO', 'Chief Financial Officer', 'Finance', 'Controller', 'Accounting', 
    'Treasurer', 'Finance Manager', 'Director of Finance', 'Bookkeeper',
    'Accounts Payable', 'Accountant', 'Controller', 'Treasury'
  ],
  'Technology': [
    'CTO', 'Chief Technology Officer', 'IT', 'Information Technology', 
    'Director of IT', 'Systems Manager', 'Network Administrator', 'IT Manager',
    'Technology', 'Systems Admin', 'Infrastructure', 'Technical Director'
  ],
  'Sustainability & Energy': [
    'Sustainability', 'Energy Manager', 'Director of Sustainability', 
    'Environmental', 'ESG', 'Sustainability Coordinator', 'Energy Consultant',
    'Energy Strategy', 'Energy Sourcing', 'Utility Manager'
  ],
  'Procurement & Supply Chain': [
    'Procurement', 'Sourcing', 'Supply Chain', 'Purchasing', 'Buyer', 
    'Vendor Relations', 'Purchasing Manager', 'Director of Procurement',
    'Strategic Sourcing'
  ],
  'Sales & Marketing': [
    'Sales', 'Marketing', 'Business Development', 'Account Manager', 
    'Account Executive', 'Sales Manager', 'Director of Sales', 
    'Commercial Director', 'Brand Manager'
  ],
  'Engineering': [
    'Engineering', 'Engineer', 'Director of Engineering', 'Chief Engineer',
    'Maintenance Engineer', 'VP Engineering'
  ]
};

// Helper to get all title strings for a given set of vectors
export function getTitleFilters(selectedVectors: string[]): string[] {
  return selectedVectors.flatMap(vector => TITLE_VECTORS[vector] || [vector]);
}
