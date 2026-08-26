/**
 * Multi-Tenant E-Commerce Financial Intelligence SaaS API Router & SPA Engine
 * B-COMPASS — Know Your Business. Know Your Direction.
 */

import { handleAuthRoutes }       from './auth/routes.js';
import { handleOnboardingRoutes } from './onboarding/routes.js';
import { authenticateUser,
         authorizeOrgMembership } from './auth/middleware.js';
import { processImportJob }        from './import/importEngine.js';
import { processCsvImport }        from './import/csvImporter.js';
import { getFinancialSummary,
         getChannelBreakdown,
         reconcilePayouts }        from './reporting/financialEngine.js';

const HTML_APP = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>B-COMPASS — Know Your Business. Know Your Direction.</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Playfair+Display:wght@700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-main: #f8fafc;
      --bg-sidebar: #0f2042;
      --bg-sidebar-active: rgba(255,255,255,0.08);
      --bg-card: #ffffff;
      --border-color: #e2e8f0;
      --border-dark: #1e293b;
      --text-main: #0f172a;
      --text-muted: #64748b;
      --text-sidebar: #94a3b8;
      --navy: #0f2042;
      --navy-light: #16284e;
      --green: #1e7e45;
      --green-hover: #166534;
      --green-bg: #dcfce7;
      --warning-bg: #fef3c7;
      --warning-text: #92400e;
      --danger-bg: #fee2e2;
      --danger-text: #991b1b;
      --radius: 6px;
      --shadow-sm: 0 1px 3px rgba(15,23,42,0.06);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', system-ui, -apple-system, sans-serif; background: var(--bg-main); color: var(--text-main); display: flex; height: 100vh; overflow: hidden; font-size: 0.875rem; }
    
    /* Auth Overlay */
    .auth-overlay { position: fixed; inset: 0; background: #0f2042; display: flex; align-items: center; justify-content: center; z-index: 2000; padding: 1.5rem; }
    .auth-card { background: #ffffff; border-radius: 12px; width: 100%; max-width: 440px; padding: 2.25rem; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.3); display: flex; flex-direction: column; gap: 1.25rem; }
    .auth-brand { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 0.35rem; }
    .logo-container { display: flex; align-items: center; gap: 0.5rem; }
    .logo-b { font-family: 'Playfair Display', Georgia, serif; font-size: 2.2rem; font-weight: 800; color: var(--navy); line-height: 1; }
    .logo-text { font-size: 1.35rem; font-weight: 800; letter-spacing: 1px; color: var(--navy); text-transform: uppercase; }
    .tagline { font-size: 0.725rem; font-weight: 700; color: var(--green); letter-spacing: 0.8px; text-transform: uppercase; }
    
    /* Sidebar */
    aside { width: 250px; background: var(--bg-sidebar); border-right: 1px solid var(--navy-light); display: flex; flex-direction: column; color: #fff; }
    .sidebar-brand { padding: 1.5rem 1.25rem; display: flex; flex-direction: column; gap: 0.2rem; border-bottom: 1px solid rgba(255,255,255,0.08); }
    .sidebar-brand .name { font-size: 1.1rem; font-weight: 800; color: #fff; letter-spacing: 0.5px; }
    .sidebar-brand .sub { font-size: 0.65rem; color: #4ade80; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
    
    .org-selector { padding: 1rem 1.25rem; border-bottom: 1px solid rgba(255,255,255,0.08); }
    .org-selector label { font-size: 0.65rem; font-weight: 700; text-transform: uppercase; color: var(--text-sidebar); display: block; margin-bottom: 0.35rem; }
    .org-selector select { width: 100%; background: #16284e; border: 1px solid #2a3854; color: #fff; border-radius: 4px; padding: 0.5rem; font-size: 0.8rem; font-weight: 600; outline: none; cursor: pointer; }
    
    nav { padding: 1rem 0.75rem; display: flex; flex-direction: column; gap: 0.25rem; flex: 1; overflow-y: auto; }
    .nav-item { display: flex; align-items: center; gap: 0.75rem; padding: 0.65rem 0.85rem; color: var(--text-sidebar); font-size: 0.85rem; font-weight: 500; border-radius: 6px; cursor: pointer; border: none; background: transparent; text-align: left; width: 100%; transition: all 0.15s ease; }
    .nav-item:hover { background: rgba(255,255,255,0.05); color: #fff; }
    .nav-item.active { background: var(--green); color: #fff; font-weight: 600; }
    .nav-item svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; flex-shrink: 0; }
    
    .sidebar-user { padding: 1rem 1.25rem; border-top: 1px solid rgba(255,255,255,0.08); background: #0a1730; display: flex; flex-direction: column; gap: 0.5rem; }
    .user-name { font-weight: 600; font-size: 0.8rem; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    
    /* Main Area */
    main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
    header { height: 60px; background: #ffffff; border-bottom: 1px solid var(--border-color); padding: 0 2rem; display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
    .header-title { font-size: 1.15rem; font-weight: 700; color: var(--navy); }
    .header-actions { display: flex; gap: 0.75rem; }
    
    .content-area { flex: 1; padding: 2rem; overflow-y: auto; display: flex; flex-direction: column; gap: 1.5rem; }
    
    /* Cards & Grids */
    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; }
    .kpi-card { background: #ffffff; border: 1px solid var(--border-color); border-radius: var(--radius); padding: 1.25rem; box-shadow: var(--shadow-sm); display: flex; flex-direction: column; gap: 0.35rem; }
    .kpi-label { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.5px; }
    .kpi-val { font-size: 1.5rem; font-weight: 800; color: var(--navy); }
    .kpi-sub { font-size: 0.75rem; color: var(--text-muted); }
    
    .card { background: #ffffff; border: 1px solid var(--border-color); border-radius: var(--radius); box-shadow: var(--shadow-sm); overflow: hidden; }
    .card-header { padding: 1rem 1.25rem; border-bottom: 1px solid var(--border-color); display: flex; align-items: center; justify-content: space-between; background: #fafafa; }
    .card-title { font-size: 0.95rem; font-weight: 700; color: var(--navy); }
    
    /* Buttons & Controls */
    .btn { padding: 0.5rem 1rem; font-size: 0.8rem; font-weight: 600; border-radius: var(--radius); cursor: pointer; border: 1px solid transparent; transition: all 0.15s ease; display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem; outline: none; }
    .btn-green { background: var(--green); color: #ffffff; }
    .btn-green:hover { background: var(--green-hover); }
    .btn-navy { background: var(--navy); color: #ffffff; }
    .btn-navy:hover { background: var(--navy-light); }
    .btn-outline { background: #ffffff; border-color: var(--border-color); color: var(--text-main); }
    .btn-outline:hover { background: #f8fafc; border-color: #cbd5e1; }
    
    /* Forms & Inputs */
    .form-group { display: flex; flex-direction: column; gap: 0.35rem; }
    .form-group label { font-size: 0.75rem; font-weight: 600; color: var(--text-main); }
    .form-control { background: #ffffff; border: 1px solid var(--border-color); border-radius: var(--radius); padding: 0.55rem 0.75rem; color: var(--text-main); font-size: 0.85rem; outline: none; transition: border-color 0.15s ease; width: 100%; }
    .form-control:focus { border-color: var(--green); }
    
    /* Tables */
    table { width: 100%; border-collapse: collapse; text-align: left; font-size: 0.825rem; }
    th { background: #f8fafc; color: var(--text-muted); font-weight: 600; padding: 0.75rem 1.25rem; border-bottom: 1px solid var(--border-color); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; }
    td { padding: 0.85rem 1.25rem; border-bottom: 1px solid var(--border-color); color: var(--text-main); vertical-align: middle; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: #f8fafc; }
    
    /* Badges */
    .badge { display: inline-flex; align-items: center; padding: 0.2rem 0.5rem; font-size: 0.7rem; font-weight: 700; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.3px; }
    .badge-success { background: var(--green-bg); color: #15803d; }
    .badge-warning { background: var(--warning-bg); color: var(--warning-text); }
    .badge-danger { background: var(--danger-bg); color: var(--danger-text); }
    
    /* Modals */
    .modal-overlay { position: fixed; inset: 0; background: rgba(15,32,66,0.6); backdrop-filter: blur(2px); display: none; align-items: center; justify-content: center; z-index: 1000; padding: 1rem; }
    .modal-overlay.active { display: flex; }
    .modal { background: #ffffff; border-radius: 8px; width: 100%; max-width: 580px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.2); overflow: hidden; display: flex; flex-direction: column; }
    .modal-header { padding: 1.25rem 1.5rem; border-bottom: 1px solid var(--border-color); display: flex; align-items: center; justify-content: space-between; background: #fafafa; }
    .modal-title { font-weight: 700; font-size: 1rem; color: var(--navy); }
    .modal-body { padding: 1.5rem; display: flex; flex-direction: column; gap: 1.25rem; max-height: 80vh; overflow-y: auto; }
    
    .attention-card { background: #fffbeb; border: 1px solid #fde68a; border-radius: var(--radius); padding: 1rem 1.25rem; display: flex; justify-content: space-between; align-items: center; gap: 1rem; }
    .attention-card.danger { background: #fef2f2; border-color: #fecaca; }
    
    .mapping-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; background: #f8fafc; padding: 1rem; border-radius: 6px; border: 1px solid var(--border-color); max-height: 220px; overflow-y: auto; }
  </style>
</head>
<body>

  <!-- Auth Screen -->
  <div class="auth-overlay" id="authScreen">
    <div class="auth-card">
      <div class="auth-brand">
        <div class="logo-container">
          <span class="logo-b">B</span>
          <span class="logo-text">B-COMPASS</span>
        </div>
        <div class="tagline">KNOW YOUR BUSINESS. KNOW YOUR DIRECTION.</div>
      </div>

      <button type="button" id="quickDemoBtn" class="btn btn-green" style="padding: 0.75rem; font-weight: 700; font-size: 0.85rem;" onclick="handleQuickDemoLogin()">
        ⚡ Quick Demo Login (One-Click Start)
      </button>

      <div style="text-align:center; font-size:0.7rem; font-weight:700; color:var(--text-muted); letter-spacing:0.5px;">— OR SIGN IN WITH YOUR ACCOUNT —</div>

      <div style="display:flex; border-bottom:1px solid var(--border-color);">
        <button type="button" id="tabSignin" style="flex:1; padding:0.6rem; background:transparent; border:none; border-bottom:2px solid var(--green); color:var(--green); font-weight:700; cursor:pointer;" onclick="setAuthMode(false)">Sign In</button>
        <button type="button" id="tabSignup" style="flex:1; padding:0.6rem; background:transparent; border:none; border-bottom:2px solid transparent; color:var(--text-muted); font-weight:600; cursor:pointer;" onclick="setAuthMode(true)">Create Account</button>
      </div>

      <div id="authErrorMsg" style="display:none; padding:0.6rem 0.8rem; background:var(--danger-bg); border:1px solid #fca5a5; border-radius:6px; color:var(--danger-text); font-size:0.8rem; text-align:center; font-weight:600;"></div>

      <form id="authForm" onsubmit="event.preventDefault(); handleAuthSubmit();" style="display:flex; flex-direction:column; gap:0.85rem;">
        <div class="form-group" id="nameGroup" style="display:none;">
          <label>Full Name</label>
          <input type="text" id="authName" class="form-control" placeholder="Jane Merchant" autocomplete="name">
        </div>
        <div class="form-group" id="orgNameGroup" style="display:none;">
          <label>Organization / Business Name</label>
          <input type="text" id="authOrgName" class="form-control" placeholder="Jane Retail Ltd" autocomplete="organization">
        </div>
        <div class="form-group">
          <label>Email Address</label>
          <input type="email" id="authEmail" class="form-control" placeholder="jane@merchant.com" required autocomplete="email">
        </div>
        <div class="form-group">
          <label>Password</label>
          <input type="password" id="authPassword" class="form-control" placeholder="Minimum 8 characters" required autocomplete="current-password">
        </div>
        <button type="submit" class="btn btn-navy" style="padding:0.75rem; margin-top:0.25rem;" id="authSubmitBtn">Sign In</button>
      </form>
    </div>
  </div>

  <!-- Sidebar Navigation -->
  <aside>
    <div class="sidebar-brand">
      <div style="display:flex; align-items:center; gap:0.4rem;">
        <span style="font-family:'Playfair Display', Georgia, serif; font-size:1.4rem; font-weight:800; color:#fff;">B</span>
        <span class="name">B-COMPASS</span>
      </div>
      <div class="sub">KNOW YOUR BUSINESS. KNOW YOUR DIRECTION.</div>
    </div>
    <div class="org-selector">
      <label>Authorized Tenant</label>
      <select id="orgSelect" onchange="switchOrg(this.value)"></select>
    </div>
    <nav>
      <button type="button" class="nav-item active" onclick="showView('overview', event)">
        <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
        Overview Dashboard
      </button>
      <button type="button" class="nav-item" onclick="showView('sales', event)">
        <svg viewBox="0 0 24 24"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>
        Sales & Unified Orders
      </button>
      <button type="button" class="nav-item" onclick="showView('cogs', event)">
        <svg viewBox="0 0 24 24"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
        Product Costs (COGS)
      </button>
      <button type="button" class="nav-item" onclick="showView('payouts', event)">
        <svg viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line></svg>
        Payout Reconciliation
      </button>
      <button type="button" class="nav-item" onclick="showView('reports', event)">
        <svg viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
        Reports (P&L Ledger)
      </button>
      <button type="button" class="nav-item" onclick="showView('imports', event)">
        <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
        Imports & Audit Jobs
      </button>
      <button type="button" class="nav-item" onclick="showView('integrations', event)">
        <svg viewBox="0 0 24 24"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>
        Sales Channels
      </button>
      <button type="button" class="nav-item" onclick="showView('settings', event)">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
        Organization Settings
      </button>
    </nav>
    <div class="sidebar-user">
      <div class="user-name" id="userInfo">Not Authenticated</div>
      <button type="button" class="btn btn-outline" style="width:100%; justify-content:center; padding:0.4rem; font-size:0.75rem;" onclick="logout()">Sign Out</button>
    </div>
  </aside>

  <!-- Main View Area -->
  <main>
    <header>
      <div class="header-title" id="pageTitle">Overview Dashboard</div>
      <div class="header-actions">
        <button type="button" class="btn btn-outline" onclick="openOnboardingWizard()">Guided Setup</button>
        <button type="button" class="btn btn-green" onclick="openImportModal()">+ Import Data</button>
      </div>
    </header>
    <div class="content-area" id="contentArea"></div>
  </main>

  <!-- Guided Onboarding Modal -->
  <div class="modal-overlay" id="onboardingWizardModal">
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title" id="wizardStepTitle">Step 1: Business Setup</div>
        <button type="button" class="btn btn-outline" style="padding:0.25rem 0.5rem;" onclick="closeModal('onboardingWizardModal')">✕</button>
      </div>
      <div class="modal-body">
        <div id="wizardStep1" style="display:flex; flex-direction:column; gap:1rem;">
          <div class="form-group"><label>Business Name</label><input type="text" id="obOrgName" class="form-control" placeholder="e.g. Acme Commerce Ltd"></div>
          <div class="form-group"><label>Base Reporting Currency</label><select id="obCurrency" class="form-control"><option value="GBP">GBP (£)</option><option value="USD">USD ($)</option><option value="EUR">EUR (€)</option></select></div>
          <div class="form-group"><label>Primary Region</label><select id="obRegion" class="form-control"><option value="UK">United Kingdom</option><option value="US">United States</option><option value="EU">European Union</option></select></div>
          <button type="button" class="btn btn-green" style="padding:0.75rem;" onclick="saveOnboardingStep1()">Next: Primary Objective →</button>
        </div>

        <div id="wizardStep2" style="display:none; flex-direction:column; gap:1rem;">
          <div class="form-group">
            <label>What is your primary goal for B-COMPASS?</label>
            <select id="obObjective" class="form-control">
              <option value="finance_intelligence">Understand My E-Commerce Finances (Sales, Margins, Payouts)</option>
              <option value="prepare_books">Prepare My Books (Reconciliation & Clean Ledger)</option>
              <option value="automate_accounting">Automate Accounting (Prepared for QuickBooks / Platforms)</option>
            </select>
          </div>
          <button type="button" class="btn btn-green" style="padding:0.75rem;" onclick="saveOnboardingStep2()">Next: Connect Channels →</button>
        </div>

        <div id="wizardStep3" style="display:none; flex-direction:column; gap:1rem;">
          <div style="color:var(--text-muted); font-size:0.85rem;">Select your active sales channels to start ingesting orders & settlement payouts:</div>
          <div style="display:flex; flex-direction:column; gap:0.75rem;">
            <div style="background:#f8fafc; border:1px solid var(--border-color); padding:0.75rem; border-radius:6px; display:flex; justify-content:space-between; align-items:center;">
              <div><strong>Shopify</strong> <span class="badge badge-success" style="margin-left:0.5rem;">Ready</span></div>
              <button type="button" class="btn btn-outline" onclick="closeModal('onboardingWizardModal'); openImportModal();">Import Data</button>
            </div>
            <div style="background:#f8fafc; border:1px solid var(--border-color); padding:0.75rem; border-radius:6px; display:flex; justify-content:space-between; align-items:center;">
              <div><strong>TikTok Shop</strong> <span class="badge badge-success" style="margin-left:0.5rem;">Ready</span></div>
              <button type="button" class="btn btn-outline" onclick="closeModal('onboardingWizardModal'); openImportModal();">Import Data</button>
            </div>
            <div style="background:#f8fafc; border:1px solid var(--border-color); padding:0.75rem; border-radius:6px; display:flex; justify-content:space-between; align-items:center;">
              <div><strong>Custom CSV Upload</strong> <span class="badge badge-success" style="margin-left:0.5rem;">Header Mapper</span></div>
              <button type="button" class="btn btn-outline" onclick="closeModal('onboardingWizardModal'); openImportModal();">Upload CSV</button>
            </div>
          </div>
          <button type="button" class="btn btn-green" style="padding:0.75rem; margin-top:0.5rem;" onclick="closeModal('onboardingWizardModal'); renderView();">Complete Setup & View Dashboard</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Interactive Data Import Wizard Modal -->
  <div class="modal-overlay" id="importModal">
    <div class="modal" style="max-width: 620px;">
      <div class="modal-header">
        <div class="modal-title">Import & Normalize Channel Data</div>
        <button type="button" class="btn btn-outline" style="padding:0.25rem 0.5rem;" onclick="closeModal('importModal')">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>Select Channel / Provider</label>
          <select id="importProvider" class="form-control" onchange="toggleImportFormat(this.value)">
            <option value="shopify">Shopify (JSON Payload)</option>
            <option value="tiktok">TikTok Shop (JSON Payload)</option>
            <option value="woocommerce">WooCommerce (JSON Payload)</option>
            <option value="csv" selected>Custom CSV Import (Interactive File & Column Mapper)</option>
          </select>
        </div>

        <div class="form-group" id="jsonInputGroup" style="display:none;">
          <label>JSON Data Array</label>
          <textarea id="importJsonPayload" class="form-control" style="min-height:100px; font-family:monospace; font-size:0.8rem;" placeholder='[{"id": "1001", "name": "#1001", "subtotal_price": 250.00, "processing_fee": 7.50}]'></textarea>
        </div>

        <div class="form-group" id="csvInputGroup" style="display:flex; flex-direction:column; gap:0.8rem;">
          <label>Choose Local CSV File</label>
          <input type="file" id="csvFileInput" accept=".csv" class="form-control" onchange="handleCsvFileUpload(event)" />
          
          <div id="csvHeadersSection" style="display:none;">
            <div style="font-size:0.8rem; font-weight:700; color:var(--navy); margin-bottom:0.4rem;">Map CSV Columns to Canonical Order Fields:</div>
            <div class="mapping-grid" id="csvMappingGrid"></div>
          </div>

          <div style="display:flex; gap:0.5rem;">
            <button type="button" class="btn btn-outline" onclick="validateCsvMapping()">Run Validation Preview</button>
          </div>

          <div id="csvValidationBox" style="display:none; padding:0.75rem; background:#f8fafc; border:1px solid var(--border-color); border-radius:6px; font-size:0.8rem;"></div>
        </div>

        <button type="button" class="btn btn-green" style="padding:0.75rem; margin-top:0.5rem;" id="startImportBtn" onclick="submitImport()">Run Import & Normalization</button>
      </div>
    </div>
  </div>

  <script>
    let authToken = localStorage.getItem('fin_saas_token') || null;
    let currentUser = null;
    let userOrgs = [];
    let currentOrgId = null;
    let currentView = 'overview';
    let isSignupMode = false;
    let parsedCsvRows = [];
    let detectedCsvHeaders = [];

    async function init() {
      if (!authToken) {
        showAuthScreen();
        return;
      }
      try {
        const res = await fetch('/api/v1/auth/me', {
          headers: { 'Authorization': 'Bearer ' + authToken }
        });
        const data = await res.json();
        if (data.ok) {
          currentUser = data.user;
          userOrgs = data.orgs || [];
          if (userOrgs.length > 0) {
            currentOrgId = userOrgs[0].id;
            updateOrgSelect();
            hideAuthScreen();
            renderView();
          } else {
            showAuthScreen();
          }
        } else {
          logout();
        }
      } catch (e) {
        showAuthScreen();
      }
    }

    function setAuthMode(signup) {
      isSignupMode = signup;
      const errBox = document.getElementById('authErrorMsg');
      if (errBox) errBox.style.display = 'none';
      
      const tabSignin = document.getElementById('tabSignin');
      const tabSignup = document.getElementById('tabSignup');
      if (tabSignin && tabSignup) {
        tabSignin.style.borderBottomColor = signup ? 'transparent' : 'var(--green)';
        tabSignin.style.color = signup ? 'var(--text-muted)' : 'var(--green)';
        tabSignin.style.fontWeight = signup ? '600' : '700';

        tabSignup.style.borderBottomColor = signup ? 'var(--green)' : 'transparent';
        tabSignup.style.color = signup ? 'var(--green)' : 'var(--text-muted)';
        tabSignup.style.fontWeight = signup ? '700' : '600';
      }

      document.getElementById('authSubmitBtn').innerText = isSignupMode ? 'Create Account & Start' : 'Sign In';
      document.getElementById('nameGroup').style.display = isSignupMode ? 'flex' : 'none';
      document.getElementById('orgNameGroup').style.display = isSignupMode ? 'flex' : 'none';
    }

    function toggleAuthMode() {
      setAuthMode(!isSignupMode);
    }

    async function handleQuickDemoLogin() {
      const errBox = document.getElementById('authErrorMsg');
      if (errBox) errBox.style.display = 'none';

      const demoId = Date.now().toString().slice(-5);
      const email = 'demo_' + demoId + '@bcompass.com';
      const password = 'DemoPassword123!';
      const name = 'Demo Merchant';
      const orgName = 'B-COMPASS Demo Store #' + demoId;

      const btn = document.getElementById('quickDemoBtn');
      if (btn) { btn.innerText = '⚡ Logging in Demo Account...'; btn.disabled = true; }

      try {
        const res = await fetch('/api/v1/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, name, orgName })
        });
        const data = await res.json();
        if (data.ok) {
          authToken = data.token;
          localStorage.setItem('fin_saas_token', authToken);
          await init();
          openOnboardingWizard();
        } else {
          showAuthError(data.error || 'Demo login failed');
        }
      } catch (err) {
        showAuthError('Network Error: Unable to complete demo login');
      } finally {
        if (btn) { btn.innerText = '⚡ Quick Demo Login (One-Click Start)'; btn.disabled = false; }
      }
    }

    function showAuthError(msg) {
      const box = document.getElementById('authErrorMsg');
      if (box) {
        box.innerText = msg;
        box.style.display = 'block';
      } else {
        alert(msg);
      }
    }

    async function handleAuthSubmit() {
      const errBox = document.getElementById('authErrorMsg');
      if (errBox) errBox.style.display = 'none';

      const email = document.getElementById('authEmail').value.trim();
      const password = document.getElementById('authPassword').value;

      if (!email) { showAuthError('Please enter your email address.'); return; }
      if (!password) { showAuthError('Please enter your password.'); return; }
      if (isSignupMode && password.length < 8) { showAuthError('Password must be at least 8 characters long.'); return; }

      const btn = document.getElementById('authSubmitBtn');
      const origText = btn.innerText;
      btn.innerText = 'Processing...';
      btn.disabled = true;

      const endpoint = isSignupMode ? '/api/v1/auth/signup' : '/api/v1/auth/login';
      const payload = { email, password };
      if (isSignupMode) {
        payload.name = document.getElementById('authName').value.trim() || 'Jane Merchant';
        payload.orgName = document.getElementById('authOrgName').value.trim() || 'Jane Retail Ltd';
      }

      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.ok) {
          authToken = data.token;
          localStorage.setItem('fin_saas_token', authToken);
          await init();
          if (isSignupMode) openOnboardingWizard();
        } else {
          showAuthError(data.error || 'Authentication failed');
        }
      } catch (err) {
        showAuthError('Network Error: Unable to reach SaaS API backend');
      } finally {
        btn.innerText = origText;
        btn.disabled = false;
      }
    }

    function logout() {
      if (authToken) {
        fetch('/api/v1/auth/logout', { method: 'POST', headers: { 'Authorization': 'Bearer ' + authToken } });
      }
      authToken = null;
      currentUser = null;
      userOrgs = [];
      currentOrgId = null;
      localStorage.removeItem('fin_saas_token');
      showAuthScreen();
    }

    function showAuthScreen() { document.getElementById('authScreen').style.display = 'flex'; }
    function hideAuthScreen() { document.getElementById('authScreen').style.display = 'none'; }

    function updateOrgSelect() {
      const select = document.getElementById('orgSelect');
      select.innerHTML = userOrgs.map(o => '<option value="' + o.id + '">' + o.name + ' (' + o.role + ')</option>').join('');
      select.value = currentOrgId;
      document.getElementById('userInfo').innerText = currentUser ? currentUser.name + ' (' + currentUser.email + ')' : '';
    }

    function switchOrg(newOrgId) { currentOrgId = newOrgId; renderView(); }

    function showView(viewName, evt) {
      currentView = viewName;
      document.querySelectorAll('nav .nav-item').forEach(btn => btn.classList.remove('active'));
      if (evt && evt.currentTarget) evt.currentTarget.classList.add('active');
      renderView();
    }

    async function authFetch(url, options = {}) {
      options.headers = options.headers || {};
      options.headers['Authorization'] = 'Bearer ' + authToken;
      options.headers['X-Org-ID'] = currentOrgId;
      const res = await fetch(url, options);
      if (res.status === 401 || res.status === 403) {
        const data = await res.json();
        throw new Error(data.error || 'Unauthorized tenant access');
      }
      return res;
    }

    async function renderView() {
      if (!currentOrgId) return;
      const titleMap = { overview: 'Overview Dashboard', sales: 'Sales & Unified Orders', cogs: 'Product Costs (COGS)', payouts: 'Payout Reconciliation & Discrepancies', reports: 'Financial Performance & P&L Ledger', imports: 'Imports & Audit Jobs', integrations: 'Sales Channels', settings: 'Organization Settings' };
      document.getElementById('pageTitle').innerText = titleMap[currentView] || 'Dashboard';
      const container = document.getElementById('contentArea');
      container.innerHTML = '<div style="color:var(--text-muted); padding:1rem;">Loading verified financial ledger data...</div>';

      try {
        if (currentView === 'overview') await renderOverview(container);
        else if (currentView === 'sales') await renderSales(container);
        else if (currentView === 'cogs') await renderCogs(container);
        else if (currentView === 'payouts') await renderPayouts(container);
        else if (currentView === 'reports') await renderReports(container);
        else if (currentView === 'imports') await renderImports(container);
        else if (currentView === 'integrations') await renderIntegrations(container);
        else if (currentView === 'settings') renderSettings(container);
      } catch (err) {
        container.innerHTML = '<div class="card" style="padding:1.5rem; color:var(--danger-text);">Authorization / Server Error: ' + err.message + '</div>';
      }
    }

    async function renderOverview(container) {
      const pnlRes = await authFetch('/api/v1/reports/financial?orgId=' + currentOrgId);
      const pnlData = await pnlRes.json();
      const m = pnlData.report?.metrics || { grossSales: 0, netSales: 0, totalRefunds: 0, totalFees: 0, netProceeds: 0, totalCogs: 0, grossProfit: 0, grossMarginPercent: 0 };

      const attRes = await authFetch('/api/v1/reports/attention?orgId=' + currentOrgId);
      const attData = await attRes.json();

      let attentionHtml = '';
      if (attData.attentionItems && attData.attentionItems.length > 0) {
        attentionHtml = attData.attentionItems.map(item =>
          '<div class="attention-card ' + item.severity + '">' +
            '<div>' +
              '<strong style="color:var(--navy); font-size:0.9rem;">' + item.title + '</strong>' +
              '<div style="font-size:0.8rem; color:var(--text-muted); margin-top:0.2rem;">' + item.message + '</div>' +
            '</div>' +
            '<button type="button" class="btn btn-outline" onclick="showView(' + JSON.stringify(item.actionView) + ')">Resolve</button>' +
          '</div>'
        ).join('');
      }

      if (attData.isEmptyState) {
        container.innerHTML =
          '<div class="card" style="padding:3rem 1.5rem; text-align:center; display:flex; flex-direction:column; align-items:center; gap:1rem;">' +
            '<div style="font-size:1.25rem; font-weight:800; color:var(--navy);">Welcome to B-COMPASS</div>' +
            '<div style="color:var(--text-muted); max-width:460px;">No sales data or orders imported for this organization yet. Ingest channel data or CSV files to calculate real Net Proceeds and Operating Profit.</div>' +
            '<div style="display:flex; gap:1rem; margin-top:0.5rem;">' +
              '<button type="button" class="btn btn-green" onclick="openImportModal()">+ Import Channel Data / CSV</button>' +
              '<button type="button" class="btn btn-outline" onclick="openOnboardingWizard()">Guided Setup</button>' +
            '</div>' +
          '</div>';
        return;
      }

      container.innerHTML =
        (attentionHtml ? '<div style="display:flex; flex-direction:column; gap:0.75rem;">' + attentionHtml + '</div>' : '') +
        '<div class="kpi-grid">' +
          '<div class="kpi-card"><div class="kpi-label">Gross Sales</div><div class="kpi-val">£' + m.grossSales.toLocaleString() + '</div><div class="kpi-sub">Total subtotal revenue</div></div>' +
          '<div class="kpi-card"><div class="kpi-label">Net Sales</div><div class="kpi-val">£' + m.netSales.toLocaleString() + '</div><div class="kpi-sub">After discounts & refunds</div></div>' +
          '<div class="kpi-card"><div class="kpi-label">Platform & Fees</div><div class="kpi-val" style="color:var(--warning-text);">£' + m.totalFees.toLocaleString() + '</div><div class="kpi-sub">Shopify/TikTok/Gateway fees</div></div>' +
          '<div class="kpi-card"><div class="kpi-label">Net Proceeds</div><div class="kpi-val" style="color:var(--green);">£' + m.netProceeds.toLocaleString() + '</div><div class="kpi-sub">Net cash into bank</div></div>' +
          '<div class="kpi-card"><div class="kpi-label">Gross Operating Profit</div><div class="kpi-val">£' + m.grossProfit.toLocaleString() + '</div><div class="kpi-sub">Margin: ' + m.grossMarginPercent + '%</div></div>' +
        '</div>' +
        '<div class="card">' +
          '<div class="card-header"><div class="card-title">Connected Channel Performance</div></div>' +
          '<table>' +
            '<thead><tr><th>Channel Provider</th><th>Channel Name</th><th>Order Count</th><th>Net Revenue</th><th>Status</th></tr></thead>' +
            '<tbody>' +
              '<tr><td>Shopify</td><td>Official Webstore</td><td>--</td><td>£' + m.netSales.toLocaleString() + '</td><td><span class="badge badge-success">Active Normalizer</span></td></tr>' +
              '<tr><td>TikTok Shop</td><td>UK TikTok Store</td><td>--</td><td>£0.00</td><td><span class="badge badge-warning">Import Ready</span></td></tr>' +
              '<tr><td>WooCommerce</td><td>Custom Portal</td><td>--</td><td>£0.00</td><td><span class="badge badge-warning">Import Ready</span></td></tr>' +
            '</tbody>' +
          '</table>' +
        '</div>';
    }

    async function renderCogs(container) {
      const res = await authFetch('/api/v1/products/cogs?orgId=' + currentOrgId);
      const data = await res.json();
      const products = data.products || [];

      let rows = products.map(p =>
        '<tr>' +
          '<td><strong>' + p.sku + '</strong></td>' +
          '<td>' + p.title + '</td>' +
          '<td>' +
            '<div style="display:flex; gap:0.4rem; align-items:center;">' +
              '<input type="number" step="0.01" value="' + p.unit_cost + '" id="cost_' + p.sku + '" class="form-control" style="width:110px;" />' +
              '<button type="button" class="btn btn-outline" onclick="updateCost(' + JSON.stringify(p.sku) + ')">Save</button>' +
            '</div>' +
          '</td>' +
          '<td><span class="badge ' + (p.unit_cost > 0 ? 'badge-success' : 'badge-warning') + '">' + (p.unit_cost > 0 ? 'Costed' : 'Missing Cost') + '</span></td>' +
        '</tr>'
      ).join('');

      if (!rows) rows = '<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:2rem;">No products discovered yet. Import orders to populate the product catalog.</td></tr>';

      container.innerHTML =
        (data.isProfitCalculationIncomplete ? '<div class="attention-card danger"><div><strong style="color:var(--navy);">Profit Calculations Incomplete</strong><div style="font-size:0.8rem; color:var(--text-muted); margin-top:0.2rem;">' + data.uncostedProductsCount + ' products lack unit costs. Update costs below to calculate operating profit.</div></div></div>' : '') +
        '<div class="card">' +
          '<div class="card-header"><div class="card-title">Product Catalog & Unit Cost Management</div></div>' +
          '<table>' +
            '<thead><tr><th>SKU</th><th>Title</th><th>Unit Cost (£)</th><th>Status</th></tr></thead>' +
            '<tbody>' + rows + '</tbody>' +
          '</table>' +
        '</div>';
    }

    async function updateCost(sku) {
      const val = document.getElementById('cost_' + sku).value;
      const res = await authFetch('/api/v1/products/cogs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku, unitCost: parseFloat(val) })
      });
      const data = await res.json();
      if (data.ok) {
        alert('Updated unit cost for SKU ' + sku);
        await renderCogs(document.getElementById('contentArea'));
      }
    }

    async function renderSales(container) {
      container.innerHTML =
        '<div class="card">' +
          '<div class="card-header"><div class="card-title">Unified Canonical Orders</div><button type="button" class="btn btn-green" onclick="openImportModal()">+ Import Orders</button></div>' +
          '<table>' +
            '<thead><tr><th>Order ID</th><th>Provider</th><th>Order #</th><th>Gross</th><th>Discounts</th><th>Net Amount</th><th>Status</th></tr></thead>' +
            '<tbody><tr><td colspan="7" style="color:var(--text-muted); text-align:center; padding:2rem;">Use "+ Import Data" above to ingest Shopify, TikTok, or WooCommerce orders.</td></tr></tbody>' +
          '</table>' +
        '</div>';
    }

    async function renderPayouts(container) {
      const res = await authFetch('/api/v1/reconciliation/payouts?orgId=' + currentOrgId);
      const data = await res.json();
      const recs = data.reconciliations || [];
      let rowsHtml = recs.map(r =>
        '<tr>' +
          '<td>' + r.externalPayoutId + '</td>' +
          '<td>' + r.payoutDate + '</td>' +
          '<td>£' + r.recordedNetPayout.toFixed(2) + '</td>' +
          '<td>£' + r.expectedNetPayout.toFixed(2) + '</td>' +
          '<td style="color:' + (r.discrepancy !== 0 ? 'var(--danger-text)' : 'var(--green)') + '; font-weight:700;">£' + r.discrepancy.toFixed(2) + '</td>' +
          '<td><span class="badge ' + (r.status === 'matched' ? 'badge-success' : 'badge-danger') + '">' + r.status + '</span></td>' +
        '</tr>'
      ).join('');
      if (!rowsHtml) rowsHtml = '<tr><td colspan="6" style="color:var(--text-muted); text-align:center; padding:2rem;">No payout settlements recorded yet for this organization.</td></tr>';
      container.innerHTML = '<div class="card"><div class="card-header"><div class="card-title">Payout Settlement Matching & Discrepancies</div></div><table><thead><tr><th>Settlement Ref</th><th>Payout Date</th><th>Recorded Payout</th><th>Expected Net</th><th>Discrepancy</th><th>Status</th></tr></thead><tbody>' + rowsHtml + '</tbody></table></div>';
    }

    async function renderReports(container) {
      const res = await authFetch('/api/v1/reports/financial?orgId=' + currentOrgId);
      const data = await res.json();
      const m = data.report?.metrics || {};
      container.innerHTML =
        '<div class="card">' +
          '<div class="card-header"><div class="card-title">Financial Performance & P&L Ledger</div></div>' +
          '<table>' +
            '<thead><tr><th>Financial Metric</th><th>Amount (Base Currency)</th><th>% of Gross Sales</th></tr></thead>' +
            '<tbody>' +
              '<tr><td><strong>Gross Sales</strong></td><td>£' + (m.grossSales || 0).toFixed(2) + '</td><td>100.0%</td></tr>' +
              '<tr><td>Less: Discounts</td><td style="color:var(--warning-text);">-£' + (m.totalDiscounts || 0).toFixed(2) + '</td><td>--</td></tr>' +
              '<tr><td>Less: Refunds</td><td style="color:var(--danger-text);">-£' + (m.totalRefunds || 0).toFixed(2) + '</td><td>--</td></tr>' +
              '<tr><td><strong>Net Sales</strong></td><td><strong>£' + (m.netSales || 0).toFixed(2) + '</strong></td><td>--</td></tr>' +
              '<tr><td>Plus: Shipping Income</td><td>+£' + (m.shippingIncome || 0).toFixed(2) + '</td><td>--</td></tr>' +
              '<tr><td>Less: Platform & Processor Fees</td><td style="color:var(--danger-text);">-£' + (m.totalFees || 0).toFixed(2) + '</td><td>--</td></tr>' +
              '<tr><td><strong>Net Cash Proceeds</strong></td><td style="color:var(--green);"><strong>£' + (m.netProceeds || 0).toFixed(2) + '</strong></td><td>--</td></tr>' +
              '<tr><td>Less: COGS (Product Unit Cost)</td><td>-£' + (m.totalCogs || 0).toFixed(2) + '</td><td>--</td></tr>' +
              '<tr><td><strong>Gross Operating Profit</strong></td><td style="color:var(--green); font-weight:800; font-size:0.95rem;">£' + (m.grossProfit || 0).toFixed(2) + '</td><td><strong>Margin: ' + (m.grossMarginPercent || 0) + '%</strong></td></tr>' +
            '</tbody>' +
          '</table>' +
        '</div>';
    }

    async function renderImports(container) {
      container.innerHTML =
        '<div class="card">' +
          '<div class="card-header"><div class="card-title">Import & Audit Logs</div><button type="button" class="btn btn-green" onclick="openImportModal()">+ Launch Import Wizard</button></div>' +
          '<table>' +
            '<thead><tr><th>Job ID</th><th>Import Type</th><th>Total Rows</th><th>Successful</th><th>Skipped/Failed</th><th>Status</th></tr></thead>' +
            '<tbody><tr><td colspan="6" style="color:var(--text-muted); text-align:center; padding:2rem;">Launch the Import Wizard above to ingest historical channel files or API JSON payloads.</td></tr></tbody>' +
          '</table>' +
        '</div>';
    }

    async function renderIntegrations(container) {
      const res = await authFetch('/api/v1/channels/status?orgId=' + currentOrgId);
      const data = await res.json();
      const channels = data.channels || [];

      let cardsHtml = channels.map(c =>
        '<div class="card" style="padding:1.25rem;">' +
          '<div style="font-weight:700; font-size:1rem; color:var(--navy); margin-bottom:0.3rem;">' + c.title + '</div>' +
          '<div style="color:var(--text-muted); font-size:0.8rem; margin-bottom:1rem;">' + c.description + '</div>' +
          '<span class="badge ' + (c.status === 'Connected' ? 'badge-success' : 'badge-warning') + '">' + c.status + '</span>' +
        '</div>'
      ).join('');

      container.innerHTML = '<div class="kpi-grid">' + cardsHtml + '</div>';
    }

    function renderSettings(container) {
      const activeOrg = userOrgs.find(o => o.id === currentOrgId) || {};
      container.innerHTML =
        '<div class="card" style="max-width:540px; padding:1.5rem;">' +
          '<div class="card-title" style="margin-bottom:1.25rem;">Organization Profile & Role Permissions</div>' +
          '<div style="display:flex; flex-direction:column; gap:1rem;">' +
            '<div class="form-group"><label>Tenant ID</label><input type="text" class="form-control" value="' + currentOrgId + '" readonly style="opacity:0.75; font-family:monospace;"></div>' +
            '<div class="form-group"><label>Organization Name</label><input type="text" class="form-control" value="' + (activeOrg.name || '') + '" readonly style="opacity:0.75;"></div>' +
            '<div class="form-group"><label>Your Verified Role</label><input type="text" class="form-control" value="' + ((activeOrg.role || 'viewer').toUpperCase()) + '" readonly style="opacity:0.75; font-weight:700; color:var(--green);"></div>' +
            '<div class="form-group"><label>Base Reporting Currency</label><input type="text" class="form-control" value="' + (activeOrg.base_currency || 'GBP') + '" readonly style="opacity:0.75;"></div>' +
          '</div>' +
        '</div>';
    }

    function openOnboardingWizard() {
      document.getElementById('wizardStep1').style.display = 'flex';
      document.getElementById('wizardStep2').style.display = 'none';
      document.getElementById('wizardStep3').style.display = 'none';
      document.getElementById('wizardStepTitle').innerText = 'Step 1: Business Setup';
      document.getElementById('onboardingWizardModal').classList.add('active');
    }

    async function saveOnboardingStep1() {
      const name = document.getElementById('obOrgName').value.trim() || 'My Store';
      const currency = document.getElementById('obCurrency').value;
      const region = document.getElementById('obRegion').value;
      await authFetch('/api/v1/onboarding/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, currency, region })
      });
      document.getElementById('wizardStep1').style.display = 'none';
      document.getElementById('wizardStep2').style.display = 'flex';
      document.getElementById('wizardStepTitle').innerText = 'Step 2: Primary Objective';
    }

    async function saveOnboardingStep2() {
      const obj = document.getElementById('obObjective').value;
      await authFetch('/api/v1/onboarding/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ primaryObjective: obj })
      });
      document.getElementById('wizardStep2').style.display = 'none';
      document.getElementById('wizardStep3').style.display = 'flex';
      document.getElementById('wizardStepTitle').innerText = 'Step 3: Connect Sales Channels';
    }

    function openImportModal() { document.getElementById('importModal').classList.add('active'); }
    function closeModal(id) { document.getElementById(id).classList.remove('active'); }
    
    function toggleImportFormat(val) {
      if (val === 'csv') {
        document.getElementById('jsonInputGroup').style.display = 'none';
        document.getElementById('csvInputGroup').style.display = 'flex';
      } else {
        document.getElementById('jsonInputGroup').style.display = 'flex';
        document.getElementById('csvInputGroup').style.display = 'none';
      }
    }

    function handleCsvFileUpload(event) {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(e) {
        const text = e.target.result;
        parseCsvText(text);
      };
      reader.readAsText(file);
    }

    function parseCsvText(text) {
      const lines = text.split(/\\r?\\n/).filter(l => l.trim() !== '');
      if (lines.length === 0) return;

      detectedCsvHeaders = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
      parsedCsvRows = [];

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
        const rowObj = {};
        detectedCsvHeaders.forEach((h, idx) => {
          rowObj[h] = cols[idx] || '';
        });
        parsedCsvRows.push(rowObj);
      }

      renderCsvMappingUI();
    }

    function renderCsvMappingUI() {
      const grid = document.getElementById('csvMappingGrid');
      document.getElementById('csvHeadersSection').style.display = 'block';

      const canonicalFields = [
        { key: 'external_order_id', label: 'Order ID / Number (Required)' },
        { key: 'gross_amount', label: 'Gross Sale Total (Required)' },
        { key: 'discount_amount', label: 'Discount Amount' },
        { key: 'shipping_amount', label: 'Shipping Amount' },
        { key: 'tax_amount', label: 'Tax Amount' },
        { key: 'platform_fee', label: 'Platform / Gateway Fee' },
        { key: 'sku', label: 'Product SKU' },
        { key: 'product_title', label: 'Product Title' }
      ];

      grid.innerHTML = canonicalFields.map(f => {
        const optionsHtml = '<option value="">-- Ignore Field --</option>' +
          detectedCsvHeaders.map(h => {
            const autoMatch = (f.key === 'external_order_id' && (h.toLowerCase().includes('order') || h.toLowerCase().includes('invoice') || h.toLowerCase().includes('id'))) ||
                              (f.key === 'gross_amount' && (h.toLowerCase().includes('total') || h.toLowerCase().includes('gross') || h.toLowerCase().includes('amount') || h.toLowerCase().includes('price')));
            return '<option value="' + h + '" ' + (autoMatch ? 'selected' : '') + '>' + h + '</option>';
          }).join('');

        return '<div><label style="font-size:0.75rem; font-weight:600; color:var(--text-muted);">' + f.label + '</label>' +
               '<select id="map_' + f.key + '" class="form-control" style="font-size:0.8rem; padding:0.4rem;">' + optionsHtml + '</select></div>';
      }).join('');
    }

    function buildMappingConfig() {
      const mapping = {};
      const fields = ['external_order_id', 'gross_amount', 'discount_amount', 'shipping_amount', 'tax_amount', 'platform_fee', 'sku', 'product_title'];
      fields.forEach(f => {
        const el = document.getElementById('map_' + f);
        if (el && el.value) mapping[f] = el.value;
      });
      return mapping;
    }

    async function validateCsvMapping() {
      const mapConfig = buildMappingConfig();
      const rows = parsedCsvRows.length > 0 ? parsedCsvRows : JSON.parse(document.getElementById('csvRowsPayload')?.value || '[]');
      
      const res = await authFetch('/api/v1/import/csv/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvRows: rows, columnMapping: mapConfig })
      });
      const data = await res.json();
      const box = document.getElementById('csvValidationBox');
      box.style.display = 'block';
      box.innerHTML =
        '<div style="color:var(--navy); font-weight:700; margin-bottom:0.2rem;">CSV Validation Preview:</div>' +
        '<div>Total Rows: ' + data.totalRowsDetected + ' | Valid Rows: ' + data.validRows + ' | Warnings: ' + data.warningRows + '</div>' +
        '<div>Ready to Import: <strong style="color:' + (data.isReadyToImport ? 'var(--green)' : 'var(--danger-text)') + '">' + (data.isReadyToImport ? 'YES' : 'NO (Missing required fields)') + '</strong></div>';
    }

    async function submitImport() {
      const provider = document.getElementById('importProvider').value;
      let endpoint = '/api/v1/import';
      let payload = {};

      const chnRes = await authFetch('/api/v1/channels/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider, channelName: provider.toUpperCase() + ' Channel' }) });
      const chnData = await chnRes.json();
      const channelId = chnData.channelId;

      if (provider === 'csv') {
        endpoint = '/api/v1/import/csv';
        const mapConfig = buildMappingConfig();
        const rows = parsedCsvRows.length > 0 ? parsedCsvRows : JSON.parse(document.getElementById('csvRowsPayload')?.value || '[]');
        payload = { channelId, csvRows: rows, columnMapping: mapConfig };
      } else {
        const rows = JSON.parse(document.getElementById('importJsonPayload').value || '[]');
        payload = { channelId, provider, rows };
      }

      const res = await authFetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (data.ok) {
        alert('Import Complete! Total: ' + data.result.totalRows + ' | Successful: ' + data.result.successfulRows + ' | Skipped/Failed: ' + (data.result.skippedRows + (data.result.failedRows || 0)));
        closeModal('importModal');
        await renderView();
      } else { alert('Import Error: ' + data.error); }
    }

    window.onerror = function(message, source, lineno, colno, error) {
      console.error('B-COMPASS Global Error:', message, source, lineno, colno, error);
      const errBox = document.getElementById('authErrorMsg');
      if (errBox) {
        errBox.innerText = 'App Error: ' + message;
        errBox.style.display = 'block';
      }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  </script>
</body>
</html>`;

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Org-ID'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url  = new URL(request.url);
    const path = url.pathname;

    try {
      // 1. Serve Web SaaS Dashboard SPA
      if (path === '/' || path === '/app' || path === '/index.html') {
        return new Response(HTML_APP, {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
            'Pragma': 'no-cache',
            'Expires': '0',
            ...corsHeaders
          }
        });
      }

      // 2. Health Check
      if (path === '/health') {
        return json({ ok: true, service: 'fin-saas-api', version: '1.0.0', ts: new Date().toISOString() }, corsHeaders);
      }

      // 3. Public Auth Routes (signup, login, me, logout)
      if (path.startsWith('/api/v1/auth/')) {
        const authRes = await handleAuthRoutes(request, env, path);
        if (authRes) return authRes;
      }

      // ─────────────────────────────────────────────────────────────
      // PROTECTED ROUTES BELOW (Require Authentication & Org Authorization)
      // ─────────────────────────────────────────────────────────────
      const { user } = await authenticateUser(request, env);

      // 4. Onboarding, Channel Status & COGS Routes
      if (path.startsWith('/api/v1/onboarding/') || path === '/api/v1/channels/status' || path === '/api/v1/import/csv/validate' || path === '/api/v1/products/cogs' || path === '/api/v1/reports/attention') {
        const obRes = await handleOnboardingRoutes(request, env, path, user);
        if (obRes) return obRes;
      }

      // Extract Org ID from header or query parameter
      const targetOrgId = request.headers.get('X-Org-ID') || url.searchParams.get('orgId');
      if (!targetOrgId && path !== '/api/v1/orgs/create') {
        return jsonError(400, 'Missing target organization ID (X-Org-ID header required)', corsHeaders);
      }

      // 5. Create Organization (Authenticated user creates & becomes owner)
      if (path === '/api/v1/orgs/create' && request.method === 'POST') {
        const body = await request.json();
        const orgId = `org_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const memId = `mem_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const name  = body.name || 'My E-Commerce Business';
        const curr  = body.currency || 'GBP';

        await env.DB.prepare(`
          INSERT INTO organizations (id, name, base_currency) VALUES (?, ?, ?)
        `).bind(orgId, name, curr).run();

        await env.DB.prepare(`
          INSERT INTO org_memberships (id, org_id, user_id, role) VALUES (?, ?, ?, 'owner')
        `).bind(memId, orgId, user.id).run();

        return json({ ok: true, orgId, name, currency: curr, role: 'owner' }, corsHeaders);
      }

      // Verify Server-Side Membership for Target Org
      const membership = await authorizeOrgMembership(env, user.id, targetOrgId, 'viewer');
      const verifiedOrgId = membership.org_id;

      // 6. Connect Sales Channel (Requires admin or owner role)
      if (path === '/api/v1/channels/connect' && request.method === 'POST') {
        const membership = await authorizeOrgMembership(env, user.id, targetOrgId, 'admin');
        const verifiedOrgId = membership.org_id;
        const body = await request.json();
        const rawProvider = body.provider || 'manual_csv';
        const provider = rawProvider === 'csv' ? 'manual_csv' : rawProvider;
        const channelId = `chn_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

        await env.DB.prepare(`
          INSERT INTO sales_channels (id, org_id, provider, channel_name, external_store_id)
          VALUES (?, ?, ?, ?, ?)
        `).bind(channelId, verifiedOrgId, provider, body.channelName || 'Sales Channel', body.externalStoreId || null).run();

        return json({ ok: true, channelId, provider, name: body.channelName || 'Sales Channel' }, corsHeaders);
      }

      // 7. Data Import & Normalization Endpoint (Requires member role)
      if (path === '/api/v1/import' && request.method === 'POST') {
        await authorizeOrgMembership(env, user.id, targetOrgId, 'member');
        const body = await request.json();
        const result = await processImportJob(env.DB, {
          orgId: verifiedOrgId,
          channelId: body.channelId,
          provider: body.provider,
          rows: body.rows || [],
          importType: body.importType || 'orders',
          sourceName: body.sourceName || 'api_payload'
        });

        return json({ ok: true, result }, corsHeaders);
      }

      // 8. CSV Onboarding & Mapping Endpoint (Requires member role)
      if (path === '/api/v1/import/csv' && request.method === 'POST') {
        await authorizeOrgMembership(env, user.id, targetOrgId, 'member');
        const body = await request.json();
        const result = await processCsvImport(env.DB, {
          orgId: verifiedOrgId,
          channelId: body.channelId,
          csvRows: body.csvRows || [],
          columnMapping: body.columnMapping || {},
          importType: body.importType || 'orders',
          sourceName: body.sourceName || 'custom_upload.csv'
        });

        return json({ ok: true, result }, corsHeaders);
      }

      // 9. Financial P&L Reporting Endpoint
      if (path === '/api/v1/reports/financial' && request.method === 'GET') {
        const start = url.searchParams.get('startDate');
        const end   = url.searchParams.get('endDate');
        const report = await getFinancialSummary(env.DB, verifiedOrgId, start, end);
        return json({ ok: true, report }, corsHeaders);
      }

      // 10. Channel Performance Endpoint
      if (path === '/api/v1/reports/channels' && request.method === 'GET') {
        const channels = await getChannelBreakdown(env.DB, verifiedOrgId);
        return json({ ok: true, channels }, corsHeaders);
      }

      // 11. Payout Reconciliation Endpoint
      if (path === '/api/v1/reconciliation/payouts' && request.method === 'GET') {
        const reconciliations = await reconcilePayouts(env.DB, verifiedOrgId);
        return json({ ok: true, reconciliations }, corsHeaders);
      }

      return jsonError(404, 'Endpoint not found', corsHeaders);

    } catch (err) {
      console.error('SaaS API Error:', err);
      const isAuthErr = err.message.startsWith('UNAUTHENTICATED');
      const isForbErr = err.message.startsWith('FORBIDDEN');
      const status = isAuthErr ? 401 : (isForbErr ? 403 : (err.message.startsWith('BAD_REQUEST') ? 400 : 500));
      return jsonError(status, err.message || 'Internal Server Error', corsHeaders);
    }
  }
};

function json(data, headers, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

function jsonError(status, message, headers) {
  return new Response(JSON.stringify({ ok: false, error: message }), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}
