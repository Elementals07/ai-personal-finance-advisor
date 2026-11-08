# 🤖 AI Personal Finance Advisor

A full-stack personal finance management system with AI financial intelligence, built with React, Node.js, MySQL, Velona, and Google Gemini.

---

## 🔐 Demo User Credentials (University Project)

| Field | Value |
|---|---|
| **Email** | `demo@example.com` |
| **Password** | `demo@123` |
| **Monthly Income** | ₹85,000 |
| **Backup Table** | `demo_user_backup` (contains full original data copy) |

---

## ✨ Features & Architecture

- **🔐 Authentication** — JWT & bcrypt auth with automatic profile initialization.
- **💸 Expense Management** — Full CRUD operations with categories, dates, pagination, and multi-filters.
- **📸 AI Bill & Receipt Scanner**:
  - Multimodal OCR via the selected AI provider.
  - Extracts Merchant, Total Amount, Category, and Itemized Line Items.
  - **Background Queue**: Upload several receipts at once; up to two scan concurrently and results remain reviewable while you navigate the app.
  - **Smart Date Resolution**: Auto-detects bill date from receipt; defaults to current date if missing/unreadable.
  - **Manual Override**: Native date picker lets user override the bill date before saving.
  - **Multi-Category Split**: Option to split supermarket receipts into multiple category transactions at once (`/api/expenses/batch`).
- **🤖 AI Financial Advisor (provider-compatible function calling)**:
  - Not limited to static snapshots: AI calls **7 real-time SQL tools** on demand (`get_period_summary`, `get_category_history`, `get_annual_breakdown`, etc.).
  - Can answer complex queries (e.g. *"Analyze first 4 months"*, *"Analyze food budget for whole year"*, *"Can I afford X?"*).
  - **3-Month Rolling Baseline**: Flags category spending spikes (>30%) and micro-leakages (small repeated spends).
  - **Date Awareness**: Explains date gaps if current calendar month has 0 logged transactions.
- **🎨 Executive Visual Presentation**:
  - Dynamically renders structured responses as KPI cards, diagnosis boxes (`🚨`, `⚠️`, `✅`), action cards (`1.`, `2.`), and currency pill tags (`₹`).
  - Completely dynamic with zero hardcoded scripts.
- **⚡ Performance & Caching**:
  - `category_historical_snapshots` table for O(1) multi-month category comparisons.
  - SHA-256 hash-based MySQL cache (`ai_insights_cache`) for rate-limit protection.

---

## 🏗 Architecture Diagram

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────────────────────────┐
│   React Client  │────▶│  Express Server  │────▶│              MySQL               │
│   (Vite)        │     │                  │     │  • users                         │
│                 │     │  ┌────────────┐  │     │  • transactions                  │
│  • Dashboard    │     │  │ AI Tools & │  │     │  • budgets                       │
│  • Expenses     │     │  │ Function   │──┼────▶│  • category_historical_snapshots│
│  • Bill Scanner │     │  │ Calling    │  │     │  • ai_insights_cache             │
│  • AI Insights  │     │  └────────────┘  │     │  • demo_user_backup              │
│  • Advisor Chat │     │                  │     └──────────────────────────────────┘
└─────────────────┘     └────────┬─────────┘
                                 │ (Bi-directional Function Calling & OCR)
                                 ▼
                        ┌──────────────────┐
                        │ Velona (default) │
                        │ Google Gemini    │
                        └──────────────────┘
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js 20+
- MySQL 8.0+ / 9.0+ (Fully compatible with `ONLY_FULL_GROUP_BY`)
- Velona API key (or a Gemini key for Gemini-only use)

### 1. Database Setup
```bash
# Run schema and migrations
mysql -u root -p finance_advisor < server/schema.sql
mysql -u root -p finance_advisor < server/migrations/001_add_category_snapshots.sql
```

### 2. Configure Environment (`.env`)
```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=finance_advisor
JWT_SECRET=your-jwt-secret
GEMINI_API_KEY_1=AIzaSy...
VELONA_API_KEY=your_backend_only_velona_key
AI_USD_TO_INR_RATE=your_current_usd_to_inr_rate
```

