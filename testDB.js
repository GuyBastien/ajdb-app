const db = require('./models/db');

async function testDB() {
    let conn;
    try {
        conn = await db.getConnection();
        const rows = await conn.query("SELECT 1 AS test");
        console.log("Connexion DB OK :", rows);
    } catch (err) {
        console.error("Erreur DB :", err);
    } finally {
        if (conn) conn.release();
    }
}

testDB();
