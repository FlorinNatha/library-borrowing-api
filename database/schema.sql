CREATE DATABASE IF NOT EXISTS library_api;

USE library_api;

CREATE TABLE IF NOT EXISTS books (
    id INT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    total_copies INT NOT NULL,
    available_copies INT NOT NULL,

    CONSTRAINT chk_book_total
        CHECK (total_copies >= 0),

    CONSTRAINT chk_book_available
        CHECK (
            available_copies >= 0
            AND available_copies <= total_copies
        )
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS members (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS borrowings (
    id INT AUTO_INCREMENT PRIMARY KEY,

    member_id INT NOT NULL,
    book_id INT NOT NULL,

    status ENUM('borrowed', 'returned')
        NOT NULL DEFAULT 'borrowed',

    borrowed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    returned_at DATETIME NULL,

    CONSTRAINT fk_borrowing_member
        FOREIGN KEY (member_id)
        REFERENCES members(id),

    CONSTRAINT fk_borrowing_book
        FOREIGN KEY (book_id)
        REFERENCES books(id),

    CONSTRAINT chk_borrowing_dates
        CHECK (
            (status = 'borrowed' AND returned_at IS NULL)
            OR
            (status = 'returned' AND returned_at IS NOT NULL)
        ),

    INDEX idx_member_status (member_id, status),
    INDEX idx_member_book_status (member_id, book_id, status)
) ENGINE=InnoDB;