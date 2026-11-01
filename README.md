# 🤖 AI Personal Finance Advisor

A production-quality, full-stack personal finance management system with autonomous AI financial intelligence, built with React, Node.js, MySQL, and Google Gemini.

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
- **📸 AI Bill & Receipt Scanner (New)**:
  - Multimodal OCR via **Gemini 2.5 Flash**.
  - Extracts Merchant, Total Amount, Category, and Itemized Line Items.
  - **Smart Date Resolution**: Auto-detects bill date from receipt; defaults to current date if missing/unreadable.
  - **Manual Override**: Native date picker lets user override the bill date before saving.
  - **Multi-Category Split**: Option to split supermarket receipts into multiple category transactions at once (`/api/expenses/batch`).
- **🤖 Autonomous AI Financial Advisor (Gemini Function Calling)**:
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
                        │ Gemini 2.5 Flash │
                        └──────────────────┘
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js 20+
- MySQL 8.0+ / 9.0+ (Fully compatible with `ONLY_FULL_GROUP_BY`)
- Google Gemini API key

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
```

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
│   │   ├── aiTools.js                     # 7 Gemini tool declarations, executors & system prompt
│   │   ├── aiService.js                   # Gemini 2.5 Flash, multi-turn tool loop & vision OCR
│   │   └── dataProcessingService.js       # Baselines, anomaly delta matrix, health signals
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
│       │       ├── BillScannerModal.jsx   # 📸 Camera/upload OCR & editable review modal
│       │       └── ExpenseForm.jsx        # Manual entry with quick OCR button
│       ├── utils/
│       │   └── advisorFormatter.js        # Dynamic Markdown -> Card & KPI HTML parser
│       ├── pages/
│       │   ├── ExpensesPage.jsx           # Includes '📸 Scan Bill' button
│       │   └── DashboardPage.jsx
│       └── App.css                        # Executive advisor visual styles
├── .env
└── README.md
```
