USE library_api;

INSERT INTO books (id, title, total_copies, available_copies)
VALUES
    (101, 'Code Basic', 2, 2),
    (102, 'Web Starter', 1, 1),
    (103, 'Database Intro', 1, 1),
    (104, 'API Design', 1, 1);

INSERT INTO members (name, email)
VALUES
    ('Alex Silva', 'alex@example.com'),
    ('Sam Perera', 'sam@example.com');