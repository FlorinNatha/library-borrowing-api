require("dotenv").config();

const app = require("./app");
const pool = require("./config/db");

const PORT = Number(process.env.PORT || 5000);

async function startServer() {
    try {
        // Confirm that MySQL is reachable before starting.
        const connection = await pool.getConnection();
        await connection.ping();
        connection.release();

        console.log("Connected to MySQL successfully.");

        app.listen(PORT, () => {
            console.log(`Library API running at http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error("Could not start the server:", error.message);
        await pool.end();
        process.exit(1);
    }
}

startServer();