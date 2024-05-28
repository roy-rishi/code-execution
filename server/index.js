const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
require("dotenv").config();
const axios = require('axios');
const { Queue } = require('bullmq');
const Worker = require('bullmq').Worker;
const sqlite3 = require("sqlite3").verbose();

const API_URL = process.env.SERVER_URL;

const SERVER_PORT = 3008;

const REDIS_HOST = "localhost";
const REDIS_PORT = 6379;

// init server
const corsOptions = {
    origin: "*",
    optionsSuccessStatus: 200
};
const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors(corsOptions))
app.listen(SERVER_PORT);

const queue = new Queue("queue", {
    connection: {
        host: REDIS_HOST,
        port: REDIS_PORT
    }
});

const worker = new Worker("queue", async (job) => {await run(job.data) }, {
    connection: {
        host: REDIS_HOST,
        port: REDIS_PORT
    },
    limiter: {
        max: 1,
        duration: 400
    }
});

// listen for completion
worker.on('completed', job => {
    console.log(`${job.id} has completed!`);
});

// listen for failure
worker.on('failed', (job, err) => {
    console.log(`${job.id} has failed with ${err.message}`);
});

// language params
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

// TODO: move and .gitignore
test_cases = {
    "S3 - Addition": [{
        "in": "4\n8",
        "out": "12"
    }, {
        "in": "3\n-1",
        "out": "2"
    }, {
        "in": "3\n-1",
        "out": "2"
    }, {
        "in": "3\n-1",
        "out": "2"
    }, {
        "in": "3\n-1",
        "out": "2"
    }, {
        "in": "3\n-1",
        "out": "2"
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

// validate auth header
function validAuth(auth_header) {
    return auth_header && auth_header.split(" ")[1] == process.env.TOKEN;
}

// main worker function to be queued
async function run(data) {
    console.log("START");
    let lang = data["lang"];
    let test_case = data["test case"];
    let code = data["code"];

    let params = {
        headers: {
            "Content-Type": "application/json"
        },
        "language": lang["name"],
        "version": lang["version"],
        "files": [{
            "content": code
        }],
        "stdin": test_case["in"],
        "run_timeout": lang["timeout"]
        // "compile_timeout": 10000,
        // "compile_memory_limit": -1,
        // "run_memory_limit": -1
    };
    let result = await axios.post(`${API_URL}/execute`, params);
    console.log(result.data);
    let std_output = result.data.run.stdout.trim();
    let std_err = result.data.run.stderr.trim();

    // return std_output == test_case["out"] && std_err == "";
    // TODO: add result to database
    console.log(std_output == test_case["out"] && std_err == "");
}

// queue all test cases for execution
async function evaluate(lang, test_cases, code) {
    for (let i = 0; i < test_cases.length; i++) {
        test_case = test_cases[i];
        // delay_ms = 500 * (i + 1); // rate limit
        // queue a single test case for execution
        await queue.add(`job${i}`, { "lang": lang, "test case": test_case, "code": code }, {
            // retry failed jobs
            attempts: 3,
            backoff: {
                type: "exponential",
                delay: 1000
            },
            removeOnComplete: true,
            removeOnFail: true
        });
    }
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
    res.send()
    console.log(req.body);

    evaluate(languages[req.body.Language], test_cases[req.body.Problem], req.body.Code);
});
