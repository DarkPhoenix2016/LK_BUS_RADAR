const axios = require("axios");
const cheerio = require("cheerio");
const { MongoClient } = require("mongodb");

const MONGO_URI = "mongodb://127.0.0.1:27017";

async function collectSchedules() {

    const client = new MongoClient(MONGO_URI);

    try {

        await client.connect();

        const lkbusDB = client.db("LKBusRadar");
        const apiDB = client.db("API_Data");

        const routesCollection = lkbusDB.collection("routes");
        const scheduleCollection = apiDB.collection("Schedules");

        const routes = await routesCollection.find({}).toArray();

        console.log(`Found ${routes.length} routes`);

        for (const route of routes) {

            const routeNumber = route.routeNumber || route.number || route.route;

            if (!routeNumber) continue;

            const url = `https://www.sprpta.lk/schedulebyrouteall.php?routenumber=${routeNumber}`;

            try {

                const res = await axios.get(url);
                const html = res.data;

                const $ = cheerio.load(html);

                const scheduleSections = $(".schedule-section");

                let slots = [];

                scheduleSections.each((i, section) => {

                    const station = $(section).find(".location-name").text().trim();

                    $(section).find(".hour-block").each((j, hourBlock) => {

                        const hour = $(hourBlock).find(".hour-display").text().trim();

                        $(hourBlock).find(".minute-display").each((k, minuteEl) => {

                            const minute = $(minuteEl).text().trim();

                            const isCTB = $(minuteEl).hasClass("ctb-minute");

                            const busType = isCTB ? "CTB" : "PRIVATE";

                            const time = `${hour}:${minute.padStart(2, "0")}`;

                            slots.push({
                                station,
                                busType,
                                time
                            });

                        });

                    });

                });

                const record = {
                    routeNumber,
                    slots,
                    createdAt: new Date()
                };

                await scheduleCollection.updateOne(
                    { routeNumber },
                    { $set: record },
                    { upsert: true }
                );

                console.log(`Saved schedule for route ${routeNumber}`);

            } catch (err) {

                console.log(`Failed route ${routeNumber}`);

            }

        }

    } catch (err) {

        console.error(err);

    } finally {

        await client.close();
        console.log("Finished schedule scraping");

    }
}

collectSchedules();