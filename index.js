const express = require("express");
const bodyParser = require('body-parser');
const { InfluxDB, Point, HttpError } = require('@influxdata/influxdb-client')
const { Pool, Client } = require('pg');

const fieldAllow = [
    "temp",
    "humi",
    "pressure",
    "light",
    "uv",
    "pm010",
    "pm025",
    "pm100",
    "wind_speed",
    "wind_dir",
    "rain",
    "co2",
];

// Environment from .env file
require('dotenv').config();

const APP_PORT = 841;

const {
    INFLUX_URL,
    INFLUX_TOKEN,
    INFLUX_ORG,
    INFLUX_BUCKET,

    POSTGRES_HOST,
    POSTGRES_PORT,
    POSTGRES_USERNAME,
    POSTGRES_PASSWORD,
    POSTGRES_DATABASE
} = process.env;

const pool = new Pool({
    host: POSTGRES_HOST,
    port: POSTGRES_PORT,
    user: POSTGRES_USERNAME,
    password: POSTGRES_PASSWORD,
    database: POSTGRES_DATABASE,
});

let client;

const app = express();

app.use(express.urlencoded({
    extended: true
})); //Parse URL-encoded bodies

// create application/json parser
var jsonParser = bodyParser.json();

app.post("/data/:mac_address", jsonParser, async (req, res) => {
    const { mac_address } = req.params;
    const dataIn = req.body;

    // Check device has on System and Update device info
    let deviceInfo;
    try {
        deviceInfo = await client.query(
            'UPDATE public.devices SET last_push = NOW(), location = $1, aqi = $2 WHERE mac_address = $3;', 
            [ dataIn.location, dataIn.aqi, mac_address ]
        );
    } catch(e) {
        res.status(500).json({ err: e.toString(), min_interval: 30 });
        return;
    }
    if (deviceInfo.rowCount <= 0) {
        res.status(401).json({ error: "device not found", min_interval: 30 });
        return;
    }

    // Put data into InfluxDB
    const writeApi = new InfluxDB({ 
        url: INFLUX_URL, 
        token: INFLUX_TOKEN, 
    }).getWriteApi(INFLUX_ORG, INFLUX_BUCKET, 'ns');
    
    // setup default tags for all writes through this API
    writeApi.useDefaultTags({ mac_address: "unknow" });

    let dataPoint = new Point("station");
    dataPoint = dataPoint.tag("mac_address", mac_address);
    for (const field_name of fieldAllow) {
        if (typeof dataIn[field_name] === "number") {
            dataPoint = dataPoint.floatField(field_name, dataIn[field_name]);
        }
    }
    writeApi.writePoint(dataPoint);
    // console.log(+new Date(), dataPoint);

    writeApi
        .close()
        .then(() => {
            res.status(201).json({ min_interval: 30 });
        })
        .catch(e => {
            console.error(e)
            res.status(500).json({ err: e.toString(), min_interval: 30 });
        });
});

pool.connect().then(c => {
    client = c;
    
    app.listen(APP_PORT, () => {
        console.log(`Start server at port ${APP_PORT}.`);
    });
});
