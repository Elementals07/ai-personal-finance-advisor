const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'elementals08',
    database: process.env.DB_NAME || 'finance_advisor'
});

async function check() {
    try {
        console.log('--- Transaction Distribution ---');
        const [rows] = await pool.execute(
            'SELECT DATE_FORMAT(date, "%Y-%m") as m, COUNT(*) as c FROM transactions WHERE user_id = 3 GROUP BY m ORDER BY m ASC'
        );
        console.table(rows);
        
        console.log('\n--- Current Date ---');
        const [now] = await pool.execute('SELECT CURDATE() as today');
        console.log(now[0].today);
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

check();
