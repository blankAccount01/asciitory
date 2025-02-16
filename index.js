import express from "express";
const app = express();
import fs from 'fs/promises';
import { Filter } from 'bad-words'
const filter = new Filter();
import emojiRegex from 'emoji-regex';
import path from 'path';

const submissionHistory = new Map();

function canSubmit(ip) {
    const lastSubmission = submissionHistory.get(ip);
    if (!lastSubmission) return true;
    
    const oneDayInMs = 24 * 60 * 60 * 1000;
    const timeSinceLastSubmission = Date.now() - lastSubmission;
    return timeSinceLastSubmission >= oneDayInMs;
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.disable('x-powered-by');

app.get("/", (req, res) => {
    res.send("Welcome to the asciitory! Try running curl -S https://asciitory.asgr.me/get/test \n\nGET Commands:\n/get/{name}         GET command to retrieve an ascii picture\n/random             GET command to retrieve a random ascii picture\n/index              GET command to retrieve an directory of all text files\n\nPOST commands:\n/submit             POST command to upload your own ascii art :)\n                    Required fields:\n                        name: The filename of your ascii art\n                        input: Your ascii art");
});

async function readAsciiFile(filename){
    try {
        console.log("./ascii/"+filename+".txt")
        const file = await fs.readFile("./ascii/"+filename+".txt", "utf8");
        console.log(file);
        return file;
    }catch (err){
        if (err.code=='ENOENT'){
            return "This file does not exist, maybe upload your own ascii art here!"
        }
        console.log(err);
        return "error"
    }
}

async function customFilter(data){
    const isProfane = filter.isProfane(data);
    const emojiregex = emojiRegex();
    const unicodeRegex = /[^a-zA-Z0-9.]/g;
    const length = data.length;
    if (isProfane){
        return "Err Profane input detected! 😰"
    }else if (emojiregex.test(data)){
        return "Err Emoji filenames are not permitted as input"
    }else if (unicodeRegex.test(data)){
        return "Err Only alphanumeric input is accepted"
    }else if (length>50){
        return "Err Filname input too long"
    }else{
        return data.replace(/[^a-zA-Z0-9.]/g, '_'); //Just in case 😉
    } 
}

async function asciiArtFilter(data){
    if (data == undefined){
        return " "
    }
    const withNewlines = data.replace(/\\n/g, '\n');
    const asciiArtChars = /[^ @#\$%\^&\*\+\-\/\\\|_=;:'"`~.,()[\]{}<>\n]/g;
    return withNewlines.replace(asciiArtChars, '');
}

app.get("/get/:name", async (req, res) => {
    const data = req.params.name;
    const filtered = await customFilter(data,res)
    if(filtered.slice(0, 3)!="Err"){
        const fileOutput = await readAsciiFile(filtered);
        res.send(fileOutput);
    }else{
        res.status(400).send(filtered.slice(4));
    }
    
});

app.get("/index", async (req,res)=>{
    const sortByDate = req.body.sortByDate === 'true';
    res.send(await directoryfiles('./ascii', sortByDate));
})

app.post("/submit", async (req, res) => {
    const rawData = req.body;
    const fileName = rawData.name;
    const fileInput = rawData.input;
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    
    if (!canSubmit(clientIp)) {
        res.status(429).send('You can only submit once per day. Check back tomorrow :D');
        return;
    }
    
    if (fileName==undefined){
        res.status(400).send("Missing file name field")
        return;
    }else if(fileInput==undefined){
        res.status(400).send("Missing file input field")
        return;
    }
    
    const filtered = await customFilter(fileName);
    if(filtered.slice(0, 3) === "Err") {
        res.status(400).send(filtered.slice(4));
        return;
    }
    
    const inputFiltered = await asciiArtFilter(fileInput);
    try {
        const filePath = path.join('ascii', filtered + '.txt');
        
        try {
            await fs.access(filePath);
            res.status(400).send('A file with this name already exists, please choose a different one :|');
            return;
        } catch {
            await fs.writeFile(filePath, inputFiltered);
        }
        submissionHistory.set(clientIp, Date.now());
        res.json({ message: 'File created successfully' });
    } catch (err) {
        console.error('Error writing file:', err);
        res.status(500).send('Error creating file');
    }
});

async function directoryfiles(directoryPath, sortByDate = false) {
    try {
        const files = await fs.readdir(directoryPath);
        const fileInfo = await Promise.all(
            files.map(async (file) => {
                const filePath = path.join(directoryPath, file);
                const stat = await fs.stat(filePath);
                return stat.isFile() ? {
                    name: file,
                    time: stat.time
                } : null;
            })
        );
        const filteredFiles = fileInfo.filter(Boolean);
        
        if (sortByDate) {
            filteredFiles.sort((a, b) => b.time - a.time);
            return filteredFiles.map(file => file.name);
        }
        
        return filteredFiles.map(file => file.name).sort();
    } catch (err) {
        console.error('Error reading directory:', err);
    }
}

app.get("/random", async (req,res) => {
    const fileList = await directoryfiles('./ascii');
    const random = Math.floor(Math.random() * fileList.length);
    const fileOutput = await readAsciiFile(fileList[random].slice(0, -4));
    res.send(fileOutput);
});

app.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});
