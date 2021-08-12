const cors = require('cors');
const express = require('express')
const {Client} = require('pg');

const sentry = require("@sentry/node");
const tracing = require("@sentry/tracing");
const jwt = require("express-jwt");
const jwksRsa = require("jwks-rsa");
const axios = require("axios");
const jwtAuthz = require("express-jwt-authz");
const argon2 = require("argon2");
const crypto = require("crypto");

const cache = {}

const auth0Domain = 'https://dev-lifxamti.auth0.com';

const checkJwt = jwt({
    secret: jwksRsa.expressJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `${auth0Domain}/.well-known/jwks.json`
    }),

    audience: `https://nathans-backend.herokuapp.com/`,
    issuer: [`${auth0Domain}/`],
    algorithms: ['RS256']
});


const checkPermissions = (permissions) => {
    return jwtAuthz(permissions, {
        customScopeKey: "permissions",
        checkAllScopes: true,
        failWithError: true
    });
};


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
    
    CREATE TABLE IF NOT EXISTS users (
        username TEXT PRIMARY KEY, 
        hash TEXT    
   )
  `);
}

const createUser = async (username, password) => {
    await db.query(`
        INSERT INTO users VALUES($1, $2);
    `, [username, password])
}

const getHashByUsername = async (username) => {
    const users = await db.query(`
        SELECT hash FROM users WHERE username=$1 LIMIT 1;
    `, [username])

    return users.rows[0].hash
}

const getItems = async () => {
    const items = await db.query("SELECT * FROM items")
    return items.rows;
}

const getUserData = async (req) => {
    const accessToken = req.header('Authorization');
    if (cache[accessToken]) {
        return cache[accessToken]
    }

    const userInfo = await axios.get(`${auth0Domain}/userinfo`, {
        headers: {
            "Authorization": accessToken
        }
    }).then(d => d.data);

    cache[accessToken] = userInfo

    return userInfo

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

    app.post("/signup", async (req, res) => {
        const username = req.body['username'];
        const password = req.body['password'];

        const salt = await crypto.randomBytes(32)
        const hash = await argon2.hash(password, {
            salt: salt
        })

        await createUser(username, hash);

        res.send({'result': 'ok'});
    })

    app.post("/login", async (req, res) => {
        const username = req.body['username'];
        const password = req.body['password'];

        const hash = await getHashByUsername(username)
        const isValid = await argon2.verify(hash, Buffer.from(password))

        res.send({loggedIn: isValid});
    });

    app.use(sentry.Handlers.errorHandler());

    app.use((err, req, res, next) => {
        console.error(err)
        next(err)
    });

    return app
};


module.exports = createServer