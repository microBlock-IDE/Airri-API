const express = require("express");
const bodyParser = require('body-parser');
const { InfluxDB, Point, HttpError } = require('@influxdata/influxdb-client')

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

const INFLUX_URL = process.env.INFLUX_URL;
const INFLUX_TOKEN = process.env.INFLUX_TOKEN;
const INFLUX_ORG = process.env.INFLUX_ORG;
const INFLUX_BUCKET = process.env.INFLUX_BUCKET;

const APP_PORT = 841;

const app = express();

app.use(express.urlencoded({
    extended: true
})); //Parse URL-encoded bodies

// create application/json parser
var jsonParser = bodyParser.json();

app.post("/data/:mac_address", jsonParser, (req, res) => {
    const { mac_address } = req.params;
    const dataIn = req.body;

    // Check device has on System


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
    console.log(+new Date(), dataPoint);

    writeApi
        .close()
        .then(() => {
            res.status(200).json({ min_interval: 30 });
        })
        .catch(e => {
            console.error(e)
            res.status(500).json({ err: e.toString(), min_interval: 30 });
        });
});

app.listen(APP_PORT, () => {
    console.log(`Start server at port ${APP_PORT}.`);
});
