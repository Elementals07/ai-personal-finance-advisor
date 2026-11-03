/**
 * Demo Account Service
 *
 * Provides the shared demo experience on the web backend:
 *  - ensureDemoUser(): idempotently provisions a single demo user (is_demo=1)
 *  - seedDemoData(): generates ~13 months of realistic demo transactions and
 *    budgets, exactly once, when the demo user has an empty ledger.
 *
 * The demo account never mixes with real users: new registrations get an empty
 * ledger and cannot register with the demo email address.
 */
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');
const pool = require('../config/db');

const DEMO_NAME = 'Elementals';
const DEMO_EMAIL = 'user@financeai.com';
const DEMO_PASSWORD = 'demo@123';
const DEMO_INCOME = 65000;

// [description, fraction of the category budget]
const CATEGORY_TEMPLATES = {
    Rent: [['Monthly rent – 2BHK apartment', 1]],
    Food: [
        ['BigBasket weekly groceries', 0.35],
        ['Swiggy dinnerrush', 0.12],
        ['Office canteen lunch', 0.1],
        ['Zomato Saturday night', 0.13],
        ['DMart bulk buy', 0.2],
        ['Street food treat', 0.1]
    ],
    Travel: [
        ['Uber to office', 0.25],
        ['Metro monthly pass', 0.3],
        ['Fuel refill', 0.25],
        ['Rapido quick ride', 0.1],
        ['IRCTC weekend trip', 0.3]
    ],
    Utilities: [
        ['Electricity bill', 0.35],
        ['Mobile recharge', 0.12],
        ['Fibre broadband', 0.28],
        ['Water + maintenance', 0.25]
    ],
    Entertainment: [
        ['Netflix subscription', 0.3],
        ['PVR movie night', 0.25],
        ['Spotify Premium', 0.15],
        ['BGIS bowling with friends', 0.2],
        ['Steam game sale', 0.2]
    ],
    Shopping: [
        ['Myntra apparel', 0.35],
        ['Amazon household buys', 0.25],
        ['Decathlon gear', 0.2],
        ['Croma gadget accessory', 0.2]
    ],
    Health: [
        ['Apollo pharmacy refill', 0.3],
        ['Gym membership', 0.35],
        ['Diagnostic lab test', 0.2],
        ['Dentist consultation', 0.25]
    ],
    Education: [
        ['Udemy course bundle', 0.3],
        ['Coursera monthly dues', 0.25],
        ['Textbooks', 0.25],
        ['Workshop fee', 0.2]
    ],
    Others: [
        ['Gift for a friend', 0.3],
        [' Haircut + salon', 0.2],
        ['Temple donation', 0.15],
        ['Household repairs', 0.35]
    ]
};

const WEIGHTS = {
    Rent: 0.24,
    Food: 0.2,
    Travel: 0.12,
    Utilities: 0.1,
    Entertainment: 0.09,
    Shopping: 0.09,
    Health: 0.06,
    Education: 0.05,
    Others: 0.05
};

// Deterministic pseudo-random jitter for stable output
function jitter(seed, percent) {
    const h = ((seed * 2654435761) >>> 0) % 1000;
    return 1 + ((h / 1000) * 2 - 1) * percent;
}

function splitBudget(budget, template, seed) {
    return template
        .map(([desc, frac], idx) => {
            const amount = Math.round(budget * frac * jitter(seed + idx * 7919, 0.08));
            return { desc, amount };
        })
        .filter(t => t.amount >= 30);
}

function buildMonths(count = 13) {
    const months = [];
    const now = new Date();
    for (let i = count - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return months;
}

function monthToSeed(monthStr) {
    const [y, m] = monthStr.split('-').map(Number);
    return y * 12 + m;
}

/**
 * Ensures the demo user row exists exactly once.
 * @returns {Promise<{id:number}>}
 */
async function ensureDemoUser() {
    const rows = await pool.execute(
        'SELECT id, is_demo FROM users WHERE email = ? LIMIT 1',
        [DEMO_EMAIL]
    ).then(([r]) => r[0]);

    if (rows) {
        if (!rows.is_demo) {
            await pool.execute('UPDATE users SET is_demo = 1 WHERE id = ?', [rows.id]);
        }
        return rows;
    }

    // Force idempotency under concurrent calls
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
        const [res] = await conn.execute(
            'INSERT INTO users (name, email, password_hash, monthly_income, is_demo) VALUES (?, ?, ?, ?, 1)',
            [DEMO_NAME, DEMO_EMAIL, hash, DEMO_INCOME]
        );
        await conn.commit();
        return { id: res.insertId };
    } catch (err) {
        await conn.rollback();
        if (err.code === 'ER_DUP_ENTRY') {
            const [r] = await pool.execute('SELECT id FROM users WHERE email = ?', [DEMO_EMAIL]);
            if (r[0]) return r[0];
        }
        throw err;
    } finally {
        conn.release();
    }
}

let seeding = null;

/**
 * Seeds demo transactions + budgets once (guarded by existing data counts).
 */
async function seedDemoData(demoUserId) {
    // Guard against concurrent/log double-seeding
    while (seeding) {
        try { await seeding; } catch { /* ignore */ }
    }

    seeding = (async () => {
        const [txnRows] = await pool.execute(
            'SELECT COUNT(*) AS n FROM transactions WHERE user_id = ?',
            [demoUserId]
        );
        if (txnRows[0].n > 0) return false;

        const months = buildMonths(13);
        const categories = Object.keys(CATEGORY_TEMPLATES);
        const allItems = [];

        for (const month of months) {
            const seed = monthToSeed(month);
            for (const category of categories) {
                const catBudget = Math.round(DEMO_INCOME * WEIGHTS[category] * jitter(seed + category.length * 131, 0.1));
                const txns = splitBudget(catBudget, CATEGORY_TEMPLATES[category], seed + category.length * 31337);
                // assign spread-out days
                const daySlots = category === 'Rent'
                    ? [1]
                    : [3, 6, 9, 12, 15, 18, 21, 24, 26, 28];
                txns.forEach((t, i) => {
                    const day = category === 'Rent' ? 1 : daySlots[i % daySlots.length];
                    const date = `${month}-${String(day).padStart(2, '0')}`;
                    allItems.push({
                        amount: t.amount,
                        category,
                        description: t.desc.trim(),
                        date
                    });
                });
            }
        }

        if (allItems.length > 0) {
            // Fingerprint-less seed data — deliberately unique per demo install.
            await Transaction.createBatch(demoUserId, allItems, false);
        }

        // Seed budgets for the last 6 seeded months
        const budgetMonths = months.slice(-6);
        for (const month of budgetMonths) {
            const allocations = [];
            allocations.push({ category: 'All', amount: DEMO_INCOME });
            categories.forEach(cat => {
                const catBudget = Math.round(DEMO_INCOME * WEIGHTS[cat] * jitter(monthToSeed(month) + cat.length * 131, 0.1));
                allocations.push({ category: cat, amount: catBudget });
            });
            await Budget.upsert(demoUserId, month, allocations);
        }

        return true;
    })();

    try {
        return await seeding;
    } finally {
        seeding = null;
    }
}

module.exports = {
    DEMO_EMAIL,
    DEMO_NAME,
    DEMO_PASSWORD,
    DEMO_INCOME,
    ensureDemoUser,
    seedDemoData
};
