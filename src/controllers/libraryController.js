const pool = require("../config/db");
const {
    sendBorrowingConfirmation
} = require("../utils/email");

// GET /api/books
async function getBooks(req, res) {
    try {
        const [books] = await pool.execute(
            `SELECT
                id,
                title,
                total_copies AS totalCopies,
                available_copies AS availableCopies
             FROM books
             ORDER BY id`
        );

        return res.status(200).json({
            success: true,
            count: books.length,
            data: books
        });
    } catch (error) {
        console.error("Get books error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to retrieve books."
        });
    }
}

// POST /api/borrowings
async function borrowBook(req, res) {
    const { memberId, bookId } = req.body;

    // Validate request body before starting a transaction.
    if (
        memberId === undefined ||
        bookId === undefined ||
        !Number.isInteger(memberId) ||
        !Number.isInteger(bookId) ||
        memberId <= 0 ||
        bookId <= 0
    ) {
        return res.status(400).json({
            success: false,
            message: "memberId and bookId must be positive integers."
        });
    }

    let connection;
    let transactionStarted = false;
    let committed = false;

    try {
        connection = await pool.getConnection();

        await connection.beginTransaction();
        transactionStarted = true;

        // Lock the member row so concurrent borrowing requests
        // for this member are checked one at a time.
        const [members] = await connection.execute(
            `SELECT id, name, email
             FROM members
             WHERE id = ?
             FOR UPDATE`,
            [memberId]
        );

        if (members.length === 0) {
            const error = new Error("Member not found.");
            error.statusCode = 404;
            throw error;
        }

        const member = members[0];

        // Lock the book row to protect its available copy count.
        const [books] = await connection.execute(
            `SELECT id, title, total_copies, available_copies
             FROM books
             WHERE id = ?
             FOR UPDATE`,
            [bookId]
        );

        if (books.length === 0) {
            const error = new Error("Book not found.");
            error.statusCode = 404;
            throw error;
        }

        const book = books[0];

        // Rule 1: A member can have at most two active borrowings.
        const [activeCountRows] = await connection.execute(
            `SELECT COUNT(*) AS activeCount
             FROM borrowings
             WHERE member_id = ?
               AND status = 'borrowed'`,
            [memberId]
        );

        const activeCount = Number(activeCountRows[0].activeCount);

        if (activeCount >= 2) {
            const error = new Error(
                "A member can have a maximum of 2 active borrowings."
            );
            error.statusCode = 409;
            throw error;
        }

        // Rule 2: The same member cannot borrow the same book twice
        // while the previous borrowing is still active.
        const [duplicateRows] = await connection.execute(
            `SELECT id
             FROM borrowings
             WHERE member_id = ?
               AND book_id = ?
               AND status = 'borrowed'
             LIMIT 1`,
            [memberId, bookId]
        );

        if (duplicateRows.length > 0) {
            const error = new Error(
                "This member already has an active borrowing for this book."
            );
            error.statusCode = 409;
            throw error;
        }

        // Rule 3: There must be at least one available copy.
        if (book.available_copies <= 0) {
            const error = new Error(
                "No copies of this book are currently available."
            );
            error.statusCode = 409;
            throw error;
        }

        // Create the borrowing history record.
        const [insertResult] = await connection.execute(
            `INSERT INTO borrowings
                (member_id, book_id, status, borrowed_at)
             VALUES (?, ?, 'borrowed', UTC_TIMESTAMP())`,
            [memberId, bookId]
        );

        const borrowingId = insertResult.insertId;

        // Decrease availability in the same transaction.
        await connection.execute(
            `UPDATE books
             SET available_copies = available_copies - 1
             WHERE id = ?
               AND available_copies > 0`,
            [bookId]
        );

        await connection.commit();
        committed = true;

        // Send the confirmation after the borrowing is committed.
        // If email generation fails, do not undo a successful borrowing.
        let emailConfirmation = "generated";

        try {
            await sendBorrowingConfirmation({
                memberName: member.name,
                memberEmail: member.email,
                bookTitle: book.title,
                borrowingId
            });
        } catch (emailError) {
            emailConfirmation = "failed";
            console.error(
                "Borrowing succeeded, but email generation failed:",
                emailError
            );
        }

        return res.status(201).json({
            success: true,
            message: "Book borrowed successfully.",
            data: {
                borrowingId,
                memberId: member.id,
                memberName: member.name,
                bookId: book.id,
                bookTitle: book.title,
                status: "borrowed",
                emailConfirmation
            }
        });
    } catch (error) {
        if (connection && transactionStarted && !committed) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error("Transaction rollback error:", rollbackError);
            }
        }

        console.error("Borrow book error:", error);

        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.statusCode
                ? error.message
                : "Failed to borrow book."
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
}

