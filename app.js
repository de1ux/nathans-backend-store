const cors = require('cors');
const express = require('express')
const {Client} = require('pg');

const sentry = require("@sentry/node");
const tracing = require("@sentry/tracing");
const crypto = require("crypto");
const argon2 = require('argon2');

let db;
if (process.env.DATABASE_URL) {
    db = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });
} else {
    db = new Client({
        user: process.env.DATABASE_USER,
        database: process.env.DATABASE_NAME,
        password: process.env.DATABASE_PASSWORD,
        host: process.env.DATABASE_HOST
    });
}

db.connect();

const createTables = async () => {
    await db.query(`
    CREATE TABLE IF NOT EXISTS items (
        name TEXT PRIMARY KEY,
        price INT
    );

    DROP TABLE IF EXISTS users;
    CREATE TABLE IF NOT EXISTS users (
        username TEXT PRIMARY KEY,
        hash TEXT
    );
  `);
}

const getHashByUsername = async (username) => {
    const users = await db.query(`
        SELECT * FROM users WHERE username=$1 LIMIT 1
    `, [username])
    if (users.rowCount === 0) {
        return null
    }
    return users.rows[0].hash;
}

const insertUser = async (username, hash) => {
    await db.query(`
        INSERT INTO users VALUES($1, $2);
    `, [username, hash])
}

const getItems = async () => {
    const items = await db.query("SELECT * FROM items")
    return items.rows;
}

const createServer = () => {
    createTables();

    const app = express()

    sentry.init({
        dsn: "https://179d6731b2ec43dfb80748a67548ed63@o943212.ingest.sentry.io/5892012",
        integrations: [
            // enable HTTP calls tracing
            new sentry.Integrations.Http({tracing: true}),
            // enable Express.js middleware tracing
            new tracing.Integrations.Express({app}),
        ],

        // We recommend adjusting this value in production, or using tracesSampler
        // for finer control
        tracesSampleRate: 1.0,
    });

    app.use(sentry.Handlers.requestHandler());
    app.use(sentry.Handlers.tracingHandler());
    app.use(express.json())
    app.use(cors());


    app.get('/items', async (req, res) => {
        res.send({items: await getItems()})
    });

    app.get('/error', (req, res) => {
        throw new Error("Raising an error!");
    });


    app.post('/signup', async (req, res) => {
        const salt = await crypto.randomBytes(128)

        const hash = await argon2.hash(req.body['password'], {
            salt: salt,
            hashLength: 128,
            parallelism: 4,
            timeCost: 6,
        });
        await insertUser(req.body['username'], hash);

        res.send({result: "ok"});
    });

    app.post('/login', async (req, res) => {
        const hash = await getHashByUsername(req.body['username']);
        console.log(hash);

        const valid = await argon2.verify(hash, Buffer.from(req.body['password']));

        res.send({loggedIn: valid})
    });

    app.use(sentry.Handlers.errorHandler());

    return app
};


module.exports = createServer