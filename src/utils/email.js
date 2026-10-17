const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    jsonTransport: true
});

async function sendBorrowingConfirmation({
    memberName,
    memberEmail,
    bookTitle,
    borrowingId
}) {
    const info = await transporter.sendMail({
        from: '"Library System" <library@example.local>',
        to: memberEmail,
        subject: "Library Borrowing Confirmation",
        text: [
            `Hello ${memberName},`,
            "",
            `Your borrowing of "${bookTitle}" was successful.`,
            `Borrowing ID: ${borrowingId}`,
            "",
            "Thank you for using the library."
        ].join("\n")
    });

    console.log("\n========== EMAIL CONFIRMATION ==========");
    console.log(info.message.toString());
    console.log("========================================\n");
}

module.exports = { sendBorrowingConfirmation };