// POST /api/borrowings/:id/return
async function returnBook(req, res) {
    const borrowingId = Number(req.params.id);

    if (
        !Number.isInteger(borrowingId) ||
        borrowingId <= 0
    ) {
        return res.status(400).json({
            success: false,
            message: "Borrowing ID must be a positive integer."
        });
    }

    let connection;
    let transactionStarted = false;
    let committed = false;

    try {
        connection = await pool.getConnection();

        await connection.beginTransaction();
        transactionStarted = true;

        // Lock the borrowing record so simultaneous return requests
        // cannot both return the same borrowing.
        const [borrowings] = await connection.execute(
            `SELECT id, member_id, book_id, status
             FROM borrowings
             WHERE id = ?
             FOR UPDATE`,
            [borrowingId]
        );

        if (borrowings.length === 0) {
            const error = new Error("Borrowing record not found.");
            error.statusCode = 404;
            throw error;
        }

        const borrowing = borrowings[0];

        // Reject a repeated return before changing book availability.
        if (borrowing.status === "returned") {
            const error = new Error(
                "This borrowing has already been returned."
            );
            error.statusCode = 409;
            throw error;
        }

        // Lock the associated book before updating its copy count.
        const [books] = await connection.execute(
            `SELECT id, title, available_copies, total_copies
             FROM books
             WHERE id = ?
             FOR UPDATE`,
            [borrowing.book_id]
        );

        if (books.length === 0) {
            const error = new Error(
                "The book associated with this borrowing no longer exists."
            );
            error.statusCode = 409;
            throw error;
        }

        const book = books[0];

        if (book.available_copies >= book.total_copies) {
            const error = new Error(
                "Book availability is inconsistent; return was not processed."
            );
            error.statusCode = 409;
            throw error;
        }

        // Mark the historical borrowing as returned.
        await connection.execute(
            `UPDATE borrowings
             SET status = 'returned',
                 returned_at = UTC_TIMESTAMP()
             WHERE id = ?
               AND status = 'borrowed'`,
            [borrowingId]
        );

        // Restore the available copy in the same transaction.
        await connection.execute(
            `UPDATE books
             SET available_copies = available_copies + 1
             WHERE id = ?
               AND available_copies < total_copies`,
            [borrowing.book_id]
        );

        await connection.commit();
        committed = true;

        return res.status(200).json({
            success: true,
            message: "Book returned successfully.",
            data: {
                borrowingId: borrowing.id,
                memberId: borrowing.member_id,
                bookId: book.id,
                bookTitle: book.title,
                status: "returned"
            }
        });
    } catch (error) {
        if (connection && transactionStarted && !committed) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error("Transaction rollback error:", rollbackError);
            }
        }

        console.error("Return book error:", error);

        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.statusCode
                ? error.message
                : "Failed to return book."
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
}

// GET /api/members/:id/borrowings
async function getMemberBorrowings(req, res) {
    const memberId = Number(req.params.id);

    if (
        !Number.isInteger(memberId) ||
        memberId <= 0
    ) {
        return res.status(400).json({
            success: false,
            message: "Member ID must be a positive integer."
        });
    }

    try {
        const [members] = await pool.execute(
            `SELECT id, name, email
             FROM members
             WHERE id = ?`,
            [memberId]
        );

        if (members.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Member not found."
            });
        }

        const [borrowings] = await pool.execute(
            `SELECT
                br.id AS borrowingId,
                br.member_id AS memberId,
                m.name AS memberName,
                br.book_id AS bookId,
                b.title AS bookTitle,
                br.status,
                br.borrowed_at AS borrowedAt,
                br.returned_at AS returnedAt
             FROM borrowings br
             INNER JOIN members m ON m.id = br.member_id
             INNER JOIN books b ON b.id = br.book_id
             WHERE br.member_id = ?
             ORDER BY br.borrowed_at DESC, br.id DESC`,
            [memberId]
        );

        return res.status(200).json({
            success: true,
            member: members[0],
            count: borrowings.length,
            data: borrowings
        });
    } catch (error) {
        console.error("Get member borrowings error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to retrieve borrowing history."
        });
    }
}

module.exports = {
    getBooks,
    borrowBook,
    returnBook,
    getMemberBorrowings
};