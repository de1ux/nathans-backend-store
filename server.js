const createServer = require("./app");

let port = process.env.PORT;
if (!port) {
  port = 3000;
}

let app = createServer();

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`)
});