`VELONA_API_KEY` belongs only in the backend root `.env`; never put it in a
`VITE_` variable, client source, or Android package. `.env` is ignored by Git.
Velona is selected by default with model `qwen/qwen3.7-flash`. Its defaults are
centralized in `server/config/aiModels.js` and can be overridden with the
optional `AI_MODEL_CHATBOT`, `AI_MODEL_FINANCIAL_ANALYSIS`,
`AI_MODEL_RECEIPT_SCANNING`, and `AI_MODEL_SMS_TRANSACTION_PARSING` backend
environment variables. The dedicated **AI Settings** page (sidebar) lets each
account select and persist a separate Velona model for each feature, and shows
the catalogue with capabilities and token prices in INR. The backend retrieves
and caches the Velona catalogue; its API key is never sent to the browser.
Switch **Use Velona AI** off in AI Settings to use Google Gemini. A personal
Gemini key entered in AI Settings remains in memory only for the current app
session and is sent only while Gemini is selected.

The usage panel shows local request/token totals and estimated Velona charges
using the configured model rates. Set `AI_USD_TO_INR_RATE` to a current conversion
rate to display an INR estimate against the initial ₹10 budget. Estimates are
not the provider wallet balance or an exact bill. No billing API is queried.

Apply the usage-ledger migration once to an existing database:
```powershell
mysql -u root -p finance_advisor < server/migrations/004_ai_usage_tracking.sql
```
The backend is the provider proxy for web and Android clients; configure Android
to use the deployed backend URL. Do not place a private Velona key in the APK.

### 3. Start Backend
```powershell
cd server
npm install
npm run dev
```
Runs on `http://localhost:5000`

### 4. Start Frontend
```powershell
cd client
npm install
npm run dev
```
Runs on `http://localhost:5173`

---

## 📂 Project Structure

```
├── server/
│   ├── config/db.js                       # MySQL pool connection
│   ├── migrations/
│   │   └── 001_add_category_snapshots.sql # Snapshot table & backfill
│   ├── models/
│   │   ├── User.js
│   │   ├── Transaction.js                 # CRUD, batch inserts, refreshSnapshot, tool queries
│   │   ├── Budget.js
│   │   ├── Category.js
│   │   └── AIInsightsCache.js
│   ├── services/
│   │   ├── aiTools.js                     # Shared tool declarations, executors & system prompt
│   │   ├── aiService.js                   # Provider routing, prompts, cache and feature logic
│   │   ├── velonaAdapter.js                # OpenAI-compatible text, vision and tool adapter
│   │   └── dataProcessingService.js       # Baselines, anomaly delta matrix, health signals
│   ├── config/aiPricing.js                # Central model rates, local budget and optional FX rate
│   ├── models/AIUsage.js                  # Per-request local usage ledger
│   ├── controllers/
│   │   ├── aiController.js                # Analysis, chat, scan-bill endpoints
│   │   ├── expenseController.js           # CRUD & batch creation
│   │   └── authController.js
│   ├── routes/
│   └── server.js
├── client/
│   └── src/
│       ├── components/
│       │   ├── AI/
│       │   │   ├── AnalysisPanel.jsx      # Traffic light banner, delta badges, AI review
│       │   │   └── ChatAssistant.jsx      # Interactive advisor chat
│       │   └── Expenses/
│       │       ├── ReceiptScannerDock.jsx # 📸 Persistent background-scan status dock
│       │       ├── ReceiptScannerModal.jsx# Multi-receipt queue, OCR review & save
│       │       └── ExpenseForm.jsx        # Manual entry with quick OCR button
│       ├── context/
│       │   └── ReceiptScannerContext.jsx  # In-memory scan queue (max 2 concurrent)
│       ├── utils/
│       │   └── advisorFormatter.js        # Dynamic Markdown -> Card & KPI HTML parser
│       ├── pages/
│       │   ├── AISettingsPage.jsx         # Provider, model, capability & INR pricing
│       │   ├── ExpensesPage.jsx           # Includes '📸 Scan Bill' button
│       │   └── DashboardPage.jsx
│       └── App.css                        # Executive advisor visual styles
├── .env
└── README.md
```
