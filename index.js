const { v4 } = require('uuid');
const express = require('express');
const app = express();
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const nodemailer = require('nodemailer');
require('dotenv').config();

const {
    serverList,
    thisServerName, 
    pingDelay, 
    pingVariation, 
    port, 
    enableLog, 
    mailOnError 
} = require('./config.json');

// custom write
const writeFile = async (filePath, contents) => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, contents);
}

// logging funtion
const log = (basePath, text, isError=false) => {
    if (!enableLog) return;
    if(enableLog==='error' && !isError)return;
    let date = new Date();
    const folderName = date.toLocaleDateString('en-GB', { timeZone: 'IST' }).replaceAll('/', '_');
    const fileName = date.toLocaleTimeString('en-GB', { timeZone: 'IST' }).replaceAll(':', '_') + '.txt';
    writeFile(path.join(__dirname, basePath, folderName, fileName), text);
}

// mailing function
const mail = async (subject, html) => {
    if (!mailOnError) return;
    const transporter = nodemailer.createTransport({
        host: process.env.NM_HOST,
        port: parseInt(process.env.NM_PORT),
        secure: process.env.NM_SECURE === 'true',
        auth: {
            user: process.env.NM_USER, // generated ethereal user
            pass: process.env.NM_PASS, // generated ethereal password
        },
    });

    await transporter.sendMail({
        from: `"${process.env.NM_SENDERNAME}" <${process.env.NM_SENDEREMAIL}>`, // sender address
        to: process.env.NM_RECIPIENTS, // list of receivers
        subject,
        html
    });
}

// get uuid
app.get('/', (req, res) => {
    const response = v4();
    const ip = req.headers['x-real-ip'] || req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    log(path.join('logs', 'sent'), JSON.stringify({ ip, response }));
    res.send(response);
});

// fetch uuid
const pingServers = async () => {
    const responseList = [];
    serverList.forEach(serverURI => {
        responseList.push(axios.get(serverURI));
    });

    const [...responses] = await Promise.allSettled(responseList);

    const logObj = {};
    const errorObj = {};

    responses.forEach((response, index) => {
        
        if (!response.value || response.value.status!==200) {
            let error = {
                status: response.status,
                reason: response.reason
            }
            logObj[serverList[index]] = error;
            errorObj[serverList[index]] = error;

        } else {
            logObj[serverList[index]] = {
                status: response.value.status,
                body: response.value.data
            }
        }
    });

    const isError = (Object.keys(errorObj).length > 0);
    log(path.join('logs', 'fetch'), JSON.stringify(logObj), isError);
    if(isError){
        log(path.join('logs', 'fetchErrors'), JSON.stringify(errorObj), isError);
        const downServerList = Object.keys(errorObj);
        const subject = `Server${downServerList.length > 1 ? 's': ''} ${downServerList.join(', ')} down.`;
        const HTML = `<h2>Some servers down</h2><br/>
        Detected from ${thisServerName}<br/><br/>
        <h4>Response from servers</h4>
        <div><pre><code>${JSON.stringify(errorObj,null, "\t")}</code></pre></div>
        `;
        mail(subject,HTML);
    }

    setTimeout(pingServers, pingDelay + (Math.random() - 0.5) * pingVariation);
}

pingServers();

app.listen(port);