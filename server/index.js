const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
require('dotenv').config();
const axios = require('axios');
const { Queue } = require('bullmq');
const Worker = require('bullmq').Worker;
require("dotenv").config();
const sqlite3 = require("sqlite3").verbose();

var SERVER_URL = process.env.SERVER_URL;

// create execution queue
const execution_queue = new Queue("exec", {
    connection: {
        host: "localhost",
        port: 6379
    },
    limiter: {
        max: 5
    }
});
// create worker
const worker = new Worker("exec", async job => {
    console.log(job.data);
}, {
    connection: {
        host: "localhost",
        port: 6379
    }
});
// add jobs to queue
async function addJobs() {
    await execution_queue.add("myJobName", { exec: "bar" });
    await execution_queue.add("myJobName", { qux: "baz" });
}
addJobs();

languages = {
    "Python": {
        "name": "python",
        "version": "3.10.0",
        "timeout": 4000
    },
    "Java": {
        "name": "java",
        "version": "15.0.2",
        "timeout": 4000
    },
    "JavaScript": {
        "name": "javascript",
        "version": "18.15.0",
        "timeout": 4000
    },
    "TypeScript": {
        "name": "typescript",
        "version": "5.0.3",
        "timeout": 4000
    },
    "C++": {
        "name": "c++",
        "version": "10.2.0",
        "timeout": 4000
    },
    "C": {
        "name": "c",
        "version": "10.2.0",
        "timeout": 4000
    },
    "C#": {
        "name": "csharp.net",
        "version": "5.0.201",
        "timeout": 4000
    },
    "Ruby": {
        "name": "ruby",
        "version": "3.0.1",
        "timeout": 4000
    }
};

test_cases = {
    "S3 - Addition": [{
        "in": "4\n8",
        "out": "12"
    }],
    "A1": [{
        "in": "a b c\nr a b",
        "out": "a"
    }, {
        "in": "a b c d\nz w x y",
        "out": ""
    }, {
        "in": "a b c d\nb c d a",
        "out": "d"
    }]
};

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
    let tests = test_cases[req.body.Problem][0];
    let params = {
        headers: {
            "Content-Type": "application/json"
        },
        "language": lang["name"],
        "version": lang["version"],
        "files": [{
            "content": req.body.Code
        }],
        "stdin": tests["in"],
        "run_timeout": lang["timeout"]
        // "compile_timeout": 10000,
        // "compile_memory_limit": -1,
        // "run_memory_limit": -1
    };
    axios.post(`${SERVER_URL}/execute`, params).then((result) => {
        console.log(result.data);
        let std_output = result.data.run.stdout.trim();
        console.log(`  OUT ${std_output}`);
        return res.send();
    });
});
