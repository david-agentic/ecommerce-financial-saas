/**
 * B-COMPASS — Multi-Tenant Financial Intelligence SaaS
 * Know Your Business. Know Your Direction.
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
  <meta name="description" content="B-COMPASS Financial Intelligence SaaS. Understand your sales, expenses, profit, cash flow, and business direction.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-main: #f8fafc;
      --bg-sidebar: #0f172a;
      --bg-sidebar-hover: rgba(255,255,255,0.06);
      --bg-sidebar-active: rgba(30,126,69,0.25);
      --bg-card: #ffffff;
      --border: #e2e8f0;
      --border-dark: #1e293b;
      --text: #0f172a;
      --text-muted: #64748b;
      --text-sidebar: #94a3b8;
      --navy: #0f172a;
      --green: #16a34a;
      --green-hover: #15803d;
      --green-bg: #dcfce7;
      --green-text: #166534;
      --warn-bg: #fef3c7;
      --warn-text: #92400e;
      --danger-bg: #fee2e2;
      --danger-text: #991b1b;
      --radius: 6px;
      --shadow: 0 1px 3px rgba(15,23,42,0.06);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', system-ui, -apple-system, sans-serif; background: var(--bg-main); color: var(--text); display: flex; height: 100vh; overflow: hidden; font-size: 14px; }

    /* ── Auth Overlay ── */
    .auth-overlay { position: fixed; inset: 0; background: var(--navy); display: flex; align-items: center; justify-content: center; z-index: 2000; padding: 1.5rem; }
    .auth-card { background: #fff; border-radius: 12px; width: 100%; max-width: 420px; padding: 2.25rem; box-shadow: 0 20px 40px rgba(0,0,0,0.3); display: flex; flex-direction: column; gap: 1.25rem; }
    .auth-brand { text-align: center; }
    .auth-brand .logo { font-size: 1.75rem; font-weight: 800; color: var(--navy); letter-spacing: 1px; }
    .auth-brand .tagline { font-size: 0.7rem; font-weight: 700; color: var(--green); letter-spacing: 0.8px; text-transform: uppercase; margin-top: 0.25rem; }

    /* ── Sidebar ── */
    aside { width: 240px; min-width: 240px; background: var(--bg-sidebar); display: flex; flex-direction: column; color: #fff; border-right: 1px solid var(--border-dark); }
    .sidebar-brand { padding: 1.25rem 1rem; border-bottom: 1px solid rgba(255,255,255,0.08); }
    .sidebar-brand .name { font-size: 1rem; font-weight: 800; color: #fff; letter-spacing: 0.5px; }
    .sidebar-brand .sub { font-size: 0.6rem; color: #4ade80; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 0.15rem; }
    .org-selector { padding: 0.75rem 1rem; border-bottom: 1px solid rgba(255,255,255,0.08); }
    .org-selector label { font-size: 0.6rem; font-weight: 700; text-transform: uppercase; color: var(--text-sidebar); display: block; margin-bottom: 0.3rem; }
    .org-selector select { width: 100%; background: #1e293b; border: 1px solid #334155; color: #fff; border-radius: 4px; padding: 0.4rem 0.5rem; font-size: 0.8rem; font-weight: 600; outline: none; cursor: pointer; }
    nav { padding: 0.75rem 0.5rem; display: flex; flex-direction: column; gap: 2px; flex: 1; overflow-y: auto; }
    .nav-section { font-size: 0.6rem; font-weight: 700; text-transform: uppercase; color: #475569; padding: 0.75rem 0.75rem 0.35rem; letter-spacing: 0.5px; }
    .nav-item { display: flex; align-items: center; gap: 0.65rem; padding: 0.55rem 0.75rem; color: var(--text-sidebar); font-size: 0.8rem; font-weight: 500; border-radius: 5px; cursor: pointer; border: none; background: transparent; text-align: left; width: 100%; transition: all 0.15s ease; }
    .nav-item:hover { background: var(--bg-sidebar-hover); color: #e2e8f0; }
    .nav-item.active { background: var(--green); color: #fff; font-weight: 600; }
    .nav-item svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; flex-shrink: 0; }
    .sidebar-user { padding: 0.75rem 1rem; border-top: 1px solid rgba(255,255,255,0.08); background: #020617; }
    .user-name { font-weight: 600; font-size: 0.75rem; color: #cbd5e1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 0.4rem; }

    /* ── Main Area ── */
    main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
    header { height: 56px; background: #fff; border-bottom: 1px solid var(--border); padding: 0 1.5rem; display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
    .header-title { font-size: 1.05rem; font-weight: 700; color: var(--navy); }
    .header-actions { display: flex; gap: 0.5rem; }
    .content-area { flex: 1; padding: 1.5rem; overflow-y: auto; display: flex; flex-direction: column; gap: 1.25rem; }

    /* ── Cards ── */
    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem; }
    .kpi-card { background: #fff; border: 1px solid var(--border); border-radius: var(--radius); padding: 1rem 1.15rem; box-shadow: var(--shadow); }
    .kpi-label { font-size: 0.65rem; font-weight: 700; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.5px; }
    .kpi-val { font-size: 1.35rem; font-weight: 800; color: var(--navy); margin-top: 0.2rem; }
    .kpi-sub { font-size: 0.7rem; color: var(--text-muted); margin-top: 0.1rem; }
    .card { background: #fff; border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); overflow: hidden; }
    .card-header { padding: 0.85rem 1.15rem; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; background: #fafafa; }
    .card-title { font-size: 0.9rem; font-weight: 700; color: var(--navy); }

    /* ── Buttons ── */
    .btn { padding: 0.45rem 0.85rem; font-size: 0.8rem; font-weight: 600; border-radius: var(--radius); cursor: pointer; border: 1px solid transparent; transition: all 0.15s ease; display: inline-flex; align-items: center; justify-content: center; gap: 0.35rem; outline: none; font-family: inherit; }
    .btn-green { background: var(--green); color: #fff; }
    .btn-green:hover { background: var(--green-hover); }
    .btn-navy { background: var(--navy); color: #fff; }
    .btn-navy:hover { background: #1e293b; }
    .btn-outline { background: #fff; border-color: var(--border); color: var(--text); }
    .btn-outline:hover { background: #f1f5f9; border-color: #cbd5e1; }
    .btn-sm { padding: 0.3rem 0.6rem; font-size: 0.75rem; }
    .btn-danger { background: #ef4444; color: #fff; }
    .btn-danger:hover { background: #dc2626; }

    /* ── Forms ── */
    .form-group { display: flex; flex-direction: column; gap: 0.3rem; }
    .form-group label { font-size: 0.75rem; font-weight: 600; color: var(--text); }
    .form-control { background: #fff; border: 1px solid var(--border); border-radius: var(--radius); padding: 0.5rem 0.7rem; color: var(--text); font-size: 0.85rem; outline: none; transition: border-color 0.15s ease; width: 100%; font-family: inherit; }
    .form-control:focus { border-color: var(--green); box-shadow: 0 0 0 2px rgba(22,163,74,0.1); }

    /* ── Tables ── */
    table { width: 100%; border-collapse: collapse; text-align: left; font-size: 0.8rem; }
    th { background: #f8fafc; color: var(--text-muted); font-weight: 600; padding: 0.65rem 1rem; border-bottom: 1px solid var(--border); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.4px; }
    td { padding: 0.7rem 1rem; border-bottom: 1px solid var(--border); color: var(--text); vertical-align: middle; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: #f8fafc; }

    /* ── Badges ── */
    .badge { display: inline-flex; align-items: center; padding: 0.15rem 0.45rem; font-size: 0.65rem; font-weight: 700; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.3px; }
    .badge-success { background: var(--green-bg); color: var(--green-text); }
    .badge-warning { background: var(--warn-bg); color: var(--warn-text); }
    .badge-danger { background: var(--danger-bg); color: var(--danger-text); }

    /* ── Modals ── */
    .modal-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.6); backdrop-filter: blur(2px); display: none; align-items: center; justify-content: center; z-index: 1000; padding: 1rem; }
    .modal-overlay.active { display: flex; }
    .modal { background: #fff; border-radius: 8px; width: 100%; max-width: 560px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.2); overflow: hidden; display: flex; flex-direction: column; }
    .modal-header { padding: 1rem 1.25rem; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; background: #fafafa; }
    .modal-title { font-weight: 700; font-size: 0.95rem; color: var(--navy); }
    .modal-body { padding: 1.25rem; display: flex; flex-direction: column; gap: 1rem; max-height: 80vh; overflow-y: auto; }

    .alert { padding: 0.85rem 1rem; border-radius: var(--radius); font-size: 0.8rem; display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; }
    .alert-warn { background: var(--warn-bg); border: 1px solid #fde68a; color: var(--warn-text); }
    .alert-danger { background: var(--danger-bg); border: 1px solid #fecaca; color: var(--danger-text); }
    .alert-info { background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; }

    .empty-state { text-align: center; padding: 3rem 1.5rem; }
    .empty-state h3 { font-size: 1.1rem; font-weight: 700; color: var(--navy); margin-bottom: 0.5rem; }
    .empty-state p { color: var(--text-muted); font-size: 0.85rem; max-width: 400px; margin: 0 auto 1rem; }

    .mapping-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; background: #f8fafc; padding: 0.85rem; border-radius: 6px; border: 1px solid var(--border); max-height: 200px; overflow-y: auto; }
    .divider { height: 1px; background: var(--border); margin: 0.5rem 0; }
  </style>
</head>
<body>

  <!-- Auth Screen -->
  <div class="auth-overlay" id="authScreen">
    <div class="auth-card">
      <div class="auth-brand">
        <div class="logo">B-COMPASS</div>
        <div class="tagline">Know Your Business. Know Your Direction.</div>
      </div>

      <button type="button" id="quickDemoBtn" class="btn btn-green" style="padding:0.7rem; font-size:0.85rem; font-weight:700;" onclick="handleQuickDemoLogin()">
        Quick Demo Login
      </button>

      <div style="text-align:center; font-size:0.65rem; font-weight:700; color:var(--text-muted); letter-spacing:0.5px;">— OR SIGN IN WITH YOUR ACCOUNT —</div>

      <div style="display:flex; border-bottom:1px solid var(--border);">
        <button type="button" id="tabSignin" style="flex:1; padding:0.5rem; background:transparent; border:none; border-bottom:2px solid var(--green); color:var(--green); font-weight:700; cursor:pointer; font-family:inherit; font-size:0.8rem;" onclick="setAuthMode(false)">Sign In</button>
        <button type="button" id="tabSignup" style="flex:1; padding:0.5rem; background:transparent; border:none; border-bottom:2px solid transparent; color:var(--text-muted); font-weight:600; cursor:pointer; font-family:inherit; font-size:0.8rem;" onclick="setAuthMode(true)">Create Account</button>
      </div>

      <div id="authErrorMsg" style="display:none; padding:0.5rem 0.7rem; background:var(--danger-bg); border:1px solid #fca5a5; border-radius:6px; color:var(--danger-text); font-size:0.8rem; text-align:center; font-weight:600;"></div>

      <form id="authForm" onsubmit="event.preventDefault(); handleAuthSubmit();" style="display:flex; flex-direction:column; gap:0.75rem;">
        <div class="form-group" id="nameGroup" style="display:none;">
          <label>Full Name</label>
          <input type="text" id="authName" class="form-control" placeholder="Your full name" autocomplete="name">
        </div>
        <div class="form-group" id="orgNameGroup" style="display:none;">
          <label>Business Name</label>
          <input type="text" id="authOrgName" class="form-control" placeholder="Your business name" autocomplete="organization">
        </div>
        <div class="form-group">
          <label>Email Address</label>
          <input type="email" id="authEmail" class="form-control" placeholder="you@business.com" required autocomplete="email">
        </div>
        <div class="form-group">
          <label>Password</label>
          <input type="password" id="authPassword" class="form-control" placeholder="Minimum 8 characters" required autocomplete="current-password">
        </div>
        <button type="submit" class="btn btn-navy" style="padding:0.65rem; margin-top:0.15rem;" id="authSubmitBtn">Sign In</button>
      </form>
    </div>
  </div>

  <!-- Sidebar -->
  <aside>
    <div class="sidebar-brand">
      <div class="name">B-COMPASS</div>
      <div class="sub">Know Your Business. Know Your Direction.</div>
    </div>
    <div class="org-selector">
      <label>Organization</label>
      <select id="orgSelect" onchange="switchOrg(this.value)"></select>
    </div>
    <nav>
      <div class="nav-section">Intelligence</div>
      <button type="button" class="nav-item active" data-view="overview" onclick="showView('overview', event)">
        <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
        Overview
      </button>

      <div class="nav-section">Financial Data</div>
      <button type="button" class="nav-item" data-view="sales" onclick="showView('sales', event)">
        <svg viewBox="0 0 24 24"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>
        Sales
      </button>
      <button type="button" class="nav-item" data-view="cogs" onclick="showView('cogs', event)">
        <svg viewBox="0 0 24 24"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
        Products & Costs
      </button>
      <button type="button" class="nav-item" data-view="expenses" onclick="showView('expenses', event)">
        <svg viewBox="0 0 24 24"><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path><path d="M12 2L2 7l10 5 10-5L12 2z"></path></svg>
        Expenses
      </button>
      <button type="button" class="nav-item" data-view="payouts" onclick="showView('payouts', event)">
        <svg viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line></svg>
        Payouts
      </button>

      <div class="nav-section">Analysis</div>
      <button type="button" class="nav-item" data-view="reports" onclick="showView('reports', event)">
        <svg viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
        Reports
      </button>

      <div class="nav-section">Management</div>
      <button type="button" class="nav-item" data-view="datasources" onclick="showView('datasources', event)">
        <svg viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>
        Data Sources
      </button>
      <button type="button" class="nav-item" data-view="settings" onclick="showView('settings', event)">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
        Settings
      </button>
    </nav>
    <div class="sidebar-user">
      <div class="user-name" id="userInfo">Not Authenticated</div>
      <button type="button" class="btn btn-outline" style="width:100%; justify-content:center; padding:0.35rem; font-size:0.7rem;" onclick="logout()">Sign Out</button>
    </div>
  </aside>

  <!-- Main View Area -->
  <main>
    <header>
      <div class="header-title" id="pageTitle">Overview</div>
      <div class="header-actions" id="headerActions"></div>
    </header>
    <div class="content-area" id="contentArea"></div>
  </main>

  <!-- Onboarding Wizard Modal -->
  <div class="modal-overlay" id="onboardingModal">
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title" id="wizardTitle">Step 1: Business Profile</div>
        <button type="button" class="btn btn-outline btn-sm" onclick="closeModal('onboardingModal')">&#10005;</button>
      </div>
      <div class="modal-body">
        <div id="wizardStep1" style="display:flex; flex-direction:column; gap:0.85rem;">
          <div class="form-group"><label>Business Name</label><input type="text" id="obOrgName" class="form-control" placeholder="Your business name"></div>
          <div class="form-group"><label>Country</label>
            <select id="obCountry" class="form-control" onchange="autoSelectCurrency()">
              <option value="PK">Pakistan</option>
              <option value="US">United States</option>
              <option value="GB">United Kingdom</option>
              <option value="AE">United Arab Emirates</option>
              <option value="SA">Saudi Arabia</option>
              <option value="EU">European Union</option>
            </select>
          </div>
          <div class="form-group"><label>Base Currency</label>
            <select id="obCurrency" class="form-control">
              <option value="PKR">PKR (Rs)</option>
              <option value="USD">USD ($)</option>
              <option value="GBP">GBP (pound)</option>
              <option value="AED">AED (Dh)</option>
              <option value="SAR">SAR (SR)</option>
              <option value="EUR">EUR (euro)</option>
            </select>
          </div>
          <button type="button" class="btn btn-green" style="padding:0.65rem;" onclick="saveOnboardingStep1()">Next: Business Type</button>
        </div>

        <div id="wizardStep2" style="display:none; flex-direction:column; gap:0.85rem;">
          <div class="form-group"><label>What type of business do you run?</label>
            <select id="obBusinessType" class="form-control">
              <option value="ecommerce">E-Commerce (Online Store)</option>
              <option value="retail">Retail (Physical Store)</option>
              <option value="wholesale">Wholesale / Distribution</option>
              <option value="services">Services / Freelance</option>
              <option value="mixed">Mixed (Online + Offline)</option>
            </select>
          </div>
          <div class="form-group"><label>What is your primary goal?</label>
            <select id="obObjective" class="form-control">
              <option value="finance_intelligence">Understand My Finances (Sales, Margins, Profit)</option>
              <option value="prepare_books">Prepare My Books (Reconciliation & Clean Ledger)</option>
              <option value="track_expenses">Track Expenses & Reduce Costs</option>
            </select>
          </div>
          <button type="button" class="btn btn-green" style="padding:0.65rem;" onclick="saveOnboardingStep2()">Next: Data Sources</button>
        </div>

        <div id="wizardStep3" style="display:none; flex-direction:column; gap:0.85rem;">
          <div style="color:var(--text-muted); font-size:0.8rem;">You can add data sources now or later from the Data Sources page.</div>
          <div style="display:flex; flex-direction:column; gap:0.6rem;">
            <div class="alert alert-info" style="padding:0.7rem 0.85rem;"><div><strong>CSV Import</strong><div style="font-size:0.75rem; margin-top:0.15rem;">Upload sales, orders, or expense data from any CSV file</div></div><button type="button" class="btn btn-outline btn-sm" onclick="closeModal('onboardingModal'); openImportModal();">Import CSV</button></div>
            <div class="alert alert-info" style="padding:0.7rem 0.85rem;"><div><strong>Shopify</strong><div style="font-size:0.75rem; margin-top:0.15rem;">Export orders from Shopify and import via CSV</div></div><span class="badge badge-warning">CSV Import</span></div>
            <div class="alert alert-info" style="padding:0.7rem 0.85rem;"><div><strong>TikTok Shop</strong><div style="font-size:0.75rem; margin-top:0.15rem;">Export settlements from TikTok Seller Center</div></div><span class="badge badge-warning">CSV Import</span></div>
          </div>
          <button type="button" class="btn btn-green" style="padding:0.65rem; margin-top:0.25rem;" onclick="closeModal('onboardingModal'); renderView();">Complete Setup</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Import Data Modal -->
  <div class="modal-overlay" id="importModal">
    <div class="modal" style="max-width:600px;">
      <div class="modal-header">
        <div class="modal-title">Import Data</div>
        <button type="button" class="btn btn-outline btn-sm" onclick="closeModal('importModal')">&#10005;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>What data are you importing?</label>
          <select id="importDataType" class="form-control">
            <option value="orders" selected>Sales / Orders</option>
            <option value="expenses">Expenses</option>
          </select>
        </div>
        <div class="form-group">
          <label>Source / Channel</label>
          <select id="importProvider" class="form-control">
            <option value="csv" selected>CSV File Upload</option>
            <option value="shopify">Shopify Export (CSV)</option>
            <option value="tiktok">TikTok Shop Export (CSV)</option>
            <option value="woocommerce">WooCommerce Export (CSV)</option>
          </select>
        </div>

        <div class="form-group" id="csvInputGroup">
          <label>Choose CSV File</label>
          <input type="file" id="csvFileInput" accept=".csv" class="form-control" onchange="handleCsvFileUpload(event)" />
          <div id="csvHeadersSection" style="display:none; margin-top:0.5rem;">
            <div style="font-size:0.75rem; font-weight:700; color:var(--navy); margin-bottom:0.35rem;">Map CSV Columns to Fields:</div>
            <div class="mapping-grid" id="csvMappingGrid"></div>
          </div>
          <div style="display:flex; gap:0.5rem; margin-top:0.5rem;">
            <button type="button" class="btn btn-outline btn-sm" onclick="validateCsvMapping()">Validate Mapping</button>
          </div>
          <div id="csvValidationBox" style="display:none; padding:0.6rem; background:#f8fafc; border:1px solid var(--border); border-radius:6px; font-size:0.8rem; margin-top:0.5rem;"></div>
        </div>

        <button type="button" class="btn btn-green" style="padding:0.65rem; margin-top:0.25rem;" id="startImportBtn" onclick="submitImport()">Run Import</button>
      </div>
    </div>
  </div>

  <!-- Add Expense Modal -->
  <div class="modal-overlay" id="expenseModal">
    <div class="modal" style="max-width:480px;">
      <div class="modal-header">
        <div class="modal-title">Add Expense</div>
        <button type="button" class="btn btn-outline btn-sm" onclick="closeModal('expenseModal')">&#10005;</button>
      </div>
      <div class="modal-body">
        <div class="form-group"><label>Date</label><input type="date" id="expDate" class="form-control"></div>
        <div class="form-group"><label>Category</label>
          <select id="expCategory" class="form-control">
            <option value="rent">Rent</option>
            <option value="salaries">Salaries & Wages</option>
            <option value="marketing">Marketing</option>
            <option value="advertising">Advertising</option>
            <option value="software">Software & Tools</option>
            <option value="shipping">Shipping & Logistics</option>
            <option value="packaging">Packaging</option>
            <option value="utilities">Utilities</option>
            <option value="bank_charges">Bank Charges</option>
            <option value="professional_fees">Professional Fees</option>
            <option value="inventory">Inventory Purchase</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div class="form-group"><label>Vendor / Payee</label><input type="text" id="expVendor" class="form-control" placeholder="e.g. Courier Company, Landlord"></div>
        <div class="form-group"><label>Description</label><input type="text" id="expDescription" class="form-control" placeholder="Brief description"></div>
        <div class="form-group"><label>Amount</label><input type="number" id="expAmount" class="form-control" step="0.01" min="0" placeholder="0.00"></div>
        <div class="form-group"><label>Payment Status</label>
          <select id="expStatus" class="form-control">
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="partial">Partial</option>
          </select>
        </div>
        <button type="button" class="btn btn-green" style="padding:0.65rem;" onclick="saveExpense()">Save Expense</button>
      </div>
    </div>
  </div>

  <script>
    // ── State ──
    let authToken = localStorage.getItem('fin_saas_token') || null;
    let currentUser = null;
    let userOrgs = [];
    let currentOrgId = null;
    let currentView = 'overview';
    let isSignupMode = false;
    let parsedCsvRows = [];
    let detectedCsvHeaders = [];
    let orgCurrency = 'PKR';

    // ── Currency ──
    const CURRENCY_MAP = { PKR: 'Rs', USD: '$', GBP: String.fromCharCode(163), EUR: String.fromCharCode(8364), AED: 'Dh', SAR: 'SR' };
    const COUNTRY_CURRENCY = { PK: 'PKR', US: 'USD', GB: 'GBP', EU: 'EUR', AE: 'AED', SA: 'SAR' };

    function fc(amount) {
      const sym = CURRENCY_MAP[orgCurrency] || orgCurrency;
      const num = parseFloat(amount || 0);
      return sym + ' ' + num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function autoSelectCurrency() {
      const c = document.getElementById('obCountry').value;
      const cur = COUNTRY_CURRENCY[c] || 'PKR';
      document.getElementById('obCurrency').value = cur;
    }

    // ── Init ──
    async function init() {
      if (!authToken) { showAuthScreen(); return; }
      try {
        const res = await fetch('/api/v1/auth/me', { headers: { 'Authorization': 'Bearer ' + authToken } });
        const data = await res.json();
        if (data.ok) {
          currentUser = data.user;
          userOrgs = data.orgs || [];
          if (userOrgs.length > 0) {
            currentOrgId = userOrgs[0].id;
            orgCurrency = userOrgs[0].base_currency || 'PKR';
            updateOrgSelect();
            hideAuthScreen();
            renderView();
          } else { showAuthScreen(); }
        } else { logout(); }
      } catch (e) { showAuthScreen(); }
    }

    // ── Auth ──
    function setAuthMode(signup) {
      isSignupMode = signup;
      const errBox = document.getElementById('authErrorMsg');
      if (errBox) errBox.style.display = 'none';
      document.getElementById('tabSignin').style.borderBottomColor = signup ? 'transparent' : 'var(--green)';
      document.getElementById('tabSignin').style.color = signup ? 'var(--text-muted)' : 'var(--green)';
      document.getElementById('tabSignup').style.borderBottomColor = signup ? 'var(--green)' : 'transparent';
      document.getElementById('tabSignup').style.color = signup ? 'var(--green)' : 'var(--text-muted)';
      document.getElementById('authSubmitBtn').innerText = signup ? 'Create Account' : 'Sign In';
      document.getElementById('nameGroup').style.display = signup ? 'flex' : 'none';
      document.getElementById('orgNameGroup').style.display = signup ? 'flex' : 'none';
    }

    async function handleQuickDemoLogin() {
      const errBox = document.getElementById('authErrorMsg');
      if (errBox) errBox.style.display = 'none';
      const demoId = Date.now().toString().slice(-5);
      const email = 'demo_' + demoId + '@bcompass.app';
      const password = 'DemoPassword123!';
      const name = 'Demo Merchant';
      const orgName = 'Demo Business #' + demoId;
      const btn = document.getElementById('quickDemoBtn');
      if (btn) { btn.innerText = 'Creating demo account...'; btn.disabled = true; }
      try {
        const res = await fetch('/api/v1/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, name, orgName }) });
        const data = await res.json();
        if (data.ok) {
          authToken = data.token;
          localStorage.setItem('fin_saas_token', authToken);
          await init();
          openOnboardingWizard();
        } else { showAuthError(data.error || 'Demo login failed'); }
      } catch (err) { showAuthError('Network error. Please try again.'); }
      finally { if (btn) { btn.innerText = 'Quick Demo Login'; btn.disabled = false; } }
    }

    function showAuthError(msg) {
      const box = document.getElementById('authErrorMsg');
      if (box) { box.innerText = msg; box.style.display = 'block'; }
    }

    async function handleAuthSubmit() {
      const errBox = document.getElementById('authErrorMsg');
      if (errBox) errBox.style.display = 'none';
      const email = document.getElementById('authEmail').value.trim();
      const password = document.getElementById('authPassword').value;
      if (!email) { showAuthError('Please enter your email.'); return; }
      if (!password) { showAuthError('Please enter your password.'); return; }
      if (isSignupMode && password.length < 8) { showAuthError('Password must be at least 8 characters.'); return; }
      const btn = document.getElementById('authSubmitBtn');
      const origText = btn.innerText;
      btn.innerText = 'Processing...'; btn.disabled = true;
      const endpoint = isSignupMode ? '/api/v1/auth/signup' : '/api/v1/auth/login';
      const payload = { email, password };
      if (isSignupMode) {
        payload.name = document.getElementById('authName').value.trim() || 'Merchant';
        payload.orgName = document.getElementById('authOrgName').value.trim() || 'My Business';
      }
      try {
        const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await res.json();
        if (data.ok) {
          authToken = data.token;
          localStorage.setItem('fin_saas_token', authToken);
          await init();
          if (isSignupMode) openOnboardingWizard();
        } else { showAuthError(data.error || 'Authentication failed.'); }
      } catch (err) { showAuthError('Network error. Unable to reach server.'); }
      finally { btn.innerText = origText; btn.disabled = false; }
    }

    function logout() {
      if (authToken) fetch('/api/v1/auth/logout', { method: 'POST', headers: { 'Authorization': 'Bearer ' + authToken } });
      authToken = null; currentUser = null; userOrgs = []; currentOrgId = null;
      localStorage.removeItem('fin_saas_token');
      showAuthScreen();
    }

    function showAuthScreen() { document.getElementById('authScreen').style.display = 'flex'; }
    function hideAuthScreen() { document.getElementById('authScreen').style.display = 'none'; }

    function updateOrgSelect() {
      const select = document.getElementById('orgSelect');
      select.innerHTML = userOrgs.map(function(o) { return '<option value="' + o.id + '">' + o.name + '</option>'; }).join('');
      select.value = currentOrgId;
      document.getElementById('userInfo').innerText = currentUser ? currentUser.email : '';
    }

    function switchOrg(newOrgId) {
      currentOrgId = newOrgId;
      const org = userOrgs.find(function(o) { return o.id === newOrgId; });
      if (org) orgCurrency = org.base_currency || 'PKR';
      renderView();
    }

    // ── Navigation ──
    function showView(viewName, evt) {
      currentView = viewName;
      document.querySelectorAll('nav .nav-item').forEach(function(btn) { btn.classList.remove('active'); });
      if (evt && evt.currentTarget) evt.currentTarget.classList.add('active');
      renderView();
    }

    // ── API Helper ──
    async function authFetch(url, options) {
      options = options || {};
      options.headers = options.headers || {};
      options.headers['Authorization'] = 'Bearer ' + authToken;
      options.headers['X-Org-ID'] = currentOrgId;
      var res = await fetch(url, options);
      if (res.status === 401 || res.status === 403) {
        var data = await res.json();
        throw new Error(data.error || 'Unauthorized');
      }
      return res;
    }

    // ── Render Router ──
    const VIEW_TITLES = {
      overview: 'Overview', sales: 'Sales', cogs: 'Products & Costs', expenses: 'Expenses',
      payouts: 'Payouts', reports: 'Reports', datasources: 'Data Sources', settings: 'Settings'
    };

    async function renderView() {
      if (!currentOrgId) return;
      document.getElementById('pageTitle').innerText = VIEW_TITLES[currentView] || 'Dashboard';
      var ha = document.getElementById('headerActions');
      ha.innerHTML = '';

      var container = document.getElementById('contentArea');
      container.innerHTML = '<div style="color:var(--text-muted); padding:1rem;">Loading...</div>';

      try {
        if (currentView === 'overview') await renderOverview(container);
        else if (currentView === 'sales') await renderSales(container);
        else if (currentView === 'cogs') await renderCogs(container);
        else if (currentView === 'expenses') await renderExpenses(container);
        else if (currentView === 'payouts') await renderPayouts(container);
        else if (currentView === 'reports') await renderReports(container);
        else if (currentView === 'datasources') await renderDataSources(container);
        else if (currentView === 'settings') renderSettings(container);
      } catch (err) {
        container.innerHTML = '<div class="card" style="padding:1.25rem; color:var(--danger-text);">Error: ' + err.message + '</div>';
      }
    }

    // ── Overview ──
    async function renderOverview(container) {
      var pnlRes = await authFetch('/api/v1/reports/financial?orgId=' + currentOrgId);
      var pnlData = await pnlRes.json();
      var m = pnlData.report && pnlData.report.metrics ? pnlData.report.metrics : {};

      var attRes = await authFetch('/api/v1/reports/attention?orgId=' + currentOrgId);
      var attData = await attRes.json();

      if (attData.isEmptyState) {
        container.innerHTML =
          '<div class="empty-state">' +
            '<h3>Welcome to B-COMPASS</h3>' +
            '<p>Your financial picture starts with your business data. Add a data source to begin tracking sales, expenses, and profit.</p>' +
            '<div style="display:flex; gap:0.75rem; justify-content:center;">' +
              '<button type="button" class="btn btn-green" onclick="showView(\'datasources\')">Add Your First Data Source</button>' +
              '<button type="button" class="btn btn-outline" onclick="openOnboardingWizard()">Guided Setup</button>' +
            '</div>' +
          '</div>';
        return;
      }

      var alertsHtml = '';
      if (attData.attentionItems && attData.attentionItems.length > 0) {
        alertsHtml = attData.attentionItems.map(function(item) {
          var cls = item.severity === 'danger' ? 'alert-danger' : 'alert-warn';
          return '<div class="alert ' + cls + '"><div><strong>' + item.title + '</strong><div style="font-size:0.75rem; margin-top:0.15rem;">' + item.message + '</div></div>' +
            '<button type="button" class="btn btn-outline btn-sm" onclick="showView(\'' + item.actionView + '\')">Resolve</button></div>';
        }).join('');
      }

      var gs = m.grossSales || 0;
      var ns = m.netSales || 0;
      var te = m.totalExpenses || 0;
      var gp = m.grossProfit || 0;
      var np = m.netProfit !== undefined ? m.netProfit : gp;
      var npm = m.netProfitMarginPercent || 0;
      var tf = m.totalFees || 0;

      container.innerHTML =
        alertsHtml +
        '<div class="kpi-grid">' +
          '<div class="kpi-card"><div class="kpi-label">Gross Sales</div><div class="kpi-val">' + fc(gs) + '</div><div class="kpi-sub">' + (m.totalOrders || 0) + ' orders</div></div>' +
          '<div class="kpi-card"><div class="kpi-label">Net Sales</div><div class="kpi-val">' + fc(ns) + '</div><div class="kpi-sub">After discounts & refunds</div></div>' +
          '<div class="kpi-card"><div class="kpi-label">Platform Fees</div><div class="kpi-val" style="color:var(--warn-text);">' + fc(tf) + '</div><div class="kpi-sub">Channel & processing fees</div></div>' +
          '<div class="kpi-card"><div class="kpi-label">Expenses</div><div class="kpi-val" style="color:var(--warn-text);">' + fc(te) + '</div><div class="kpi-sub">Operating costs</div></div>' +
          '<div class="kpi-card"><div class="kpi-label">Gross Profit</div><div class="kpi-val" style="color:var(--green);">' + fc(gp) + '</div><div class="kpi-sub">Margin: ' + (m.grossMarginPercent || 0) + '%</div></div>' +
          '<div class="kpi-card"><div class="kpi-label">Net Profit</div><div class="kpi-val" style="color:' + (np >= 0 ? 'var(--green)' : 'var(--danger-text)') + ';">' + fc(np) + '</div><div class="kpi-sub">Margin: ' + npm + '%</div></div>' +
        '</div>';
    }

    // ── Sales ──
    async function renderSales(container) {
      var ha = document.getElementById('headerActions');
      ha.innerHTML = '<button type="button" class="btn btn-green btn-sm" onclick="openImportModal()">Add Sales Data</button>';

      var res = await authFetch('/api/v1/orders?orgId=' + currentOrgId);
      var data = await res.json();
      var orders = data.orders || [];

      if (orders.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>No Sales Data Yet</h3><p>Connect a sales channel or import a CSV file to see your orders here.</p><button type="button" class="btn btn-green" onclick="showView(\'datasources\')">Go to Data Sources</button></div>';
        return;
      }

      var rows = orders.map(function(o) {
        return '<tr><td><strong>' + o.order_number + '</strong></td><td>' + (o.provider || 'csv').toUpperCase() + '</td><td>' + o.external_order_id + '</td><td>' + fc(o.gross_amount) + '</td><td style="color:var(--warn-text);">-' + fc(o.discount_amount) + '</td><td><strong>' + fc(o.net_amount) + '</strong></td><td><span class="badge badge-success">' + o.financial_status + '</span></td></tr>';
      }).join('');

      container.innerHTML =
        '<div class="card">' +
          '<div class="card-header"><div class="card-title">Orders (' + orders.length + ')</div></div>' +
          '<table><thead><tr><th>Order #</th><th>Channel</th><th>External Ref</th><th>Gross</th><th>Discount</th><th>Net</th><th>Status</th></tr></thead><tbody>' + rows + '</tbody></table>' +
        '</div>';
    }

    // ── Products & Costs ──
    async function renderCogs(container) {
      var res = await authFetch('/api/v1/products/cogs?orgId=' + currentOrgId);
      var data = await res.json();
      var products = data.products || [];

      if (products.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>No Products Discovered</h3><p>Import sales data with SKU information to automatically build your product catalog.</p><button type="button" class="btn btn-green" onclick="showView(\'datasources\')">Go to Data Sources</button></div>';
        return;
      }

      var sym = CURRENCY_MAP[orgCurrency] || orgCurrency;
      var warn = data.isProfitCalculationIncomplete ? '<div class="alert alert-warn"><div><strong>' + data.uncostedProductsCount + ' products missing costs</strong><div style="font-size:0.75rem; margin-top:0.15rem;">Set unit costs to calculate accurate profit margins.</div></div></div>' : '';

      var rows = products.map(function(p) {
        return '<tr><td><strong>' + p.sku + '</strong></td><td>' + p.title + '</td><td><div style="display:flex; gap:0.35rem; align-items:center;"><input type="number" step="0.01" value="' + p.unit_cost + '" id="cost_' + p.sku + '" class="form-control" style="width:100px;" /><button type="button" class="btn btn-outline btn-sm" onclick="updateCost(\'' + p.sku.replace(/'/g, "\\'") + '\')">Save</button></div></td><td><span class="badge ' + (p.unit_cost > 0 ? 'badge-success' : 'badge-warning') + '">' + (p.unit_cost > 0 ? 'Costed' : 'Missing') + '</span></td></tr>';
      }).join('');

      container.innerHTML = warn +
        '<div class="card">' +
          '<div class="card-header"><div class="card-title">Product Catalog</div></div>' +
          '<table><thead><tr><th>SKU</th><th>Product</th><th>Unit Cost (' + sym + ')</th><th>Status</th></tr></thead><tbody>' + rows + '</tbody></table>' +
        '</div>';
    }

    async function updateCost(sku) {
      var el = document.getElementById('cost_' + sku);
      if (!el) return;
      var val = el.value;
      var res = await authFetch('/api/v1/products/cogs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sku: sku, unitCost: parseFloat(val) }) });
      var data = await res.json();
      if (data.ok) { renderView(); }
    }

    // ── Expenses ──
    async function renderExpenses(container) {
      var ha = document.getElementById('headerActions');
      ha.innerHTML = '<button type="button" class="btn btn-green btn-sm" onclick="openExpenseModal()">+ Add Expense</button>';

      var res = await authFetch('/api/v1/expenses?orgId=' + currentOrgId);
      var data = await res.json();
      var expenses = data.expenses || [];

      if (expenses.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>No Expenses Recorded</h3><p>Track your business expenses to calculate true net profit. Add rent, salaries, marketing costs, and more.</p><button type="button" class="btn btn-green" onclick="openExpenseModal()">+ Add Your First Expense</button></div>';
        return;
      }

      var total = 0;
      var rows = expenses.map(function(e) {
        total += parseFloat(e.amount || 0);
        return '<tr><td>' + e.date + '</td><td><span class="badge badge-success">' + e.category + '</span></td><td>' + (e.vendor || '-') + '</td><td>' + (e.description || '-') + '</td><td><strong>' + fc(e.amount) + '</strong></td><td><span class="badge ' + (e.payment_status === 'paid' ? 'badge-success' : 'badge-warning') + '">' + e.payment_status + '</span></td><td><button type="button" class="btn btn-outline btn-sm" onclick="deleteExpense(\'' + e.id + '\')">Delete</button></td></tr>';
      }).join('');

      container.innerHTML =
        '<div class="kpi-grid" style="grid-template-columns: repeat(2, 1fr);">' +
          '<div class="kpi-card"><div class="kpi-label">Total Expenses</div><div class="kpi-val" style="color:var(--warn-text);">' + fc(total) + '</div><div class="kpi-sub">' + expenses.length + ' entries</div></div>' +
          '<div class="kpi-card"><div class="kpi-label">This impacts</div><div class="kpi-val" style="color:var(--navy);">Net Profit</div><div class="kpi-sub">Deducted from gross profit</div></div>' +
        '</div>' +
        '<div class="card">' +
          '<div class="card-header"><div class="card-title">Expense Entries</div></div>' +
          '<table><thead><tr><th>Date</th><th>Category</th><th>Vendor</th><th>Description</th><th>Amount</th><th>Status</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>' +
        '</div>';
    }

    function openExpenseModal() {
      document.getElementById('expDate').value = new Date().toISOString().split('T')[0];
      document.getElementById('expAmount').value = '';
      document.getElementById('expVendor').value = '';
      document.getElementById('expDescription').value = '';
      document.getElementById('expenseModal').classList.add('active');
    }

    async function saveExpense() {
      var amount = parseFloat(document.getElementById('expAmount').value);
      if (!amount || amount <= 0) { alert('Please enter a valid amount.'); return; }
      var payload = {
        date: document.getElementById('expDate').value,
        category: document.getElementById('expCategory').value,
        vendor: document.getElementById('expVendor').value,
        description: document.getElementById('expDescription').value,
        amount: amount,
        currency: orgCurrency,
        paymentStatus: document.getElementById('expStatus').value
      };
      var res = await authFetch('/api/v1/expenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      var data = await res.json();
      if (data.ok) { closeModal('expenseModal'); renderView(); }
      else { alert('Error: ' + (data.error || 'Failed to save')); }
    }

    async function deleteExpense(id) {
      if (!confirm('Delete this expense?')) return;
      await authFetch('/api/v1/expenses/' + id, { method: 'DELETE' });
      renderView();
    }

    // ── Payouts ──
    async function renderPayouts(container) {
      var res = await authFetch('/api/v1/reconciliation/payouts?orgId=' + currentOrgId);
      var data = await res.json();
      var recs = data.reconciliations || [];

      if (recs.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>No Payouts Recorded</h3><p>Payout settlement data will appear here once imported from your sales channels.</p></div>';
        return;
      }

      var rows = recs.map(function(r) {
        return '<tr><td>' + r.externalPayoutId + '</td><td>' + r.payoutDate + '</td><td>' + fc(r.recordedNetPayout) + '</td><td>' + fc(r.expectedNetPayout) + '</td><td style="color:' + (r.discrepancy !== 0 ? 'var(--danger-text)' : 'var(--green)') + '; font-weight:700;">' + fc(r.discrepancy) + '</td><td><span class="badge ' + (r.status === 'matched' ? 'badge-success' : 'badge-danger') + '">' + r.status + '</span></td></tr>';
      }).join('');

      container.innerHTML =
        '<div class="card">' +
          '<div class="card-header"><div class="card-title">Payout Reconciliation</div></div>' +
          '<table><thead><tr><th>Settlement Ref</th><th>Date</th><th>Recorded</th><th>Expected</th><th>Discrepancy</th><th>Status</th></tr></thead><tbody>' + rows + '</tbody></table>' +
        '</div>';
    }

    // ── Reports ──
    async function renderReports(container) {
      var res = await authFetch('/api/v1/reports/financial?orgId=' + currentOrgId);
      var data = await res.json();
      var m = data.report && data.report.metrics ? data.report.metrics : {};

      var gs = m.grossSales || 0;
      var pct = function(v) { return gs > 0 ? ((v / gs) * 100).toFixed(1) + '%' : '-'; };

      container.innerHTML =
        '<div class="card">' +
          '<div class="card-header"><div class="card-title">Profit & Loss Statement</div></div>' +
          '<table>' +
            '<thead><tr><th>Line Item</th><th>Amount</th><th>% of Gross</th></tr></thead>' +
            '<tbody>' +
              '<tr><td><strong>Gross Sales</strong></td><td>' + fc(gs) + '</td><td>100%</td></tr>' +
              '<tr><td>Less: Discounts</td><td style="color:var(--warn-text);">-' + fc(m.totalDiscounts || 0) + '</td><td>' + pct(m.totalDiscounts || 0) + '</td></tr>' +
              '<tr><td>Less: Refunds</td><td style="color:var(--danger-text);">-' + fc(m.totalRefunds || 0) + '</td><td>' + pct(m.totalRefunds || 0) + '</td></tr>' +
              '<tr style="background:#f8fafc;"><td><strong>Net Sales</strong></td><td><strong>' + fc(m.netSales || 0) + '</strong></td><td>-</td></tr>' +
              '<tr><td>Plus: Shipping Income</td><td>+' + fc(m.shippingIncome || 0) + '</td><td>-</td></tr>' +
              '<tr><td>Less: Platform & Fees</td><td style="color:var(--danger-text);">-' + fc(m.totalFees || 0) + '</td><td>' + pct(m.totalFees || 0) + '</td></tr>' +
              '<tr style="background:#f8fafc;"><td><strong>Net Proceeds</strong></td><td style="color:var(--green);"><strong>' + fc(m.netProceeds || 0) + '</strong></td><td>-</td></tr>' +
              '<tr><td>Less: COGS (Product Costs)</td><td>-' + fc(m.totalCogs || 0) + '</td><td>' + pct(m.totalCogs || 0) + '</td></tr>' +
              '<tr style="background:#dcfce7;"><td><strong>Gross Profit</strong></td><td style="color:var(--green); font-weight:800;">' + fc(m.grossProfit || 0) + '</td><td>' + (m.grossMarginPercent || 0) + '%</td></tr>' +
              '<tr><td>Less: Operating Expenses</td><td style="color:var(--warn-text);">-' + fc(m.totalExpenses || 0) + '</td><td>' + pct(m.totalExpenses || 0) + '</td></tr>' +
              '<tr style="background:' + ((m.netProfit || 0) >= 0 ? '#dcfce7' : '#fee2e2') + ';"><td><strong>Net Profit</strong></td><td style="color:' + ((m.netProfit || 0) >= 0 ? 'var(--green)' : 'var(--danger-text)') + '; font-weight:800; font-size:0.9rem;">' + fc(m.netProfit || 0) + '</td><td><strong>' + (m.netProfitMarginPercent || 0) + '%</strong></td></tr>' +
            '</tbody>' +
          '</table>' +
        '</div>';
    }

    // ── Data Sources ──
    async function renderDataSources(container) {
      var ha = document.getElementById('headerActions');
      ha.innerHTML = '<button type="button" class="btn btn-green btn-sm" onclick="openImportModal()">Import Data</button>';

      var chRes = await authFetch('/api/v1/channels/status?orgId=' + currentOrgId);
      var chData = await chRes.json();
      var channels = chData.channels || [];

      var jobRes = await authFetch('/api/v1/import/jobs?orgId=' + currentOrgId);
      var jobData = await jobRes.json();
      var jobs = jobData.jobs || [];

      var chCards = channels.map(function(c) {
        return '<div class="card" style="padding:1rem;"><div style="display:flex; justify-content:space-between; align-items:center;"><div><div style="font-weight:700; color:var(--navy);">' + c.title + '</div><div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.1rem;">' + c.description + '</div></div><span class="badge ' + (c.isConfigured ? 'badge-success' : 'badge-warning') + '">' + (c.isConfigured ? 'Connected' : 'Available') + '</span></div></div>';
      }).join('');

      var jobRows = '';
      if (jobs.length > 0) {
        jobRows = jobs.map(function(j) {
          return '<tr><td><code style="font-size:0.7rem;">' + j.id + '</code></td><td>' + j.source_name + ' (' + j.import_type + ')</td><td>' + j.total_rows + '</td><td style="color:var(--green); font-weight:700;">' + j.successful_rows + '</td><td style="color:' + (j.failed_rows > 0 ? 'var(--danger-text)' : 'var(--text-muted)') + ';">' + (j.skipped_rows + j.failed_rows) + '</td><td><span class="badge ' + (j.status === 'completed' ? 'badge-success' : 'badge-danger') + '">' + j.status + '</span></td></tr>';
        }).join('');
      } else {
        jobRows = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:1.5rem;">No imports yet. Use the Import Data button above to get started.</td></tr>';
      }

      container.innerHTML =
        '<div style="font-weight:700; color:var(--navy); font-size:0.85rem;">Connected Sources</div>' +
        '<div class="kpi-grid">' + chCards + '</div>' +
        '<div style="font-weight:700; color:var(--navy); font-size:0.85rem; margin-top:0.5rem;">Import History</div>' +
        '<div class="card">' +
          '<table><thead><tr><th>Job Ref</th><th>Source</th><th>Total</th><th>Success</th><th>Skipped</th><th>Status</th></tr></thead><tbody>' + jobRows + '</tbody></table>' +
        '</div>';
    }

    // ── Settings ──
    function renderSettings(container) {
      var org = userOrgs.find(function(o) { return o.id === currentOrgId; }) || {};
      container.innerHTML =
        '<div class="card" style="max-width:500px; padding:1.25rem;">' +
          '<div class="card-title" style="margin-bottom:1rem;">Organization Profile</div>' +
          '<div style="display:flex; flex-direction:column; gap:0.85rem;">' +
            '<div class="form-group"><label>Tenant ID</label><input type="text" class="form-control" value="' + currentOrgId + '" readonly style="opacity:0.6; font-family:monospace; font-size:0.8rem;"></div>' +
            '<div class="form-group"><label>Organization Name</label><input type="text" class="form-control" value="' + (org.name || '') + '" readonly style="opacity:0.7;"></div>' +
            '<div class="form-group"><label>Your Role</label><input type="text" class="form-control" value="' + ((org.role || 'viewer').toUpperCase()) + '" readonly style="opacity:0.7; font-weight:700; color:var(--green);"></div>' +
            '<div class="form-group"><label>Base Currency</label><input type="text" class="form-control" value="' + orgCurrency + ' (' + (CURRENCY_MAP[orgCurrency] || orgCurrency) + ')" readonly style="opacity:0.7;"></div>' +
          '</div>' +
        '</div>';
    }

    // ── Onboarding ──
    function openOnboardingWizard() {
      document.getElementById('wizardStep1').style.display = 'flex';
      document.getElementById('wizardStep2').style.display = 'none';
      document.getElementById('wizardStep3').style.display = 'none';
      document.getElementById('wizardTitle').innerText = 'Step 1: Business Profile';
      document.getElementById('onboardingModal').classList.add('active');
    }

    async function saveOnboardingStep1() {
      var name = document.getElementById('obOrgName').value.trim() || 'My Business';
      var country = document.getElementById('obCountry').value;
      var currency = document.getElementById('obCurrency').value;
      orgCurrency = currency;
      await authFetch('/api/v1/onboarding/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name, country: country, currency: currency, region: country }) });
      document.getElementById('wizardStep1').style.display = 'none';
      document.getElementById('wizardStep2').style.display = 'flex';
      document.getElementById('wizardTitle').innerText = 'Step 2: Business Type';
    }

    async function saveOnboardingStep2() {
      var businessType = document.getElementById('obBusinessType').value;
      var objective = document.getElementById('obObjective').value;
      await authFetch('/api/v1/onboarding/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ businessType: businessType, primaryObjective: objective }) });
      document.getElementById('wizardStep2').style.display = 'none';
      document.getElementById('wizardStep3').style.display = 'flex';
      document.getElementById('wizardTitle').innerText = 'Step 3: Data Sources';
    }

    // ── Import Modal ──
    function openImportModal() { document.getElementById('importModal').classList.add('active'); }
    function closeModal(id) { document.getElementById(id).classList.remove('active'); }

    function handleCsvFileUpload(event) {
      var file = event.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function(e) { parseCsvText(e.target.result); };
      reader.readAsText(file);
    }

    function parseCsvText(text) {
      var lines = text.split(/\\r?\\n/).filter(function(l) { return l.trim() !== ''; });
      if (lines.length === 0) return;
      detectedCsvHeaders = lines[0].split(',').map(function(h) { return h.trim().replace(/^["']|["']$/g, ''); });
      parsedCsvRows = [];
      for (var i = 1; i < lines.length; i++) {
        var cols = lines[i].split(',').map(function(c) { return c.trim().replace(/^["']|["']$/g, ''); });
        var rowObj = {};
        detectedCsvHeaders.forEach(function(h, idx) { rowObj[h] = cols[idx] || ''; });
        parsedCsvRows.push(rowObj);
      }
      renderCsvMappingUI();
    }

    function renderCsvMappingUI() {
      var grid = document.getElementById('csvMappingGrid');
      document.getElementById('csvHeadersSection').style.display = 'block';
      var fields = [
        { key: 'external_order_id', label: 'Order ID (Required)' },
        { key: 'gross_amount', label: 'Gross Amount (Required)' },
        { key: 'discount_amount', label: 'Discount' },
        { key: 'shipping_amount', label: 'Shipping' },
        { key: 'tax_amount', label: 'Tax' },
        { key: 'platform_fee', label: 'Platform Fee' },
        { key: 'sku', label: 'SKU' },
        { key: 'product_title', label: 'Product Title' }
      ];
      grid.innerHTML = fields.map(function(f) {
        var opts = '<option value="">-- Skip --</option>' + detectedCsvHeaders.map(function(h) {
          var auto = (f.key === 'external_order_id' && (h.toLowerCase().indexOf('order') >= 0 || h.toLowerCase().indexOf('id') >= 0)) ||
                     (f.key === 'gross_amount' && (h.toLowerCase().indexOf('total') >= 0 || h.toLowerCase().indexOf('amount') >= 0 || h.toLowerCase().indexOf('price') >= 0));
          return '<option value="' + h + '"' + (auto ? ' selected' : '') + '>' + h + '</option>';
        }).join('');
        return '<div><label style="font-size:0.7rem; font-weight:600; color:var(--text-muted);">' + f.label + '</label><select id="map_' + f.key + '" class="form-control" style="font-size:0.75rem; padding:0.35rem;">' + opts + '</select></div>';
      }).join('');
    }

    function buildMappingConfig() {
      var mapping = {};
      ['external_order_id','gross_amount','discount_amount','shipping_amount','tax_amount','platform_fee','sku','product_title'].forEach(function(f) {
        var el = document.getElementById('map_' + f);
        if (el && el.value) mapping[f] = el.value;
      });
      return mapping;
    }

    async function validateCsvMapping() {
      var mapConfig = buildMappingConfig();
      var res = await authFetch('/api/v1/import/csv/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csvRows: parsedCsvRows, columnMapping: mapConfig }) });
      var data = await res.json();
      var box = document.getElementById('csvValidationBox');
      box.style.display = 'block';
      box.innerHTML = '<div style="font-weight:700; color:var(--navy); margin-bottom:0.15rem;">Validation Results</div><div>Total: ' + data.totalRowsDetected + ' | Valid: ' + data.validRows + ' | Warnings: ' + data.warningRows + '</div><div>Ready: <strong style="color:' + (data.isReadyToImport ? 'var(--green)' : 'var(--danger-text)') + '">' + (data.isReadyToImport ? 'YES' : 'NO') + '</strong></div>';
    }

    async function submitImport() {
      var provider = document.getElementById('importProvider').value;
      var channelProvider = provider === 'csv' ? 'manual_csv' : provider;
      var chnRes = await authFetch('/api/v1/channels/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: channelProvider, channelName: channelProvider.toUpperCase() + ' Channel' }) });
      var chnData = await chnRes.json();
      var channelId = chnData.channelId;
      var endpoint = '/api/v1/import/csv';
      var mapConfig = buildMappingConfig();
      var payload = { channelId: channelId, csvRows: parsedCsvRows, columnMapping: mapConfig };
      var res = await authFetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      var data = await res.json();
      if (data.ok) {
        alert('Import complete! Total: ' + data.result.totalRows + ' | Success: ' + data.result.successfulRows + ' | Skipped: ' + (data.result.skippedRows + (data.result.failedRows || 0)));
        closeModal('importModal');
        renderView();
      } else { alert('Import Error: ' + data.error); }
    }

    // ── Error Handling ──
    window.onerror = function(message, source, lineno, colno, error) {
      console.error('B-COMPASS Error:', message, source, lineno, colno, error);
    };

    // ── Boot ──
    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); }
    else { init(); }
  </script>
</body>
</html>`;

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Org-ID'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url  = new URL(request.url);
    const path = url.pathname;

    try {
      // 1. Serve SPA
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
        return json({ ok: true, service: 'b-compass-api', version: '2.0.0', ts: new Date().toISOString() }, corsHeaders);
      }

      // 3. Auth Routes (public)
      if (path.startsWith('/api/v1/auth/')) {
        const authRes = await handleAuthRoutes(request, env, path);
        if (authRes) return authRes;
      }

      // ── PROTECTED ROUTES ──
      const { user } = await authenticateUser(request, env);

      // 4. Onboarding, Channels, COGS, Attention, CSV Validate, Expenses
      if (path.startsWith('/api/v1/onboarding/') ||
          path === '/api/v1/channels/status' ||
          path === '/api/v1/import/csv/validate' ||
          path === '/api/v1/products/cogs' ||
          path === '/api/v1/reports/attention' ||
          path === '/api/v1/expenses' ||
          path.startsWith('/api/v1/expenses/')) {
        const obRes = await handleOnboardingRoutes(request, env, path, user);
        if (obRes) return obRes;
      }

      // Extract Org ID
      const targetOrgId = request.headers.get('X-Org-ID') || url.searchParams.get('orgId');
      if (!targetOrgId && path !== '/api/v1/orgs/create') {
        return jsonError(400, 'Missing organization ID (X-Org-ID header required)', corsHeaders);
      }

      // 5. Create Organization
      if (path === '/api/v1/orgs/create' && request.method === 'POST') {
        const body = await request.json();
        const orgId = `org_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const memId = `mem_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const name  = body.name || 'My Business';
        const curr  = body.currency || 'PKR';

        await env.DB.prepare(`INSERT INTO organizations (id, name, base_currency) VALUES (?, ?, ?)`).bind(orgId, name, curr).run();
        await env.DB.prepare(`INSERT INTO org_memberships (id, org_id, user_id, role) VALUES (?, ?, ?, 'owner')`).bind(memId, orgId, user.id).run();

        return json({ ok: true, orgId, name, currency: curr, role: 'owner' }, corsHeaders);
      }

      // Verify Membership
      const membership = await authorizeOrgMembership(env, user.id, targetOrgId, 'viewer');
      const verifiedOrgId = membership.org_id;

      // 6. Connect Channel
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

      // 7. Import (JSON)
      if (path === '/api/v1/import' && request.method === 'POST') {
        const membership = await authorizeOrgMembership(env, user.id, targetOrgId, 'member');
        const verifiedOrgId = membership.org_id;
        const body = await request.json();
        const result = await processImportJob(env.DB, {
          orgId: verifiedOrgId, channelId: body.channelId, provider: body.provider,
          rows: body.rows || [], importType: body.importType || 'orders', sourceName: body.sourceName || 'api_payload'
        });
        return json({ ok: true, result }, corsHeaders);
      }

      // 8. CSV Import
      if (path === '/api/v1/import/csv' && request.method === 'POST') {
        const membership = await authorizeOrgMembership(env, user.id, targetOrgId, 'member');
        const verifiedOrgId = membership.org_id;
        const body = await request.json();
        const result = await processCsvImport(env.DB, {
          orgId: verifiedOrgId, channelId: body.channelId, csvRows: body.csvRows || [],
          columnMapping: body.columnMapping || {}, importType: body.importType || 'orders', sourceName: body.sourceName || 'upload.csv'
        });
        return json({ ok: true, result }, corsHeaders);
      }

      // 9. Financial Report
      if (path === '/api/v1/reports/financial' && request.method === 'GET') {
        const start = url.searchParams.get('startDate');
        const end   = url.searchParams.get('endDate');
        const report = await getFinancialSummary(env.DB, verifiedOrgId, start, end);
        return json({ ok: true, report }, corsHeaders);
      }

      // 10. Channel Breakdown
      if (path === '/api/v1/reports/channels' && request.method === 'GET') {
        const channels = await getChannelBreakdown(env.DB, verifiedOrgId);
        return json({ ok: true, channels }, corsHeaders);
      }

      // 11. Payout Reconciliation
      if (path === '/api/v1/reconciliation/payouts' && request.method === 'GET') {
        const reconciliations = await reconcilePayouts(env.DB, verifiedOrgId);
        return json({ ok: true, reconciliations }, corsHeaders);
      }

      // 12. Get Orders
      if (path === '/api/v1/orders' && request.method === 'GET') {
        const { results: orders } = await env.DB.prepare(`
          SELECT o.id, o.external_order_id, o.order_number, o.currency, o.gross_amount, o.discount_amount, o.shipping_amount, o.tax_amount, (o.gross_amount - o.discount_amount + o.shipping_amount + o.tax_amount) as net_amount, o.financial_status, c.provider, o.ordered_at
          FROM canonical_orders o
          LEFT JOIN sales_channels c ON o.channel_id = c.id
          WHERE o.org_id = ?
          ORDER BY o.ordered_at DESC
          LIMIT 100
        `).bind(verifiedOrgId).all();

        return json({ ok: true, orders: orders || [] }, corsHeaders);
      }

      // 13. Import Jobs
      if (path === '/api/v1/import/jobs' && request.method === 'GET') {
        const { results: jobs } = await env.DB.prepare(`
          SELECT j.id, j.import_type, j.source_name, j.total_rows, j.successful_rows, j.skipped_rows, j.failed_rows, j.status, j.started_at, j.completed_at
          FROM import_jobs j
          WHERE j.org_id = ?
          ORDER BY j.started_at DESC
          LIMIT 50
        `).bind(verifiedOrgId).all();

        return json({ ok: true, jobs: jobs || [] }, corsHeaders);
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
