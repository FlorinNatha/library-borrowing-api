const express = require("express");

const {
    getBooks,
    borrowBook,
    returnBook,
    getMemberBorrowings
} = require("../controllers/libraryController");

const router = express.Router();

router.get("/books", getBooks);

router.post("/borrowings", borrowBook);

router.post("/borrowings/:id/return", returnBook);

router.get("/members/:id/borrowings", getMemberBorrowings);

module.exports = router;