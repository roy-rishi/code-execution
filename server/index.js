const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
require("dotenv").config();
const axios = require('axios');
const { Queue } = require('bullmq');
const Worker = require('bullmq').Worker;
const fs = require('node:fs');
const { stderr, stdout } = require("node:process");
const sqlite3 = require("sqlite3").verbose();

const API_URL = process.env.SERVER_URL;

const SERVER_PORT = 3008;

const REDIS_HOST = "localhost";
const REDIS_PORT = 6379;


// connect to db
const exec_db = new sqlite3.Database("db/executions.db", (err) => {
    if (err)
        console.log(err);
    else
        console.log(`Connected to ${"db/executions.db"}`);
});
const team_db = new sqlite3.Database("db/teams.db", (err) => {
    if (err)
        console.log(err);
    else
        console.log(`Connected to ${"db/teams.db"}`);
});
// create table if not exists
exec_db.run(`CREATE TABLE IF NOT EXISTS Executions(
    Key INTEGER PRIMARY KEY AUTOINCREMENT,
    TeamName TEXT NOT NULL,
    Code TEXT NOT NULL,
    Language TEXT NOT NULL,
    Problem TEXT NOT NULL,
    Input TEXT NOT NULL,
    Output TEXT NOT NULL,
    ExpectedOutput TEXT NOT NULL,
    Passes BOOLEAN NOT NULL CHECK (Passes IN (0, 1))
)`, (err) => {
    if (err)
        console.log(err);
});
team_db.run(`CREATE TABLE IF NOT EXISTS Teams(
    TeamName TEXT NOT NULL UNIQUE,
    Email TEXT NOT NULL,
    Division TEXT NOT NULL
)`, (err) => {
    if (err)
        console.log(err);
});

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

const worker = new Worker("queue", async (job) => { await run(job.data) }, {
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
        "version": "3.12.0",
        "timeout": 3000
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

// test cases to be populated from /NCC-2024-Problems/problems
test_cases = {};

class TestCase {
    constructor(input, output, sample, strength) {
        this.input = input;
        this.output = output;
        this.sample = sample;
        this.strength = strength;
    }
}

// validate auth header
function validAuth(auth_header) {
    return auth_header && auth_header.split(" ")[1] == process.env.TOKEN;
}

// main worker function to be queued
async function run(data) {
    console.log("\nSTART");
    let teamName = data["team"];
    let code = data["code"];
    let lang = data["lang"];
    let problem = data["problem"];
    let test_case = data["test case"];

    let params = {
        headers: {
            "Content-Type": "application/json"
        },
        "language": lang["name"],
        "version": lang["version"],
        "files": [{
            "content": code
        }],
        "stdin": test_case.input,
        "run_timeout": lang["timeout"]
        // "compile_timeout": 10000,
        // "compile_memory_limit": -1,
        // "run_memory_limit": -1
    };
    let result = await axios.post(`${API_URL}/execute`, params);
    console.log(result.data);
    let std_output = result.data.run.stdout.trim();
    let std_err = result.data.run.stderr.trim();

    let passes = std_output == test_case.output && std_err == "";
    console.log(passes);
    // if team already submitted this problem, delete past executions
    exec_db.run("DELETE FROM Executions WHERE TeamName = ? AND Problem = ? AND Input = ?", [teamName, problem, test_case.input], (err) => {
        if (err)
            console.log(err);

        exec_db.run(`INSERT INTO Executions(TeamName, Code, Language, Problem, Input, Output, ExpectedOutput, Passes) Values(?, ?, ?, ?, ?, ?, ?, ?) `, [teamName, code, lang["name"], problem, test_case.input, std_output, test_case.output, passes ? 1 : 0], (err) => {
            if (err)
                console.log(err);
        });
    });
}

// queue all test cases for execution
async function evaluate(lang, prob_cases, code, teamName, problem) {
    for (let i = 0; i < prob_cases.length; i++) {
        test_case = prob_cases[i];
        // delay_ms = 500 * (i + 1); // rate limit
        // queue a single test case for execution
        await queue.add(`job${i}`, { "lang": lang, "test case": test_case, "code": code, "team": teamName, "problem": problem }, {
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

// read test cases from repo at /NCC-2024-Problems
function loadTestCases() {
    if (!fs.existsSync("NCC-2024-Problems"))
        throw new Error("Need to clone test cases repo");

    // list all problem directories
    const problemDirs = fs.readdirSync("NCC-2024-Problems/problems");
    console.log("Loading problems...");
    // load test cases from each problem directory
    for (let problemDir of problemDirs) {
        console.log(problemDir);
        try {
            const cases = JSON.parse(fs.readFileSync(`NCC-2024-Problems/problems/${problemDir}/cases.json`, "utf8"));
            // add all test cases from problem
            let problem_cases = [];
            for (let c of cases) {
                problem_cases.push(new TestCase(c["input"], c["output"], c["sample"], c["strength"]));
            }
            test_cases[problemDir] = problem_cases;
        } catch (err) {
            console.log(err);
        }
    }
    console.log("\nLOADED TEST CASES")
    console.log(test_cases);
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

    team_db.all("SELECT * FROM Teams WHERE Email = ? AND TeamName = ?", [req.body.Email, req.body["Team Name"]], (err, rows) => {
        if (err)
            return console.log(err);
        // check if team name and email combo is valid
        if (rows.length > 0) {
            // if problem name is not found, try again after loading test cases
            if (!(req.body.Problem in test_cases)) {
                loadTestCases();
                if (!(req.body.Problem in test_cases))
                    return res.status(400).send("Problem name not found");
            }
            // start evaluation jobs
            evaluate(languages[req.body.Language], test_cases[req.body.Problem], req.body.Code, req.body["Team Name"], req.body.Problem);
            return res.send();
        } else {
            console.log("Invalid team name or email");
            return res.status(400).send("Invalid team name or email");
        }
    });
});

app.post("/update-cases", (req, res) => {
    console.log("\nPOST /update-cases");
    const auth_header = req.headers.authorization;
    if (!validAuth(auth_header))
        return res.status(401).send();

    loadTestCases();
    res.send();
});

app.get("/results", (req, res) => {
    console.log("\n/GET /results");
    const auth_header = req.headers.authorization;
    if (!validAuth(auth_header))
        return res.status(401).send();

    exec_db.all("SELECT * FROM Executions", (err, rows) => {
        if (err)
            return res.status(500).send(err);

        // refresh in-memory test cases
        loadTestCases();
        // loop over all executions, adding points to teams for passed test cases
        let stdResults = {};
        for (let row of rows) {
            let teamName = row["TeamName"];
            let passes = row["Passes"];
            if (!(teamName in stdResults))
                stdResults[teamName] = 0;
            if (passes == 1)
                stdResults[teamName] += 1;
        }
        // sort results
        const sortByValue = (a, b) => b[1] - a[1];
        let sortedResults = Object.entries(stdResults);
        sortedResults.sort(sortByValue);
        console.log("Sorted results");
        console.log(sortedResults);

        return res.send(sortedResults);
    });
});

app.post("/register", (req, res) => {
    console.log("\n/POST /register");
    const auth_header = req.headers.authorization;
    if (!validAuth(auth_header))
        return res.status(401).send();
    console.log(req.body);
    res.send();

    team_db.run("INSERT INTO Teams(TeamName, Email, Division) VALUES (?, ?, ?)", [req.body["Team Name"], req.body.Email, req.body.Division], (err) => {
        if (err)
            console.log(err);
    });
});
