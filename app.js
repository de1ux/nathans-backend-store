const cors = require('cors');
const express = require('express')
const {Client} = require('pg');
const jwt = require('express-jwt');
const jwksRsa = require('jwks-rsa');

const sentry = require("@sentry/node");
const tracing = require("@sentry/tracing");

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


const auth0Domain = "https://careers-in-code-test-practice.us.auth0.com"

const checkJwt = jwt({
  // Dynamically provide a signing key
  // based on the kid in the header and
  // the signing keys provided by the JWKS endpoint.
  secret: jwksRsa.expressJwtSecret({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 5,
    jwksUri: `${auth0Domain}/.well-known/jwks.json`
  }),

  audience: `https://my-backend.com/api/v1`,
  issuer: [`${auth0Domain}/`],
  algorithms: ['RS256']
});


const createItemTable = async () => {
    await db.query(`
    CREATE TABLE IF NOT EXISTS items (
        name TEXT PRIMARY KEY,
        price INT
    );
  `);
}

const getItems = async () => {
    const items = await db.query("SELECT * FROM items")
    return items.rows;
}

const createServer = () => {
    createItemTable();

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


    app.get('/items', checkJwt, async (req, res) => {
        res.send({items: await getItems()})
    })

    app.get('/error', (req, res) => {
        throw new Error("Raising an error!");
    })

    app.use(sentry.Handlers.errorHandler());

    return app
};


module.exports = createServer