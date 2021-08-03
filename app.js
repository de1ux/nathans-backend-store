const cors = require('cors');
const express = require('express')
const { Client } = require('pg');

const db = new Client({
  user: process.env.DATABASE_USER,
  database: process.env.DATABASE_NAME,
  password: process.env.DATABASE_PASSWORD,
  host: process.env.DATABASE_HOST
})
db.connect();

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
  app.use(express.json())
  app.use(cors());

  app.get('/items', async (req, res) => {
    res.send({items: await getItems()})
  })

  return app
};


module.exports = createServer