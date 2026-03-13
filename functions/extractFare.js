const axios = require("axios");
const cheerio = require("cheerio");
const { MongoClient } = require("mongodb");

const MONGO_URI = "mongodb://127.0.0.1:27017";

async function collectFareStages() {

    const client = new MongoClient(MONGO_URI);

    try {

        await client.connect();

        const lkbusDB = client.db("LKBusRadar");
        const apiDB = client.db("API_Data");

        const routesCollection = lkbusDB.collection("routes");
        const fareCollection = apiDB.collection("Fare");

        const routes = await routesCollection.find({}).toArray();

        console.log(`Found ${routes.length} routes`);

        for (const route of routes) {

            const routeNumber = route.routeNumber || route.number || route.route;

            if (!routeNumber) continue;

            const url = `https://www.sprpta.lk/farestages.php?routenumber=${routeNumber}`;

            try {

                const res = await axios.get(url);
                const html = res.data;

                const $ = cheerio.load(html);

                const scripts = $("script");

                let scriptContent = "";

                scripts.each((i, el) => {
                    const txt = $(el).html();
                    if (txt && txt.includes("var locations")) {
                        scriptContent = txt;
                    }
                });

                if (!scriptContent) {
                    console.log(`No fare data for route ${routeNumber}`);
                    continue;
                }

                const extract = (name) => {
                    const regex = new RegExp(`var ${name} = (.*?);`);
                    const match = scriptContent.match(regex);
                    return match ? JSON.parse(match[1]) : null;
                };

                const locations = extract("locations");
                const distances = extract("distances");
                const fares = extract("fares");
                const fare_stages = extract("fare_stages");
                const fare_table = extract("fare_table");

                const record = {
                    routeNumber: routeNumber,
                    locations,
                    distances,
                    fares,
                    fare_stages,
                    fare_table,
                    createdAt: new Date()
                };

                await fareCollection.insertOne(record);

                console.log(`Saved fare stages for route ${routeNumber}`);

            } catch (err) {
                console.log(`Error for route ${routeNumber}`);
            }

        }

    } catch (err) {

        console.error(err);

    } finally {

        await client.close();
        console.log("Finished");

    }
}

collectFareStages();