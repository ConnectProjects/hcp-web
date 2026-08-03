// Lead Finder — Browser Configuration
// Copy this file to config.js and fill in your values.
// config.js is gitignored and must NOT be committed (it contains API keys).
//
// The Supabase anon key is safe to use in the browser because Row Level Security
// enforces that only authenticated users can read or write data.
// Restrict your Google Places API key to your deployment domain in the
// Google Cloud Console to prevent unauthorized usage.

export const SUPABASE_URL      = 'https://your-project-ref.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJ...your-anon-key...';
export const GOOGLE_PLACES_API_KEY = 'AIza...your-places-api-key...';

// Outreach identity
export const LC_NAME      = 'Your Name';                              // Sender display name
export const CLIFF_EMAIL  = 'Cliff.Stephens@connecthearing.ca';       // Reply-To / LC contact
export const OUTREACH_REF = 'NR';                                     // Suffix added to subject: | ref:NR

// Microsoft Graph — required for Outlook draft creation (Mail.ReadWrite scope).
// Register a Single Page Application in Azure AD portal:
//   Redirect URI: your GitHub Pages root (e.g. https://you.github.io)
//   Delegated permission: Mail.ReadWrite (user consent, no admin consent needed)
// Neither value is a secret — both are safe to commit.
export const MSAL_CLIENT_ID = 'your-azure-app-client-id';
export const MSAL_TENANT_ID = 'your-azure-tenant-id'; // or 'common'
