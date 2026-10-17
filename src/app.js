const express = require("express");
const cors = require("cors");

const apiRoutes = require("./routes/apiRoutes");

const app = express();

app.use(cors());
app.use(express.json());

// Simple health-check endpoint.
app.get("/", (req, res) => {
    res.status(200).json({
        success: true,
        message: "Library Borrowing API is running."
    });
});

// API endpoints.
app.use("/api", apiRoutes);

// Handle malformed JSON and other Express errors.
app.use((err, req, res, next) => {
    if (res.headersSent) {
        return next(err);
    }

    if (
        err instanceof SyntaxError &&
        err.status === 400 &&
        Object.prototype.hasOwnProperty.call(err, "body")
    ) {
        return res.status(400).json({
            success: false,
            message: "Invalid JSON request body."
        });
    }

    console.error("Unhandled application error:", err);

    return res.status(500).json({
        success: false,
        message: "Internal server error."
    });
});

module.exports = app;