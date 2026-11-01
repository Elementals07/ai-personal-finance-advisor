/**
 * Realistic Indian Middle-Class Expense Seed Script
 * ─────────────────────────────────────────────────
 * • Finds the first user in the DB (your existing account)
 * • Wipes their transactions, category_historical_snapshots, and AI cache
 * • Seeds 6 months (Jun–Nov 2026) of realistic INR expenses
 * • Monthly income set to ₹65,000 (upper-middle class India)
 * • Updates budget allocations for Oct & Nov 2026
 *
 * Run with: node seed_realistic_data.js
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

// ── Monthly income for the demo user ──────────────────────────────────────────
const MONTHLY_INCOME = 65000;

// ── Realistic INR expense data ─────────────────────────────────────────────────
// Format: [date-YYYY-MM-DD, category, amount, description]
const EXPENSES = [
    // ── June 2026 ── (₹52,400 spent, ₹12,600 saved)
    ['2026-06-01', 'Rent',           18000, 'Monthly rent – 2BHK'],
    ['2026-06-03', 'Utilities',       1850, 'Electricity bill'],
    ['2026-06-03', 'Utilities',        490, 'Broadband internet'],
    ['2026-06-05', 'Food',            3200, 'Monthly grocery run – Big Bazaar'],
    ['2026-06-07', 'Food',             420, 'Zomato – weekend dinner'],
    ['2026-06-08', 'Travel',          1200, 'Ola cabs – office commute June'],
    ['2026-06-10', 'Food',             180, 'Swiggy – lunch'],
    ['2026-06-11', 'Shopping',        3500, 'New jeans and t-shirts – Myntra'],
    ['2026-06-12', 'Health',          1500, 'Monthly gym membership'],
    ['2026-06-13', 'Food',             280, 'Blinkit – quick groceries'],
    ['2026-06-14', 'Entertainment',   1100, 'Netflix + Hotstar annual split'],
    ['2026-06-15', 'Food',             650, 'Family lunch – Udupi restaurant'],
    ['2026-06-17', 'Education',       2500, 'Online course – Coursera'],
    ['2026-06-18', 'Food',             340, 'Swiggy – dinner'],
    ['2026-06-19', 'Travel',          3800, 'Petrol fill – full tank'],
    ['2026-06-20', 'Health',           800, 'Doctor consultation'],
    ['2026-06-21', 'Food',             920, 'Weekend outing – food + drinks'],
    ['2026-06-22', 'Shopping',        1200, 'Home essentials – DMart'],
    ['2026-06-24', 'Utilities',        320, 'Mobile recharge'],
    ['2026-06-25', 'Food',             210, 'Blinkit – snacks'],
    ['2026-06-26', 'Entertainment',    780, 'Movie tickets – BookMyShow × 2'],
    ['2026-06-27', 'Food',             580, 'Swiggy – pizza night'],
    ['2026-06-28', 'Travel',          1100, 'Ola – weekend trips'],
    ['2026-06-29', 'Others',           380, 'Barber + miscellaneous'],
    ['2026-06-30', 'Food',             400, 'Month-end chai & snacks'],

    // ── July 2026 ── (₹47,650 spent, ₹17,350 saved)
    ['2026-07-01', 'Rent',           18000, 'Monthly rent – 2BHK'],
    ['2026-07-02', 'Utilities',       1750, 'Electricity bill – June reading'],
    ['2026-07-02', 'Utilities',        490, 'Broadband internet'],
    ['2026-07-04', 'Food',            2900, 'Grocery – Reliance Fresh'],
    ['2026-07-05', 'Travel',          3800, 'Petrol – monthly fill-up'],
    ['2026-07-06', 'Health',          1500, 'Gym membership'],
    ['2026-07-07', 'Food',             380, 'Zomato – biryani dinner'],
    ['2026-07-08', 'Shopping',        2200, 'Monsoon raincoat + umbrella'],
    ['2026-07-10', 'Food',             260, 'Blinkit – eggs, bread, milk'],
    ['2026-07-11', 'Entertainment',    680, 'OTT subscriptions'],
    ['2026-07-12', 'Food',             740, 'Restaurant lunch with colleagues'],
    ['2026-07-14', 'Health',           350, 'Pharmacy – vitamin supplements'],
    ['2026-07-15', 'Food',             310, 'Swiggy – weekend breakfast'],
    ['2026-07-16', 'Travel',          1200, 'Metro + Ola combined monthly'],
    ['2026-07-17', 'Education',       1500, 'Book purchase – finance & productivity'],
    ['2026-07-18', 'Food',             430, 'Blinkit – quick grocery top-up'],
    ['2026-07-19', 'Shopping',         890, 'Household cleaning supplies'],
    ['2026-07-21', 'Utilities',        320, 'Mobile recharge'],
    ['2026-07-22', 'Food',             580, 'Weekend dinner – North Indian'],
    ['2026-07-24', 'Others',           620, 'Subscription – newspaper + misc'],
    ['2026-07-25', 'Food',             290, 'Swiggy – dinner'],
    ['2026-07-26', 'Entertainment',    950, 'Movie + snacks – weekend'],
    ['2026-07-27', 'Food',             480, 'Dosa house – family breakfast'],
    ['2026-07-28', 'Others',           280, 'Haircut + grooming'],
    ['2026-07-29', 'Travel',          1000, 'Weekend day trip – petrol'],
    ['2026-07-31', 'Food',             470, 'End-of-month snack run'],

    // ── August 2026 ── (₹55,120 spent, ₹9,880 saved — higher shopping month)
    ['2026-08-01', 'Rent',           18000, 'Monthly rent – 2BHK'],
    ['2026-08-02', 'Utilities',       1920, 'Electricity bill – peak summer end'],
    ['2026-08-02', 'Utilities',        490, 'Broadband internet'],
    ['2026-08-03', 'Food',            3100, 'Monthly grocery – Big Bazaar'],
    ['2026-08-04', 'Travel',          3800, 'Petrol – monthly fill'],
    ['2026-08-05', 'Health',          1500, 'Gym membership'],
    ['2026-08-06', 'Shopping',        5200, 'Independence Day sale – Amazon'],
    ['2026-08-07', 'Food',             550, 'Zomato – biryani for two'],
    ['2026-08-08', 'Entertainment',    700, 'OTT + music subscription'],
    ['2026-08-09', 'Food',             280, 'Blinkit – daily needs'],
    ['2026-08-10', 'Health',           450, 'Dentist – routine check-up'],
    ['2026-08-11', 'Shopping',        2400, 'Clothing for festival season'],
    ['2026-08-12', 'Food',             640, 'Family dinner – Chinese restaurant'],
    ['2026-08-14', 'Travel',          1500, 'Independence Day outing – cab fare'],
    ['2026-08-15', 'Food',             320, 'Sweets + mithai for Independence Day'],
    ['2026-08-17', 'Education',       1200, 'AWS certification prep material'],
    ['2026-08-18', 'Food',             490, 'Swiggy – multiple days'],
    ['2026-08-19', 'Utilities',        320, 'Mobile recharge'],
    ['2026-08-20', 'Shopping',        1800, 'Electronics accessory – earphones'],
    ['2026-08-21', 'Food',             420, 'Blinkit – groceries'],
    ['2026-08-22', 'Others',           580, 'Society maintenance charge'],
    ['2026-08-24', 'Entertainment',    880, 'Multiplex movie – Jawan rewatch'],
    ['2026-08-25', 'Food',             760, 'Sunday brunch – café'],
    ['2026-08-26', 'Travel',          1100, 'Ola + metro'],
    ['2026-08-27', 'Others',           280, 'Haircut + grooming'],
    ['2026-08-28', 'Food',             370, 'Chai, snacks, daily'],
    ['2026-08-30', 'Shopping',         860, 'Stationery + home office items'],
    ['2026-08-31', 'Food',             400, 'Month-end grocery top-up'],

    // ── September 2026 ── (₹50,880 spent, ₹14,120 saved)
    ['2026-09-01', 'Rent',           18000, 'Monthly rent – 2BHK'],
    ['2026-09-01', 'Utilities',       1680, 'Electricity bill'],
    ['2026-09-02', 'Utilities',        490, 'Broadband internet'],
    ['2026-09-03', 'Food',            2800, 'Monthly grocery run'],
    ['2026-09-04', 'Travel',          3800, 'Petrol – full tank'],
    ['2026-09-05', 'Health',          1500, 'Gym membership'],
    ['2026-09-06', 'Food',             480, 'Zomato – Saturday dinner'],
    ['2026-09-07', 'Shopping',        2200, 'Navratri shopping – clothes'],
    ['2026-09-08', 'Entertainment',    700, 'OTT subscriptions'],
    ['2026-09-09', 'Food',             320, 'Blinkit – daily items'],
    ['2026-09-10', 'Education',       2000, 'Data science course fee – part 1'],
    ['2026-09-11', 'Food',             580, 'Restaurant – client lunch'],
    ['2026-09-12', 'Health',           650, 'Blood test – routine panel'],
    ['2026-09-13', 'Travel',          1100, 'Metro + Ola weekday'],
    ['2026-09-14', 'Food',             260, 'Swiggy – quick dinner'],
    ['2026-09-16', 'Others',           500, 'Society festival contribution'],
    ['2026-09-17', 'Food',             420, 'Sweets for Ganesh Chaturthi'],
    ['2026-09-18', 'Entertainment',    850, 'Ganesh Chaturthi outing'],
    ['2026-09-19', 'Utilities',        320, 'Mobile recharge'],
    ['2026-09-20', 'Food',             380, 'Blinkit – weekly top-up'],
    ['2026-09-21', 'Shopping',        1400, 'Home décor items'],
    ['2026-09-22', 'Food',             650, 'Sunday family lunch'],
    ['2026-09-24', 'Travel',          1100, 'Weekend outing – cab'],
    ['2026-09-25', 'Others',           280, 'Haircut + grooming'],
    ['2026-09-26', 'Food',             430, 'Swiggy – biryani'],
    ['2026-09-27', 'Health',           340, 'Pharmacy – cough syrup, vitamins'],
    ['2026-09-28', 'Food',             320, 'Blinkit – Sunday needs'],
    ['2026-09-30', 'Others',           330, 'Newspaper + misc subscriptions'],

    // ── October 2026 ── (₹48,970 spent, ₹16,030 saved)
    ['2026-10-01', 'Rent',           18000, 'Monthly rent – 2BHK'],
    ['2026-10-02', 'Utilities',       1560, 'Electricity bill'],
    ['2026-10-02', 'Utilities',        490, 'Broadband internet'],
    ['2026-10-03', 'Food',            2700, 'Monthly grocery – Reliance Fresh'],
    ['2026-10-04', 'Travel',          3800, 'Petrol – monthly fill-up'],
    ['2026-10-05', 'Health',          1500, 'Gym membership'],
    ['2026-10-06', 'Shopping',        3200, 'Dussehra sale – Amazon fashion'],
    ['2026-10-07', 'Food',             540, 'Zomato – festive dinner'],
    ['2026-10-08', 'Entertainment',    780, 'OTT + gaming subscription'],
    ['2026-10-09', 'Food',             290, 'Blinkit – weekly needs'],
    ['2026-10-10', 'Education',       1500, 'Data science course fee – part 2'],
    ['2026-10-11', 'Food',             640, 'Dussehra family dinner – restaurant'],
    ['2026-10-12', 'Health',           500, 'Eye check-up + new specs deposit'],
    ['2026-10-13', 'Travel',           900, 'Ola + metro commute'],
    ['2026-10-14', 'Food',             320, 'Swiggy – lunch'],
    ['2026-10-15', 'Shopping',        2100, 'Diwali decoration items'],
    ['2026-10-17', 'Others',           600, 'Society maintenance + donation'],
    ['2026-10-18', 'Food',             480, 'Sweets – Diwali prep'],
    ['2026-10-19', 'Entertainment',    920, 'Diwali outing – fireworks party'],
    ['2026-10-20', 'Utilities',        320, 'Mobile recharge'],
    ['2026-10-21', 'Food',             650, 'Diwali dinner – North Indian restaurant'],
    ['2026-10-22', 'Shopping',         900, 'Puja items + diyas + candles'],
    ['2026-10-24', 'Travel',           800, 'Post-Diwali cab rides'],
    ['2026-10-25', 'Others',           280, 'Haircut + grooming'],
    ['2026-10-26', 'Food',             550, 'Mithai box – gifting neighbor'],
    ['2026-10-27', 'Health',           380, 'Pharmacy – vitamins'],
    ['2026-10-28', 'Food',             410, 'Blinkit – weekly groceries'],
    ['2026-10-30', 'Others',           460, 'Misc household expenses'],

    // ── November 2026 ── (₹46,150 spent so far — current month, partial)
    ['2026-11-01', 'Rent',           18000, 'Monthly rent – 2BHK'],
    ['2026-11-01', 'Utilities',       1480, 'Electricity bill – cooler season'],
    ['2026-11-01', 'Utilities',        490, 'Broadband internet'],
    ['2026-11-02', 'Food',            2600, 'Monthly grocery – Big Bazaar'],
    ['2026-11-03', 'Travel',          3800, 'Petrol – full tank November'],
    ['2026-11-04', 'Health',          1500, 'Gym membership'],
    ['2026-11-05', 'Food',             460, 'Swiggy – Wednesday dinner'],
    ['2026-11-06', 'Entertainment',    700, 'Netflix + Hotstar'],
    ['2026-11-07', 'Food',             310, 'Blinkit – fresh produce'],
    ['2026-11-08', 'Shopping',        2800, 'Winter clothing – Flipkart Big Billion'],
    ['2026-11-09', 'Health',           420, 'Annual health check-up partial'],
    ['2026-11-10', 'Education',        800, 'Udemy course – system design'],
    ['2026-11-11', 'Food',             590, 'Restaurant – anniversary dinner'],
    ['2026-11-12', 'Travel',           950, 'Ola cabs – week rides'],
    ['2026-11-13', 'Food',             340, 'Swiggy – lunch & dinner'],
    ['2026-11-14', 'Others',           420, 'Society maintenance'],
    ['2026-11-15', 'Food',             680, 'Sunday lunch – family outing'],
    ['2026-11-16', 'Utilities',        320, 'Mobile recharge'],
    ['2026-11-17', 'Shopping',        1400, 'Home essentials – DMart run'],
    ['2026-11-18', 'Food',             370, 'Blinkit – evening snacks'],
    ['2026-11-19', 'Entertainment',    850, 'Movie + coffee – weekend'],
    ['2026-11-20', 'Others',           280, 'Haircut + grooming'],
    ['2026-11-21', 'Food',             430, 'Swiggy – quick meals'],
    ['2026-11-22', 'Travel',          1000, 'Weekend drive – petrol top-up'],
    ['2026-11-24', 'Food',             480, 'Grocery top-up – week 4'],
    ['2026-11-25', 'Health',           380, 'Pharmacy run'],
    ['2026-11-26', 'Food',             420, 'Zomato – biryani Saturday'],
    ['2026-11-27', 'Others',           340, 'Misc household items'],
    ['2026-11-28', 'Food',             280, 'Blinkit – milk, eggs, bread'],
];

// ── Budget allocations for Oct & Nov 2026 ─────────────────────────────────────
const BUDGET_MONTHS = ['2026-10', '2026-11'];
const ALLOCATIONS = {
    'Rent':          18000,
    'Food':           7000,
    'Travel':         5000,
    'Shopping':       4000,
    'Health':         2500,
    'Utilities':      3000,
    'Entertainment':  2000,
    'Education':      2000,
    'Others':         1500
};

async function run() {
    const conn = await pool.getConnection();
    try {
        console.log('\n🔍  Finding existing user...');
        const [users] = await conn.execute(
            'SELECT id, name, email, monthly_income FROM users ORDER BY id ASC LIMIT 1'
        );
        if (users.length === 0) {
            console.error('❌  No users found. Please create an account first via the app.');
            process.exit(1);
        }
        const user = users[0];
        console.log(`✅  Found user: "${user.name}" (id=${user.id}, email=${user.email})`);

        // ── 1. Wipe existing data for this user ───────────────────────────────
        console.log('\n🗑️   Deleting existing transactions...');
        const [delTxn] = await conn.execute(
            'DELETE FROM transactions WHERE user_id = ?', [user.id]
        );
        console.log(`    Deleted ${delTxn.affectedRows} transactions`);

        console.log('🗑️   Clearing category historical snapshots...');
        const [delSnap] = await conn.execute(
            'DELETE FROM category_historical_snapshots WHERE user_id = ?', [user.id]
        );
        console.log(`    Deleted ${delSnap.affectedRows} snapshots`);

        // Clear AI insights cache if that table exists
        try {
            await conn.execute('DELETE FROM ai_insights_cache WHERE user_id = ?', [user.id]);
            console.log('🗑️   Cleared AI insights cache');
        } catch (_) { /* table may not exist — ignore */ }

        // Wipe old budgets too so they don't conflict
        const [delBudget] = await conn.execute(
            'DELETE FROM budgets WHERE user_id = ?', [user.id]
        );
        console.log(`🗑️   Deleted ${delBudget.affectedRows} old budget rows`);

        // ── 2. Set monthly income ─────────────────────────────────────────────
        console.log(`\n💰  Setting monthly income to ₹${MONTHLY_INCOME.toLocaleString('en-IN')}...`);
        await conn.execute(
            'UPDATE users SET monthly_income = ? WHERE id = ?',
            [MONTHLY_INCOME, user.id]
        );

        // ── 3. Insert realistic expenses ─────────────────────────────────────
        console.log('\n📝  Inserting realistic expenses...');
        let inserted = 0;
        for (const [date, category, amount, description] of EXPENSES) {
            await conn.execute(
                'INSERT INTO transactions (user_id, amount, category, description, date) VALUES (?, ?, ?, ?, ?)',
                [user.id, amount, category, description, date]
            );
            inserted++;
        }
        console.log(`    ✅  Inserted ${inserted} transactions across 6 months`);

        // ── 4. Rebuild category_historical_snapshots ──────────────────────────
        console.log('\n🔄  Rebuilding monthly category snapshots...');
        const [snapRows] = await conn.execute(`
            SELECT 
                DATE_FORMAT(date, '%Y-%m') AS period_id,
                category,
                SUM(amount) AS total_spent,
                COUNT(*)    AS transaction_count
            FROM transactions
            WHERE user_id = ?
            GROUP BY DATE_FORMAT(date, '%Y-%m'), category
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

        // ── 5. Insert budget plans for Oct & Nov ──────────────────────────────
        console.log('\n📊  Setting budget allocations for Oct & Nov 2026...');
        for (const month of BUDGET_MONTHS) {
            // Insert/update an "All" row for income reference
            await conn.execute(`
                INSERT INTO budgets (user_id, month, category, budget_amount)
                VALUES (?, ?, 'All', ?)
                ON DUPLICATE KEY UPDATE budget_amount = VALUES(budget_amount)
            `, [user.id, month, MONTHLY_INCOME]);

            // Insert individual category allocations
            for (const [category, amount] of Object.entries(ALLOCATIONS)) {
                await conn.execute(`
                    INSERT INTO budgets (user_id, month, category, budget_amount)
                    VALUES (?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE budget_amount = VALUES(budget_amount)
                `, [user.id, month, category, amount]);
            }
        }
        console.log('    ✅  Budget plans set for 2026-10 and 2026-11');

        // ── 6. Quick verification ─────────────────────────────────────────────
        console.log('\n📈  Monthly spending summary:');
        const [summary] = await conn.execute(`
            SELECT 
                DATE_FORMAT(date, '%Y-%m') AS month,
                COUNT(*)                   AS txn_count,
                SUM(amount)                AS total_spent
            FROM transactions
            WHERE user_id = ?
            GROUP BY DATE_FORMAT(date, '%Y-%m')
            ORDER BY month ASC
        `, [user.id]);

        for (const row of summary) {
            const saved = MONTHLY_INCOME - row.total_spent;
            const savedStr = saved >= 0 ? `+₹${saved.toLocaleString('en-IN')} saved` : `-₹${Math.abs(saved).toLocaleString('en-IN')} over budget`;
            console.log(`    ${row.month}  →  ₹${parseFloat(row.total_spent).toLocaleString('en-IN')} spent (${row.txn_count} txns)  |  ${savedStr}`);
        }

        console.log('\n🎉  Seed complete! Refresh the app to see the new data.\n');
    } catch (err) {
        console.error('\n❌  Error during seeding:', err.message);
        console.error(err.stack);
        process.exit(1);
    } finally {
        conn.release();
        await pool.end();
    }
}

run();
