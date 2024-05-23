const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
require('dotenv').config();
const axios = require('axios');
const sqlite3 = require("sqlite3").verbose();

languages = {
    "Python": {
        "name": "python",
        "version": "3.9.4"
    },
    "Java": {
        "name": "java",
        "version": "15.0.2"
    },
    "JavaScript": {
        "name": "javascript",
        "version": "20.11.1"
    },
}

const PORT = 3008;
const corsOptions = {
    origin: "*",
    optionsSuccessStatus: 200
};
const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors(corsOptions))
app.listen(PORT);

// validate auth header
function validAuth(auth_header) {
    return auth_header && auth_header.split(" ")[1] == process.env.TOKEN;
}

// landing page
app.get("/", (req, res) => {
    console.log("\nGET /");
    res.send("Code execution server is alive 😊");
});

// evaluate submission
app.post("/eval", (req, res) => {
    console.log("\n\nPOST /eval");
    const auth_header = req.headers.authorization;
    if (!validAuth(auth_header))
        return res.status(401).send();
    if (!req.body)
        return res.status(400);
    console.log(req.body);

    let lang = languages[req.body.Language];
    let params = {
        "language": lang["name"],
        "version": lang["version"],
        "files": [{
            "content": req.body.Code
        }],
        "stdin": ["8\n4"],
        "compile_timeout": 10000,
        "run_timeout": 3000,
        "compile_memory_limit": -1,
        "run_memory_limit": -1,
    }
    axios.post("http://localhost:2000/api/v2/execute", params).then((result) => {
        console.log(result.data);
        return res.send();
    });
    console.log()
});
