module.exports = function(
    db,
    userId,
    callback = null
) {

    db.get(
        "SELECT * FROM users WHERE userId = ?",
        [userId],

        (err, row) => {

            if (!row) {

                db.run(
                    `INSERT INTO users (userId)
                    VALUES (?)`,
                    [userId],
                    () => {

                        if (callback)
                            callback();
                    }
                );

            } else {

                if (callback)
                    callback();
            }
        }
    );
};