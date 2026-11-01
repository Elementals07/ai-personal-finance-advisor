/**
 * 2.5-Year Realistic Indian Middle-Class Expense Seed
 * ─────────────────────────────────────────────────────
 * Covers: May 2024 → November 2026 (31 months)
 *
 * Realistic patterns:
 *   • Income grows from ₹55k → ₹60k → ₹65k (two raises)
 *   • Rent steps up over time (₹14k → ₹16k → ₹18k)
 *   • Festival months (Oct/Nov) spike shopping
 *   • Summer (Apr–Jun) spikes electricity
 *   • Savings rate: 18–32% — healthy but not unrealistic
 *   • Some months have medical bills, some have travel
 *   • Natural micro-variation in food/travel
 *
 * Run: node seed_2_5_years.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host:     process.env.DB_HOST     || 'localhost',
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME     || 'finance_advisor',
    waitForConnections: true,
    connectionLimit: 5
});

// ─── Income ladder ────────────────────────────────────────────────────────────
function getIncome(month) {
    if (month <= '2024-12') return 55000;
    if (month <= '2025-12') return 60000;
    return 65000;
}

// ─── Rent ladder ─────────────────────────────────────────────────────────────
function getRent(month) {
    if (month <= '2024-12') return 14000;
    if (month <= '2025-06') return 15500;
    return 18000;
}

// ─── Deterministic "jitter" — looks random but is reproducible ───────────────
function jitter(base, pct, seed) {
    // pct = 0–1 range, e.g. 0.12 = ±12%
    // Use a stronger hash so adjacent months don't mirror each other
    const hash = ((seed * 2654435761) >>> 0) % 1000;
    const sign  = hash % 2 === 0 ? 1 : -1;
    const factor = 1 + sign * ((hash % 100) / 100) * pct;
    return Math.round(base * factor);
}

// ─── Food transaction templates ───────────────────────────────────────────────
const FOOD_TXNS = [
    ['Reliance Fresh – monthly grocery', 0.38],
    ['Big Bazaar – grocery run',         0.36],
    ['Blinkit – weekly top-up',          0.09],
    ['Swiggy – weekday dinner',          0.07],
    ['Zomato – weekend dinner',          0.08],
    ['Family restaurant outing',         0.09],
    ['Blinkit – eggs, milk, bread',      0.05],
    ['Swiggy – lunch',                   0.05],
    ['Chai & snacks – daily',            0.04],
    ['DMart – household grocery',        0.12],
    ['Zepto – quick top-up',             0.04],
    ['Sweets & mithai',                  0.03],
];

const TRAVEL_TXNS = [
    ['Petrol – monthly fill-up',    0.62],
    ['Ola / Rapido – weekday rides', 0.18],
    ['Metro card recharge',          0.10],
    ['Weekend outing – cab',         0.10],
];

const UTILITIES_TXNS = [
    ['Electricity bill',    0.55],
    ['Broadband internet',  0.18],
    ['Mobile recharge',     0.14],
    ['Gas cylinder',        0.13],
];

const ENTERTAINMENT_TXNS = [
    ['Netflix + Hotstar',              0.42],
    ['Movie tickets – BookMyShow',     0.30],
    ['Weekend outing – café / drinks', 0.28],
];

const HEALTH_TXNS = [
    ['Gym membership',                 0.52],
    ['Pharmacy – vitamins & medicine', 0.20],
    ['Doctor consultation',            0.16],
    ['Diagnostic lab – blood test',    0.12],
];

const EDUCATION_TXNS = [
    ['Udemy / Coursera course',       0.55],
    ['Books – finance & productivity', 0.20],
    ['YouTube Premium',               0.10],
    ['Workshop registration',         0.15],
];

const SHOPPING_TXNS = [
    ['Amazon / Flipkart – clothing',   0.40],
    ['Myntra – fashion & accessories', 0.25],
    ['Home essentials – DMart',        0.18],
    ['Electronics / gadget accessory', 0.17],
];

const OTHERS_TXNS = [
    ['Society maintenance charge',    0.35],
    ['Haircut + grooming',            0.22],
    ['Newspaper + misc subscription', 0.18],
    ['Gifts & occasions',             0.25],
];

// ─── Split a monthly budget into realistic sub-transactions ──────────────────
function splitBudget(total, templates, date, seedOffset) {
    // Filter out very tiny fractions
    const active = templates.filter(t => t[1] > 0.03);
    const txns = [];
    let used = 0;
    for (let i = 0; i < active.length - 1; i++) {
        const [desc, fraction] = active[i];
        const rawAmt = Math.round(total * fraction);
        if (rawAmt < 50) continue;
        const amt = jitter(rawAmt, 0.08, seedOffset + i);
        used += amt;
        txns.push({ desc, amount: amt });
    }
    // Last item absorbs the remainder
    const remainder = total - used;
    if (remainder > 50) {
        txns.push({ desc: active[active.length - 1][0], amount: remainder });
    }
    return txns;
}

// ─── Spread transactions across days in a natural pattern ────────────────────
function assignDays(txns, year, month) {
    const daysInMonth = new Date(year, month, 0).getDate();
    // Fixed-ish day assignments to look natural
    const daySlots = [1, 2, 3, 5, 7, 8, 10, 12, 14, 15, 17, 18, 19, 21, 22, 24, 25, 26, 27, 28, 29, 30];
    return txns.map((t, i) => ({
        ...t,
        date: `${year}-${String(month).padStart(2, '0')}-${String(daySlots[i % daySlots.length]).padStart(2, '0')}`
    }));
}

// ─── Per-month spending plan ──────────────────────────────────────────────────
// Returns { category → budget } for each month string 'YYYY-MM'
function getMonthlyPlan(monthStr) {
    const [y, m] = monthStr.split('-').map(Number);
    const income = getIncome(monthStr);
    const rent   = getRent(monthStr);

    // Base per-category budget (% of income after rent)
    const disposable = income - rent;
    const isFestival   = m === 10 || m === 11;
    const isSale       = m === 8 || m === 1;     // Aug sale, Jan clearance
    const isHoliSeason = m === 3;
    const isSummer     = m === 4 || m === 5 || m === 6;
    const isLean       = m === 2 || m === 7;     // Feb / Jul tend to be quieter

    // Per-month micro-variance using the month index as seed (0–1% shift)
    const monthSeed = (y - 2024) * 12 + m;
    const v = (n, spread = 0.06) => {
        const h = ((monthSeed * n * 2654435761) >>> 0) % 1000;
        return 1 + ((h % 200) - 100) / 100 * spread;
    };

    const plan = {
        Rent:          rent,
        Food:          Math.round(disposable * (isSummer ? 0.165 : isLean ? 0.145 : 0.155) * v(2)),
        Travel:        Math.round(disposable * (isFestival ? 0.105 : 0.095) * v(3)),
        Shopping:      Math.round(disposable * (isFestival ? 0.18 : isSale ? 0.14 : isHoliSeason ? 0.11 : 0.07) * v(5)),
        Health:        Math.round(disposable * 0.065 * v(7)),
        Utilities:     Math.round(disposable * (isSummer ? 0.085 : 0.065) * v(11)),
        Entertainment: Math.round(disposable * (isFestival ? 0.055 : 0.042) * v(13)),
        Education:     Math.round(disposable * 0.045 * v(17)),
        Others:        Math.round(disposable * 0.03 * v(19)),
    };

    // Special one-off events by month
    // Major travel trips (2–3 times a year)
    const travelMonths = ['2024-06', '2024-12', '2025-04', '2025-09', '2026-01', '2026-07'];
    if (travelMonths.includes(monthStr)) {
        plan.Travel += Math.round(income * 0.09); // weekend trip / family visit
    }

    // Medical spike months
    const medMonths = ['2024-09', '2025-02', '2025-08', '2026-03', '2026-09'];
    if (medMonths.includes(monthStr)) {
        plan.Health += Math.round(income * 0.04);
    }

    // Education spike (course enrollment)
    const courseMonths = ['2024-06', '2024-11', '2025-03', '2025-07', '2026-02', '2026-08'];
    if (courseMonths.includes(monthStr)) {
        plan.Education += Math.round(income * 0.035);
    }

    return plan;
}

// ─── Generate all transactions for a month ───────────────────────────────────
function generateMonth(monthStr, monthIndex) {
    const [y, m] = monthStr.split('-').map(Number);
    const plan = getMonthlyPlan(monthStr);
    const allTxns = [];

    const TEMPLATES = {
        Rent:          null,   // handled separately as single transaction
        Food:          FOOD_TXNS,
        Travel:        TRAVEL_TXNS,
        Utilities:     UTILITIES_TXNS,
        Entertainment: ENTERTAINMENT_TXNS,
        Health:        HEALTH_TXNS,
        Education:     EDUCATION_TXNS,
        Shopping:      SHOPPING_TXNS,
        Others:        OTHERS_TXNS,
    };

    for (const [cat, budget] of Object.entries(plan)) {
        if (budget < 100) continue;

        if (cat === 'Rent') {
            allTxns.push({ category: cat, amount: budget, description: 'Monthly rent – 2BHK apartment', date: `${y}-${String(m).padStart(2, '0')}-01` });
            continue;
        }

        const tmpl = TEMPLATES[cat];
        if (!tmpl) continue;

        const seed = monthIndex * 97 + cat.charCodeAt(0) * 31 + cat.charCodeAt(cat.length - 1);
        const subTxns = splitBudget(budget, tmpl, monthStr, seed);
        const withDays = assignDays(subTxns, y, m);
        withDays.forEach(t => allTxns.push({ category: cat, amount: t.amount, description: t.desc, date: t.date }));
    }

    return allTxns.filter(t => t.amount > 0);
}

// ─── Build the 31-month list ──────────────────────────────────────────────────
function buildMonthRange() {
    const months = [];
    let y = 2024, m = 5;
    while (`${y}-${String(m).padStart(2, '0')}` <= '2026-11') {
        months.push(`${y}-${String(m).padStart(2, '0')}`);
        m++;
        if (m > 12) { m = 1; y++; }
    }
    return months;
}

// ─── Budget allocations for the last 3 months ─────────────────────────────────
function buildBudgets(userId, months) {
    const recentMonths = months.slice(-3); // Sep, Oct, Nov 2026
    const rows = [];
    for (const month of recentMonths) {
        const income = getIncome(month);
        const plan   = getMonthlyPlan(month);
        rows.push({ userId, month, category: 'All', amount: income });
        for (const [cat, amt] of Object.entries(plan)) {
            rows.push({ userId, month, category: cat, amount: amt });
        }
    }
    return rows;
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function run() {
    const conn = await pool.getConnection();
    try {
        console.log('\n🔍  Finding all existing users...');
        const [users] = await conn.execute('SELECT id, name, email FROM users ORDER BY id ASC');
        if (!users.length) {
            console.error('❌  No users found. Create an account first.');
            process.exit(1);
        }
        console.log(`✅  Found ${users.length} users:`);
        users.forEach(u => console.log(`    - ID ${u.id}: "${u.name}" (${u.email})`));

        const months = buildMonthRange();
        console.log(`\n📅  Generating 31 months of realistic data (${months[0]} → ${months[months.length - 1]})...`);

        for (const user of users) {
            console.log(`\n────────────────────────────────────────────────────────────`);
            console.log(`👤  Seeding data for user ID ${user.id} ("${user.name}", ${user.email})...`);

            // 1. Wipe everything for this user
            const [d1] = await conn.execute('DELETE FROM transactions WHERE user_id = ?', [user.id]);
            const [d2] = await conn.execute('DELETE FROM category_historical_snapshots WHERE user_id = ?', [user.id]);
            const [d3] = await conn.execute('DELETE FROM budgets WHERE user_id = ?', [user.id]);
            try { await conn.execute('DELETE FROM ai_insights_cache WHERE user_id = ?', [user.id]); } catch (_) {}
            console.log(`    🗑️   Cleared old data: ${d1.affectedRows} txns, ${d2.affectedRows} snapshots, ${d3.affectedRows} budgets`);

            // 2. Set monthly income
            await conn.execute('UPDATE users SET monthly_income = 65000 WHERE id = ?', [user.id]);

            // 3. Generate all transactions for this user
            const allTxns = [];
            for (let i = 0; i < months.length; i++) {
                const monthStr = months[i];
                const txns = generateMonth(monthStr, i);
                for (const t of txns) {
                    allTxns.push([user.id, t.amount, t.category, t.description, t.date]);
                }
            }

            // Batch insert transactions in chunks of 200
            const chunkSize = 200;
            for (let i = 0; i < allTxns.length; i += chunkSize) {
                const chunk = allTxns.slice(i, i + chunkSize);
                await conn.query(
                    'INSERT INTO transactions (user_id, amount, category, description, date) VALUES ?',
                    [chunk]
                );
            }
            console.log(`    ✅  Inserted ${allTxns.length} realistic transactions across 31 months`);

            // 4. Rebuild category snapshots
            const [snapRows] = await conn.execute(`
                SELECT DATE_FORMAT(date,'%Y-%m') AS period_id, category,
                       SUM(amount) AS total_spent, COUNT(*) AS transaction_count
                FROM transactions WHERE user_id = ?
                GROUP BY DATE_FORMAT(date,'%Y-%m'), category
            `, [user.id]);

            for (const row of snapRows) {
                await conn.execute(`
                    INSERT INTO category_historical_snapshots
                        (user_id, period_type, period_id, category, total_spent, transaction_count)
                    VALUES (?, 'month', ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                        total_spent = VALUES(total_spent),
                        transaction_count = VALUES(transaction_count),
                        updated_at = CURRENT_TIMESTAMP
                `, [user.id, row.period_id, row.category, row.total_spent, row.transaction_count]);
            }
            console.log(`    ✅  Rebuilt ${snapRows.length} snapshot entries`);

            // 5. Insert budget plans for recent months
            const budgets = buildBudgets(user.id, months);
            for (const b of budgets) {
                await conn.execute(`
                    INSERT INTO budgets (user_id, month, category, budget_amount)
                    VALUES (?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE budget_amount = VALUES(budget_amount)
                `, [b.userId, b.month, b.category, b.amount]);
            }
            console.log(`    ✅  Inserted ${budgets.length} budget entries`);
        }

        console.log(`\n────────────────────────────────────────────────────────────`);
        console.log(`🎉  ALL USERS SEEDED SUCCESSFULLY!`);
        console.log(`    Every account in the database now has realistic 2.5-year data.`);
        console.log(`    Refresh your browser window to see the new data!\n`);

    } catch (err) {
        console.error('\n❌  Error:', err.message);
        console.error(err.stack);
        process.exit(1);
    } finally {
        conn.release();
        await pool.end();
    }
}

run();
